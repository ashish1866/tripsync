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

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Checks the form before anything is sent, so mistakes show next to the right field.
function validate({ name, email, password }) {
  const errors = {};
  if (!name.trim()) errors.name = 'Enter your name. The group sees it next to bills.';
  else if (name.trim().length > 60) errors.name = 'Keep your name under 60 characters.';
  if (!email.trim()) errors.email = 'Enter your email address.';
  else if (!EMAIL_SHAPE.test(email.trim())) errors.email = 'This email address is not valid.';
  if (password.length < 8) errors.password = 'Use at least 8 characters.';
  return errors;
}

export default function Register() {
  const { status, register } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(null);

  // Already logged in (or just finished signing up): go on to the trips.
  if (status === 'signedIn' || status === 'error') return <Navigate to={next} replace />;
  if (status === 'checking' && !submitting) return <RoadLoader label="Checking your login" fullPage />;

  function update(field) {
    return (event) => {
      setValues((v) => ({ ...v, [field]: event.target.value }));
      if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
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
      await register({ name: values.name.trim(), email: values.email.trim(), password: values.password });
      // Success: the auth context now creates the profile, then this page redirects.
    } catch (err) {
      const { field, message } = describeAuthError(err);
      setErrors({ [field]: message });
      setSubmitting(false);
      if (field !== 'form') focusFirstError();
    }
  }

  const loginLink = params.get('next') ? `/login?next=${encodeURIComponent(next)}` : '/login';

  return (
    <AuthLayout
      title="Create your account"
      intro="One account for every trip you plan or join."
      footer={
        <>
          Already have an account? <Link to={loginLink}>Log in</Link>
        </>
      }
    >
      <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate>
        {errors.form && <Notice tone="warning">{errors.form}</Notice>}
        <TextField
          label="Your name"
          hint="Shown to the people on your trips."
          autoComplete="name"
          value={values.name}
          onChange={update('name')}
          error={errors.name}
          disabled={submitting}
          maxLength={80}
        />
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
          hint="At least 8 characters. TripSync never sees it; Firebase keeps it."
          autoComplete="new-password"
          value={values.password}
          onChange={update('password')}
          error={errors.password}
          disabled={submitting}
        />
        <Button type="submit" busy={submitting} className={styles.submit}>
          {submitting ? 'Creating your account' : 'Create my account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
