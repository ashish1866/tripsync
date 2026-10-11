// Slop guard: part of `npm run check` (Step 1.6 in docs/TASKS.md, Motion group from Step 11).
//
// Reads the website's source (client/src and client/index.html) and fails on the
// banned values in .kiro/steering/design.md: purple colours, gradients, shadows
// other than the focus ring, banned fonts, alert()/confirm(), template leftovers,
// emoji, brochure or generic button copy, and AI-slop motion.
//
// - Code values (colours, gradients, fonts and so on) are searched in every line,
//   comments included.
// - Copy phrases ("Get started", "Submit" and so on) are searched only in text a
//   visitor can see or hear: JSX text and string literals (found with a real
//   JavaScript parser, so comments and code names are ignored), HTML text, and CSS
//   `content:` strings. Matching is case-sensitive, so `onSubmit` never trips it.
// - Motion is read rule by rule from the CSS (keyframes, transitions, timings,
//   :hover) and from the JavaScript (who starts animations, what is imported).
//
// Exception: a line that ends with the comment `slop-ok: <reason>` is skipped, but
// only if that exact reason is also written in docs/DESIGN-DECISIONS.md.
//
// On its own:   node checks/slopGuard.mjs
// Self-test:    node checks/slopGuard.mjs --self-test   (part of `npm test`: proves every motion rule fires)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from 'acorn';
import jsx from 'acorn-jsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['client/src'];
const SCAN_FILES = ['client/index.html', 'client/package.json'];
const EXTENSIONS = new Set(['.js', '.jsx', '.css', '.html']);

const GROUP = {
  colour: 'Colours: no purple, indigo or violet',
  surface: 'Surfaces: no gradients, clipped text, glass blur, or shadows other than the focus ring',
  font: 'Fonts: no Inter, Roboto, Arial, Open Sans or system font',
  leftovers: 'No alert()/confirm() dialogs or template leftovers (lorem, TODO, "Vite + React")',
  emoji: 'No emoji',
  copy: 'Copy: no brochure words or generic button labels in visible text',
  motion: 'Motion: transform and opacity only, timings from tokens, a calm version in every file, no slop motion',
};

// The only box-shadow values allowed: none, and the shared focus ring.
const ALLOWED_SHADOWS = new Set(['none', 'var(--focus)']);
const shadowAllowed = (value) => ALLOWED_SHADOWS.has(value.replace(/!important/, '').trim());

// Searched in every line of every scanned file.
const CODE_RULES = [
  { group: GROUP.colour, pattern: /indigo|violet|purple/gi },
  { group: GROUP.surface, pattern: /(?:linear|radial|conic)-gradient/g },
  { group: GROUP.surface, pattern: /bg-clip-text|text-transparent|background-clip\s*:\s*text/g },
  { group: GROUP.surface, pattern: /backdrop-filter|backdropFilter/g },
  { group: GROUP.surface, pattern: /box-shadow\s*:\s*([^;}]+)/g, allow: (m) => shadowAllowed(m[1]) },
  { group: GROUP.surface, pattern: /boxShadow\s*:\s*(['"`])(.*?)\1/g, allow: (m) => shadowAllowed(m[2]) },
  { group: GROUP.font, pattern: /\b(?:Inter|Roboto|Arial)\b|Open Sans|system-ui|-apple-system|BlinkMacSystemFont/g },
  { group: GROUP.leftovers, pattern: /\b(?:alert|confirm)\s*\(/g },
  { group: GROUP.leftovers, pattern: /lorem|\bTODO\b|Vite \+ React/g },
  // Every emoji except (c), (R) and TM, which are ordinary text (the map needs "© OpenStreetMap").
  { group: GROUP.emoji, pattern: /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}/gu },
];

// Searched only in visible text. Lower-case words are also checked capitalised,
// because they start sentences ("Unlock ...").
const BASE_PHRASES = ['Get started', 'Learn more', 'Submit', 'Click here', 'seamless', 'effortless', 'elevate', 'unlock', 'Oops'];
const PHRASES = BASE_PHRASES.flatMap((p) => (/^[a-z]/.test(p) ? [p, p[0].toUpperCase() + p.slice(1)] : [p]));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHRASE_PATTERN = new RegExp(`(?<![A-Za-z])(?:${PHRASES.map(escapeRegex).join('|')})`, 'g');

// JSX attributes whose string values are code, not something a visitor sees.
const TECHNICAL_ATTRIBUTES = new Set([
  'className', 'type', 'autoComplete', 'inputMode', 'id', 'htmlFor', 'to', 'href', 'rel', 'target', 'role',
  'name', 'key', 'method', 'lang', 'src', 'variant', 'size', 'tone', 'as', 'viewBox', 'fill', 'stroke',
  'strokeWidth', 'strokeLinejoin', 'strokeLinecap', 'd', 'focusable', 'aria-hidden', 'aria-live', 'aria-invalid',
  'aria-describedby', 'aria-controls', 'aria-pressed', 'aria-busy', 'aria-labelledby',
]);

// `/* slop-ok: reason */`, `// slop-ok: reason`, `{/* slop-ok: reason */}` or `<!-- slop-ok: reason -->` at the end of a line.
const SLOP_OK = /(?:\/\/|\/\*|<!--)\s*slop-ok:\s*(.*?)\s*(?:\*\/\s*\}?|-->)?\s*$/;

function listFiles() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (EXTENSIONS.has(path.extname(name))) files.push(full);
    }
  };
  SCAN_DIRS.forEach((d) => walk(path.join(root, d)));
  SCAN_FILES.forEach((f) => files.push(path.join(root, f)));
  return files.sort();
}

