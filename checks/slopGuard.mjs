// Slop guard: part of `npm run check` (Step 1.6 in docs/TASKS.md).
//
// Reads the website's source (client/src and client/index.html) and fails on the
// banned values in .kiro/steering/design.md: purple colours, gradients, shadows
// other than the focus ring, banned fonts, alert()/confirm(), template leftovers,
// emoji, and brochure or generic button copy.
//
// - Code values (colours, gradients, fonts and so on) are searched in every line,
//   comments included.
// - Copy phrases ("Get started", "Submit" and so on) are searched only in text a
//   visitor can see or hear: JSX text and string literals (found with a real
//   JavaScript parser, so comments and code names are ignored), HTML text, and CSS
//   `content:` strings. Matching is case-sensitive, so `onSubmit` never trips it.
//
// Exception: a line that ends with the comment `slop-ok: <reason>` is skipped, but
// only if that exact reason is also written in docs/DESIGN-DECISIONS.md.
//
// On its own:  node checks/slopGuard.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from 'acorn';
import jsx from 'acorn-jsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['client/src'];
const SCAN_FILES = ['client/index.html'];
const EXTENSIONS = new Set(['.js', '.jsx', '.css', '.html']);

const GROUP = {
  colour: 'Colours: no purple, indigo or violet',
  surface: 'Surfaces: no gradients, clipped text, glass blur, or shadows other than the focus ring',
  font: 'Fonts: no Inter, Roboto, Arial, Open Sans or system font',
  leftovers: 'No alert()/confirm() dialogs or template leftovers (lorem, TODO, "Vite + React")',
  emoji: 'No emoji',
  copy: 'Copy: no brochure words or generic button labels in visible text',
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

function visibleTextFromJs(source) {
  const ast = JsxParser.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const pieces = [];

  const visit = (node, parent, key) => {
    if (!node || typeof node.type !== 'string') return;

    // Values of technical attributes (className="...", type="submit") are not shown.
    if (node.type === 'JSXAttribute' && TECHNICAL_ATTRIBUTES.has(node.name?.name)) return;

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

    for (const [childKey, value] of Object.entries(node)) {
      if (childKey === 'loc') continue;
      if (Array.isArray(value)) value.forEach((child) => visit(child, node, childKey));
      else if (value && typeof value === 'object') visit(value, node, childKey);
    }
  };

  visit(ast, null, null);
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

// ---------- the guard ----------

export function runSlopGuard() {
  const designDoc = readFileSync(path.join(root, 'docs', 'DESIGN-DECISIONS.md'), 'utf8');
  const files = listFiles();
  const hits = Object.fromEntries(Object.values(GROUP).map((g) => [g, []]));
  const exceptions = [];
  const unreadable = [];

  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const source = readFileSync(file, 'utf8');
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

    // 1. Code values, line by line.
    lines.forEach((text, i) => {
      for (const rule of CODE_RULES) {
        for (const m of text.matchAll(rule.pattern)) {
          if (!rule.allow?.(m)) report(rule.group, i + 1, m[0].trim());
        }
      }
    });

    // 2. Copy phrases, in visible text only.
    let pieces;
    try {
      const ext = path.extname(file);
      pieces = ext === '.css' ? visibleTextFromCss(source) : ext === '.html' ? visibleTextFromHtml(source) : visibleTextFromJs(source);
    } catch (err) {
      unreadable.push({ file: rel, message: err.message });
      continue;
    }
    for (const { text, line } of pieces) {
      for (const m of text.matchAll(PHRASE_PATTERN)) {
        const offset = (text.slice(0, m.index).match(/\n/g) || []).length;
        report(GROUP.copy, line + offset, m[0]);
      }
    }
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

// Run directly: print the result and exit 1 on any problem.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = runSlopGuard();
  let failed = result.unreadable.length > 0;
  console.log(`Slop guard: ${result.fileCount} files in client/src and client/index.html`);
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
