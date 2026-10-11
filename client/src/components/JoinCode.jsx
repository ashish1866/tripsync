import { useState } from 'react';
import { useNavigate } from 'react-router';
import TextField from './TextField';
import Button from './Button';
import styles from './JoinCode.module.css';

// "Got an invite code?" on Your trips: type the 8-character code from the
// owner and open its invite page (the same page the link opens).
const SHAPE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

export default function JoinCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState();

  function handleSubmit(event) {
    event.preventDefault();
    const clean = code.replace(/[\s-]/g, '').toUpperCase();
    if (!SHAPE.test(clean)) {
      setError('An invite code has 8 letters and digits, for example K7TQ2MXP.');
      event.currentTarget.querySelector('input')?.focus();
      return;
    }
    navigate(`/join/${clean}`);
  }

  return (
    <form className={styles.board} onSubmit={handleSubmit} noValidate aria-labelledby="join-code-title">
      <h2 id="join-code-title" className={styles.title}>
        Got an invite code?
      </h2>
      <div className={styles.row}>
        <TextField
          label="Invite code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(undefined);
          }}
          error={error}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck="false"
          maxLength={12}
          className={styles.field}
        />
        <Button type="submit" variant="plain" className={styles.button}>
          Open the invite
        </Button>
      </div>
    </form>
  );
}