// ---------- visible text: each piece is { text, line } where line is where the text starts ----------

const JsxParser = acorn.Parser.extend(jsx());
const parseJs = (source) => JsxParser.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });

// Calls fn(node, parent, key) for every node of an acorn tree.
function walkAst(node, fn, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return;
  if (fn(node, parent, key) === false) return;
  for (const [childKey, value] of Object.entries(node)) {
    if (childKey === 'loc') continue;
    if (Array.isArray(value)) value.forEach((child) => walkAst(child, fn, node, childKey));
    else if (value && typeof value === 'object') walkAst(value, fn, node, childKey);
  }
}

function visibleTextFromJs(ast) {
  const pieces = [];
  walkAst(ast, (node, parent, key) => {
    // Values of technical attributes (className="...", type="submit") are not shown.
    if (node.type === 'JSXAttribute' && TECHNICAL_ATTRIBUTES.has(node.name?.name)) return false;
    if (node.type === 'JSXText') {
      pieces.push({ text: node.raw ?? node.value, line: node.loc.start.line });
    } else if (node.type === 'Literal' && typeof node.value === 'string') {
      const isModulePath = key === 'source';
      const isObjectKey = key === 'key' && parent?.type === 'Property' && !parent.computed;
      const isDirective = parent?.type === 'ExpressionStatement' && parent.directive;
      if (!isModulePath && !isObjectKey && !isDirective) pieces.push({ text: node.raw, line: node.loc.start.line });
    } else if (node.type === 'TemplateElement') {
      pieces.push({ text: node.value.raw, line: node.loc.start.line });
    }
    return true;
  });
  return pieces;
}

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

// Replaces a matched region with spaces, keeping its line breaks, so line numbers stay right.
const blankOut = (s) => s.replace(/[^\n]/g, ' ');

