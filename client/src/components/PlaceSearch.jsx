import { useEffect, useId, useRef, useState } from 'react';
import api, { errorMessage } from '../api/client';
import fieldStyles from './TextField.module.css';
import styles from './PlaceSearch.module.css';

// A search box with suggestions (the ARIA "combobox" pattern), used to pick a
// destination (/geo/destinations) and later a stop (/geo/spots).
//
// Keyboard: type, Down/Up to move through suggestions, Enter to pick, Escape to close.
// The parent gets the picked place through onPick(place), and onPick(null)
// when the text is changed again after picking.
//
// endpoint: API path; params: extra query values (for example { tripId });
// describe(place): the second line under each suggestion.
export default function PlaceSearch({
  label,
  hint,
  error,
  endpoint,
  params,
  picked,
  onPick,
  describe = () => '',
  pickedText,
  placeholder,
  emptyHelp = 'Check the spelling, or try the nearest bigger town.',
  disabled = false,
}) {
  const id = useId();
  const [text, setText] = useState(picked ? picked.name : '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ state: 'idle', items: [] });
  const [active, setActive] = useState(-1);
  const lastQuery = useRef('');
  const paramsKey = JSON.stringify(params || {});

  // Search 300 ms after the typing stops, so each letter does not cost a request.
  useEffect(() => {
    const q = text.trim();
    if (picked || q.length < 2) {
      setResults({ state: 'idle', items: [] });
      return undefined;
    }
    setResults((r) => ({ ...r, state: 'loading' }));
    const timer = setTimeout(async () => {
      lastQuery.current = q;
      try {
        const { data } = await api.get(endpoint, { params: { q, ...JSON.parse(paramsKey) } });
        if (lastQuery.current !== q) return; // an older search answered late
        setResults({ state: 'done', items: data.results });
        setActive(data.results.length ? 0 : -1);
      } catch (err) {
        if (lastQuery.current !== q) return;
        setResults({ state: 'error', items: [], message: errorMessage(err) });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, picked, endpoint, paramsKey]);

  function choose(place) {
    onPick(place);
    setText(place.name);
    setOpen(false);
  }

  function onKeyDown(event) {
    const items = results.items;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (items.length ? (i + 1) % items.length : -1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : -1));
    } else if (event.key === 'Enter' && open && active >= 0 && items[active]) {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && !picked && text.trim().length >= 2 && results.state !== 'idle';
  const listId = `${id}-list`;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`, picked && `${id}-picked`].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`${fieldStyles.field} ${error ? fieldStyles.invalid : ''} ${styles.wrap}`}>
      <label className={fieldStyles.label} htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p className={fieldStyles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <div className={fieldStyles.control}>
        <input
          id={id}
          className={fieldStyles.input}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck="false"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (picked) onPick(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
      </div>

      {picked && (
        <p className={styles.picked} id={`${id}-picked`}>
          <span className={styles.pickedMark} aria-hidden="true" />
          {pickedText ? pickedText(picked) : describe(picked) || picked.name}
        </p>
      )}

      {showList && (
        <ul className={styles.list} id={listId} role="listbox" aria-label={`Suggestions for ${label}`}>
          {results.state === 'loading' && !results.items.length && <li className={styles.note}>Searching for "{text.trim()}"</li>}
          {results.state === 'error' && <li className={`${styles.note} ${styles.problem}`}>{results.message}</li>}
          {results.state === 'done' && !results.items.length && (
            <li className={styles.note}>
              Nothing found for "{text.trim()}". {emptyHelp}
            </li>
          )}
          {results.items.map((place, i) => (
            <li
              key={`${place.name}-${place.location.join(',')}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`${styles.option} ${i === active ? styles.active : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(place)}
            >
              <span className={styles.optionName}>{place.name}</span>
              <span className={styles.optionMore}>{describe(place)}</span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className={fieldStyles.error} id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
