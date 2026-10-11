import { useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { describeAuthError } from '../utils/authErrors';
import { safeNext } from '../utils/safeNext';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import Button from '../components/Button';
import Notice from '../components/Notice';
import RoadLoader from '../components/RoadLoader';
import styles from './authForm.module.css';

function validate({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Enter the email you signed up with.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

export default function Login() {
  const { status, login } = useAuth();
  const [params] = useSearchParams();
  // Where to go after logging in, for example back to an invite link.
  const next = safeNext(params.get('next'));
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(null);

  if (status === 'signedIn' || status === 'error') return <Navigate to={next} replace />;
  if (status === 'checking' && !submitting) return <RoadLoader label="Checking your login" fullPage />;

  function update(field) {
    return (event) => {
      setValues((v) => ({ ...v, [field]: event.target.value }));
      if (errors[field] || errors.form) setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
    };
  }

  function focusFirstError() {
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return focusFirstError();

    setSubmitting(true);
    try {
      await login({ email: values.email.trim(), password: values.password });
    } catch (err) {
      const { field, message } = describeAuthError(err);
      setErrors({ [field]: message });
      setSubmitting(false);
      if (field !== 'form') focusFirstError();
    }
  }

  const registerLink = params.get('next') ? `/register?next=${encodeURIComponent(next)}` : '/register';

  return (
    <AuthLayout
      title="Log in"
      intro={params.get('next') ? 'Log in first, then TripSync takes you back to the page you opened.' : 'Pick up where your group left off.'}
      footer={
        <>
          New to TripSync? <Link to={registerLink}>Create an account</Link>
        </>
      }
    >
      <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate>
        {errors.form && <Notice tone="warning">{errors.form}</Notice>}
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          onChange={update('email')}
          error={errors.email}
          disabled={submitting}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={update('password')}
          error={errors.password}
          disabled={submitting}
        />
        <Button type="submit" busy={submitting} className={styles.submit}>
          {submitting ? 'Logging in' : 'Log in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