function visibleTextFromHtml(source) {
  const text = source.replace(/<!--[\s\S]*?-->/g, blankOut).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, blankOut);
  const pieces = [];
  for (const m of text.matchAll(/\b(?:content|alt|title|aria-label|placeholder)\s*=\s*(["'])(.*?)\1/g)) {
    pieces.push({ text: m[2], line: lineAt(text, m.index) });
  }
  for (const m of text.matchAll(/>([^<]+)</g)) {
    pieces.push({ text: m[1], line: lineAt(text, m.index + 1) });
  }
  return pieces;
}

function visibleTextFromCss(source) {
  return [...source.matchAll(/content\s*:\s*(['"])(.*?)\1/g)].map((m) => ({ text: m[2], line: lineAt(source, m.index) }));
}

// ---------- motion ----------

// Every innermost CSS block: { prelude, line, parents: [outer preludes], decls: [{ prop, value, line }] }.
// TripSync's CSS has no nesting, so a block with child blocks (@media, @keyframes) holds no declarations.
function cssRules(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, blankOut);
  const rules = [];
  const stack = [];
  let preludeStart = 0;
  let line = 1;
  let preludeLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') line++;
    if (c === '{') {
      if (stack.length) stack[stack.length - 1].hasChild = true;
      const before = text.slice(preludeStart, i);
      const lead = before.length - before.trimStart().length;
      stack.push({ prelude: before.trim(), start: i + 1, line: preludeLine + (before.slice(0, lead).match(/\n/g) || []).length, bodyLine: line, hasChild: false });
      preludeStart = i + 1;
      preludeLine = line;
    } else if (c === '}') {
      const block = stack.pop();
      if (block && !block.hasChild) {
        const body = text.slice(block.start, i);
        const decls = [];
        let offset = 0;
        for (const part of body.split(';')) {
          const colon = part.indexOf(':');
          if (colon > 0) {
            const lead = part.slice(0, part.length - part.trimStart().length);
            decls.push({
              prop: part.slice(0, colon).trim().toLowerCase(),
              value: part.slice(colon + 1).trim(),
              line: block.bodyLine + ((body.slice(0, offset) + lead).match(/\n/g) || []).length,
            });
          }
          offset += part.length + 1;
        }
        rules.push({ prelude: block.prelude, line: block.line, parents: stack.map((s) => s.prelude), decls });
      }
      preludeStart = i + 1;
      preludeLine = line;
    }
  }
  return rules;
}

// Splits "a 1s, b var(--x)" on commas that are not inside brackets.
function topLevelParts(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (value[i] === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

const MOTION_OK_IN_KEYFRAMES = new Set(['transform', 'opacity', 'animation-timing-function']);
const MOVABLE = new Set(['transform', 'opacity']);
const TIMING_PROPS = new Set([
  'animation', 'animation-duration', 'animation-delay', 'animation-timing-function',
  'transition', 'transition-duration', 'transition-delay', 'transition-timing-function',
]);
// A time that is not zero: 120ms, .7s, 1.6s (0ms and 0s mean "no motion" and are allowed).
const RAW_TIME = /(?<![\w.-])(?!0+(?:\.0+)?(?:ms|s)\b)\d*\.?\d+(?:ms|s)\b/;
const RAW_EASING = /cubic-bezier\(|steps\(|(?<![\w-])(?:ease-in-out|ease-in|ease-out|ease|linear|step-start|step-end)(?![\w-])/;
// Names that give away the usual decorative loops.
const SLOP_KEYFRAMES = /shimmer|pulse|bounce|float|marquee|typewriter|typing|confetti|wiggle|shake|glow|blink|spin|count-?up/i;
// The one loop in TripSync: the road dash ("still working").
const LOOP_ALLOWED = new Set(['client/src/components/RoadDashes.module.css']);
const TOKENS_FILE = 'client/src/styles/tokens.css';
const HELPER_FILE = 'client/src/utils/motion.js';
// Motion, count-up, typewriter and confetti libraries: none of them earns its weight here.
const MOTION_LIBRARIES = /^(?:framer-motion|motion|motion\/.*|react-spring|@react-spring\/.*|gsap|gsap\/.*|animejs|animejs\/.*|lottie-web|lottie-react|@lottiefiles\/.*|aos|countup\.js|react-countup|typed\.js|react-type-animation|typewriter-effect|canvas-confetti|react-confetti|animate\.css|react-transition-group|@formkit\/auto-animate|react-awesome-reveal|react-intersection-observer|react-scroll-parallax|@studio-freight\/lenis|lenis)$/;
const RECHARTS_ANIMATED = new Set(['Bar', 'Line', 'Area', 'Pie', 'Radar', 'RadialBar', 'Scatter', 'Funnel', 'Treemap', 'Sankey']);

function motionInCss(rel, source, report) {
  const isTokens = rel === TOKENS_FILE;
  const rules = cssRules(source);
  const hasCalmBlock = /@media[^{]*prefers-reduced-motion\s*:\s*reduce/.test(source);
  let firstMotionLine = 0;

  for (const rule of rules) {
    const keyframes = rule.parents.find((p) => p.startsWith('@keyframes'));
    if (keyframes) {
      for (const d of rule.decls) {
        if (!MOTION_OK_IN_KEYFRAMES.has(d.prop)) report(d.line, `${keyframes} animates "${d.prop}" (only transform and opacity)`);
      }
      continue;
    }
    const inCalmBlock = rule.parents.some((p) => /prefers-reduced-motion\s*:\s*reduce/.test(p));
    for (const d of rule.decls) {
      const value = d.value.replace(/!important/, '').trim();
      // What may move
      if (d.prop === 'transition' && value !== 'none') {
        for (const part of topLevelParts(value)) {
          const property = part.split(/\s+/)[0];
          if (!MOVABLE.has(property)) report(d.line, `transition on "${property}" (only transform and opacity)`);
        }
      }
      if (d.prop === 'transition-property') {
        for (const property of topLevelParts(value)) if (!MOVABLE.has(property) && property !== 'none') report(d.line, `transition-property "${property}"`);
      }
      // Timings and easings come from tokens.css
      if (!isTokens && (TIMING_PROPS.has(d.prop) || d.prop.startsWith('--'))) {
        const time = RAW_TIME.exec(value);
        if (time) report(d.line, `raw time "${time[0]}" in ${d.prop} (use a --t- token)`);
        const easing = TIMING_PROPS.has(d.prop) ? RAW_EASING.exec(value) : null;
        if (easing) report(d.line, `raw easing "${easing[0].replace('(', '')}" in ${d.prop} (use an --ease- token)`);
      }
      // One loop only
      if ((d.prop === 'animation' || d.prop === 'animation-iteration-count') && /\binfinite\b/.test(value) && !LOOP_ALLOWED.has(rel)) {
        report(d.line, 'an endless animation (only the road dash loops)');
      }
      // Scroll-driven reveals and smooth scrolling
      if (d.prop === 'scroll-behavior' && value === 'smooth') report(d.line, 'scroll-behavior: smooth');
      if (/^(?:animation-timeline|view-timeline|scroll-timeline|view-timeline-name|scroll-timeline-name|animation-range)$/.test(d.prop)) report(d.line, `${d.prop} (scroll-driven animation)`);
      // No lifting, scaling or tilting on hover
      if (rule.prelude.includes(':hover') && /^(?:transform|translate|scale|rotate)$/.test(d.prop) && value !== 'none') report(d.line, `${d.prop} on :hover (hover thickens outlines; nothing moves)`);
      // Anything that animates needs a calm version in the same file
      const animates = (d.prop === 'animation' || d.prop === 'animation-name' || d.prop === 'transition' || d.prop === 'transition-property') && value !== 'none';
      if (animates && !inCalmBlock && !firstMotionLine) firstMotionLine = d.line;
    }
  }
  if (firstMotionLine && !hasCalmBlock) report(firstMotionLine, 'animation or transition with no @media (prefers-reduced-motion: reduce) rule in the same file');

  for (const m of source.matchAll(/@keyframes\s+([\w-]+)/g)) {
    if (SLOP_KEYFRAMES.test(m[1])) report(lineAt(source, m.index), `@keyframes ${m[1]} (decorative loop name)`);
  }
  if (isTokens) {
    for (const m of source.matchAll(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g)) {
      const [y1, y2] = [Number(m[2]), Number(m[4])];
      if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) report(lineAt(source, m.index), `${m[0]} overshoots (no bounce)`);
    }
  }
}

function motionInJs(rel, source, ast, report) {
  const lines = source.split(/\r?\n/);
  lines.forEach((text, i) => {
    if (/\.animate\s*\(/.test(text) && rel !== HELPER_FILE) report(i + 1, '.animate() outside utils/motion.js (it checks reduced motion)');
    if (/behavior\s*:\s*['"`]smooth/.test(text)) report(i + 1, 'smooth scrolling (motion the user waits out)');
    if (/\bIntersectionObserver\b/.test(text)) report(i + 1, 'IntersectionObserver (scroll reveals)');
    if (/\b(?:animation|transition)(?:Name|Duration|Delay|TimingFunction|Property)?\s*:\s*['"`]/.test(text)) report(i + 1, 'animation or transition in an inline style (motion lives in CSS or the helper)');
  });
  if (rel === HELPER_FILE && !source.includes('prefers-reduced-motion')) report(1, 'the motion helper does not check prefers-reduced-motion');

  let usesRecharts = false;
  walkAst(ast, (node) => {
    const mod = node.type === 'ImportDeclaration' ? node.source.value : node.type === 'ImportExpression' && node.source.type === 'Literal' ? node.source.value : null;
    if (typeof mod === 'string') {
      if (MOTION_LIBRARIES.test(mod)) report(node.loc.start.line, `imports "${mod}" (no motion, count-up or confetti libraries)`);
      if (mod === 'recharts') usesRecharts = true;
    }
    return true;
  });
  if (usesRecharts) {
    walkAst(ast, (node) => {
      if (node.type !== 'JSXOpeningElement' || !RECHARTS_ANIMATED.has(node.name?.name)) return true;
      const attr = node.attributes.find((a) => a.type === 'JSXAttribute' && a.name?.name === 'isAnimationActive');
      const off = attr?.value?.type === 'JSXExpressionContainer' && attr.value.expression.type === 'Literal' && attr.value.expression.value === false;
      if (!off) report(node.loc.start.line, `<${node.name.name}> without isAnimationActive={false} (Recharts' own animation)`);
      return true;
    });
  }
}

function motionInPackage(source, report) {
  const pkg = JSON.parse(source);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of Object.keys(deps)) if (MOTION_LIBRARIES.test(name)) report(1, `depends on "${name}" (no motion, count-up or confetti libraries)`);
}

// ---------- the guard ----------

// Scans one file's text. `rel` is its path from the repository root, with forward slashes.
export function scanFile(rel, source, designDoc = '') {
  const hits = Object.fromEntries(Object.values(GROUP).map((g) => [g, []]));
  const exceptions = [];
  const unreadable = [];
  const lines = source.split(/\r?\n/);

  // Lines marked slop-ok, and their reasons.
  const skipped = new Map();
  lines.forEach((text, i) => {
    const m = SLOP_OK.exec(text);
    if (m) skipped.set(i + 1, m[1]);
  });

  const report = (group, line, match) => {
    if (skipped.has(line)) {
      const reason = skipped.get(line);
      exceptions.push({ file: rel, line, match, reason, logged: reason.length > 0 && designDoc.includes(reason) });
    } else {
      hits[group].push({ file: rel, line, match });
    }
  };
  const motion = (line, match) => report(GROUP.motion, line, match);

  if (rel.endsWith('package.json')) {
    try {
      motionInPackage(source, motion);
    } catch (err) {
      unreadable.push({ file: rel, message: err.message });
    }
    return { hits, exceptions, unreadable };
  }

  // 1. Code values, line by line.
  lines.forEach((text, i) => {
    for (const rule of CODE_RULES) {
      for (const m of text.matchAll(rule.pattern)) {
        if (!rule.allow?.(m)) report(rule.group, i + 1, m[0].trim());
      }
    }
  });

  // 2. Copy phrases in visible text, and 3. motion.
  const ext = path.extname(rel);
  let pieces;
  try {
    if (ext === '.css') {
      pieces = visibleTextFromCss(source);
      motionInCss(rel, source, motion);
    } else if (ext === '.html') {
      pieces = visibleTextFromHtml(source);
    } else {
      const ast = parseJs(source);
      pieces = visibleTextFromJs(ast);
      motionInJs(rel, source, ast, motion);
    }
  } catch (err) {
    unreadable.push({ file: rel, message: err.message });
    return { hits, exceptions, unreadable };
  }
  for (const { text, line } of pieces) {
    for (const m of text.matchAll(PHRASE_PATTERN)) {
      const offset = (text.slice(0, m.index).match(/\n/g) || []).length;
      report(GROUP.copy, line + offset, m[0]);
    }
  }
  return { hits, exceptions, unreadable };
}

export function runSlopGuard() {
  const designDoc = readFileSync(path.join(root, 'docs', 'DESIGN-DECISIONS.md'), 'utf8');
  const files = listFiles();
  const hits = Object.fromEntries(Object.values(GROUP).map((g) => [g, []]));
  const exceptions = [];
  const unreadable = [];

  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const result = scanFile(rel, readFileSync(file, 'utf8'), designDoc);
    for (const [group, list] of Object.entries(result.hits)) hits[group].push(...list);
    exceptions.push(...result.exceptions);
    unreadable.push(...result.unreadable);
  }

  return {
    fileCount: files.length,
    groups: Object.values(GROUP).map((name) => ({ name, hits: hits[name] })),
    exceptions,
    unreadable,
  };
}

// One line per problem, for the report.
export function describeHits(list, limit = 6) {
  const shown = list.slice(0, limit).map((h) => `${h.file}:${h.line} "${h.match}"`);
  if (list.length > limit) shown.push(`and ${list.length - limit} more`);
  return shown.join('; ');
}

// ---------- self-test: every motion rule fires on a planted example, and the allowed forms do not ----------

const CALM = '\n@media (prefers-reduced-motion: reduce) { .a { animation: none; } }';
const SELF_TEST = [
  // must fail
  ['fail', 'keyframes animating width', 'client/src/x.module.css', `.a { animation: grow var(--t-paint) var(--ease-brush) both; }\n@keyframes grow { from { width: 0; } to { width: 10px; } }${CALM}`],
  ['fail', 'keyframes animating a colour', 'client/src/x.module.css', `.a { animation: paint var(--t-paint) var(--ease-brush) both; }\n@keyframes paint { to { background-color: red; } }${CALM}`],
  ['fail', 'transition on background-color', 'client/src/x.module.css', `.a { transition: background-color var(--t-press) var(--ease-settle); }${CALM}`],
  ['fail', 'transition: all', 'client/src/x.module.css', `.a { transition: all var(--t-press) var(--ease-settle); }${CALM}`],
  ['fail', 'transition-property: height', 'client/src/x.module.css', `.a { transition-property: height; }${CALM}`],
  ['fail', 'a raw duration', 'client/src/x.module.css', `.a { transition: transform 200ms var(--ease-settle); }${CALM}`],
  ['fail', 'a raw duration in seconds', 'client/src/x.module.css', `.a { animation: rise .3s var(--ease-settle) both; }\n@keyframes rise { to { opacity: 1; } }${CALM}`],
  ['fail', 'a raw time in a custom property', 'client/src/x.module.css', `.a { --speed: 1.6s; }`],
  ['fail', 'a raw easing keyword', 'client/src/x.module.css', `.a { transition: transform var(--t-press) ease-in-out; }${CALM}`],
  ['fail', 'a raw cubic-bezier', 'client/src/x.module.css', `.a { transition: transform var(--t-press) cubic-bezier(0.2, 0, 0, 1); }${CALM}`],
  ['fail', 'an endless loop outside the road dash', 'client/src/x.module.css', `.a { animation: turn var(--t-road) var(--ease-road) infinite; }\n@keyframes turn { to { transform: rotate(90deg); } }${CALM}`],
  ['fail', 'no reduced-motion rule in the file', 'client/src/x.module.css', `.a { transition: transform var(--t-press) var(--ease-settle); }`],
  ['fail', 'a card lifting on hover', 'client/src/x.module.css', `.card:hover { transform: translateY(-4px); }`],
  ['fail', 'a card scaling on hover', 'client/src/x.module.css', `.card:hover .img { scale: 1.05; }`],
  ['fail', 'smooth scrolling in CSS', 'client/src/x.css', `html { scroll-behavior: smooth; }`],
  ['fail', 'a scroll-driven reveal', 'client/src/x.module.css', `.a { animation-timeline: view(); }`],
  ['fail', 'a shimmer keyframe', 'client/src/x.module.css', `@keyframes shimmer { to { opacity: 0.5; } }`],
  ['fail', 'a pulse keyframe', 'client/src/x.module.css', `@keyframes softPulse { to { opacity: 0.5; } }`],
  ['fail', 'a bouncy easing token', 'client/src/styles/tokens.css', `:root { --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); }`],
  ['fail', '.animate() outside the helper', 'client/src/pages/X.jsx', `export function X(el) { el.animate([{ opacity: 0 }, { opacity: 1 }], 200); }`],
  ['fail', 'smooth scrollIntoView', 'client/src/pages/X.jsx', `export function X(el) { el.scrollIntoView({ behavior: 'smooth' }); }`],
  ['fail', 'an IntersectionObserver reveal', 'client/src/pages/X.jsx', `export const io = new IntersectionObserver(() => {});`],
  ['fail', 'an inline transition', 'client/src/pages/X.jsx', `export const X = () => <div style={{ transition: 'opacity 1s' }} />;`],
  ['fail', 'a motion library', 'client/src/pages/X.jsx', `import { motion } from 'framer-motion';\nexport default motion.div;`],
  ['fail', 'a count-up library', 'client/src/pages/X.jsx', `import CountUp from 'react-countup';\nexport default CountUp;`],
  ['fail', 'a confetti library', 'client/src/pages/X.jsx', `import confetti from 'canvas-confetti';\nexport default confetti;`],
  ['fail', "Recharts' own animation left on", 'client/src/components/X.jsx', `import { Bar } from 'recharts';\nexport const X = () => <Bar dataKey="v" />;`],
  ['fail', 'a motion library in package.json', 'client/package.json', JSON.stringify({ dependencies: { gsap: '3.12.5' } })],
  ['fail', 'a helper that ignores reduced motion', HELPER_FILE, `export const go = (el) => el.animate([], 1);`],
  // must pass
  ['pass', 'transform and opacity from tokens, with a calm version', 'client/src/x.module.css', `.a { transition: transform var(--t-release) var(--ease-settle), opacity var(--t-paint) var(--ease-brush); }\n.a:active { transform: translateY(1px); transition-duration: var(--t-press); }${CALM}`],
  ['pass', 'keyframes on transform and opacity', 'client/src/x.module.css', `.a { animation: rise var(--t-plant) var(--ease-settle) both; }\n@keyframes rise { from { transform: translateY(100%); opacity: 0; } to { transform: none; opacity: 1; } }${CALM}`],
  ['pass', 'text-transform and outlines on hover', 'client/src/x.module.css', `.a:hover { text-transform: uppercase; outline: 2px solid; }`],
  ['pass', 'the road dash loop', 'client/src/components/RoadDashes.module.css', `.t { animation: slide var(--t-road) var(--ease-road) infinite; }\n@keyframes slide { to { transform: translateX(-1rem); } }${CALM}`],
  ['pass', 'a zero wait', 'client/src/x.module.css', `.a { --dash-wait: 0ms; }`],
  ['pass', 'easings defined in tokens', 'client/src/styles/tokens.css', `:root { --ease-settle: cubic-bezier(0.2, 0, 0, 1); --t-press: 50ms; }`],
  ['pass', '.animate() inside the helper', HELPER_FILE, `// prefers-reduced-motion is checked\nexport const go = (el) => el.animate([], 1);`],
  ['pass', 'Recharts with its animation off', 'client/src/components/X.jsx', `import { Bar } from 'recharts';\nexport const X = () => <Bar dataKey="v" isAnimationActive={false} />;`],
  ['pass', 'an instant scrollIntoView', 'client/src/pages/X.jsx', `export function X(el) { el.scrollIntoView({ block: 'nearest' }); }`],
];

export function selfTest() {
  const failures = [];
  for (const [want, label, rel, source] of SELF_TEST) {
    const { hits, unreadable } = scanFile(rel, source);
    const found = hits[GROUP.motion];
    const ok = unreadable.length === 0 && (want === 'fail' ? found.length > 0 : found.length === 0);
    if (!ok) failures.push(`${want === 'fail' ? 'did not catch' : 'wrongly caught'} ${label}${found.length ? `: ${found.map((h) => h.match).join('; ')}` : ''}${unreadable.length ? ` (could not read: ${unreadable[0].message})` : ''}`);
  }
  return { total: SELF_TEST.length, failures };
}

// Run directly: print the result and exit 1 on any problem.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--self-test')) {
    const { total, failures } = selfTest();
    console.log(`Slop guard self-test: ${total - failures.length}/${total} motion cases behave`);
    for (const f of failures) console.log(`  FAIL  ${f}`);
    process.exit(failures.length ? 1 : 0);
  }
  const result = runSlopGuard();
  let failed = result.unreadable.length > 0;
  console.log(`Slop guard: ${result.fileCount} files in client/src, client/index.html and client/package.json`);
  for (const g of result.groups) {
    console.log(`  ${g.hits.length ? 'FAIL' : 'PASS'}  ${g.name}${g.hits.length ? `  (${describeHits(g.hits)})` : ''}`);
    if (g.hits.length) failed = true;
  }
  for (const e of result.exceptions) {
    console.log(`  ${e.logged ? 'OK  ' : 'FAIL'}  slop-ok at ${e.file}:${e.line} "${e.match}": ${e.reason || '(no reason)'}${e.logged ? '' : '  (reason not in DESIGN-DECISIONS.md)'}`);
    if (!e.logged) failed = true;
  }
  for (const u of result.unreadable) console.log(`  FAIL  could not parse ${u.file}: ${u.message}`);
  process.exit(failed ? 1 : 0);
}
