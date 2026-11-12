import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAuth } from '../../lib/auth';
import { Button, Card, TextField } from '../../ui';
import type { Run } from './useRun';

const emailSchema = z.email();
const CODE_PATTERN = /^\d{6}$/;

type SubmitHandler = NonNullable<ComponentProps<'form'>['onSubmit']>;

/** Sign in with an emailed one-time code. No passwords. */
export function SignInCard({
  busy,
  run,
}: {
  readonly busy: 'code' | 'verify' | 'demo' | null;
  readonly run: Run;
}) {
  const { t } = useTranslation();
  const { requestCode, verifyCode } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submitEmail: SubmitHandler = (event) => {
    event.preventDefault();
    if (!emailSchema.safeParse(email.trim()).success) {
      setFieldError(t('auth.emailInvalid'));
      return;
    }
    setFieldError(null);
    void run('code', async () => {
      await requestCode(email);
      setStep('code');
    });
  };

  const submitCode: SubmitHandler = (event) => {
    event.preventDefault();
    if (!CODE_PATTERN.test(code.trim())) {
      setFieldError(t('auth.codeInvalid'));
      return;
    }
    setFieldError(null);
    void run('verify', () => verifyCode(email, code));
  };

  return (
    <Card
      as="section"
      id="landing-sign-in"
      aria-labelledby="landing-sign-in-title"
      className="flex scroll-mt-24 flex-col gap-4"
    >
      <div>
        <h2 id="landing-sign-in-title" className="font-title text-title">
          {t('auth.title')}
        </h2>
        <p className="mt-1 text-footnote text-pretty text-ink-soft">
          {t('landing.signInDetail')} {t('auth.intro')}
        </p>
      </div>
      {step === 'email' ? (
        <form onSubmit={submitEmail} noValidate className="grid gap-4">
          <TextField
            label={t('auth.email')}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            {...(fieldError === null ? {} : { error: fieldError })}
          />
          <Button type="submit" size="lg" fullWidth loading={busy === 'code'}>
            {t('auth.sendCode')}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitCode} noValidate className="grid gap-4">
          <TextField
            label={t('auth.codeLabel')}
            hint={t('auth.codeHint', { email: email.trim() })}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
            {...(fieldError === null ? {} : { error: fieldError })}
          />
          <Button type="submit" size="lg" fullWidth loading={busy === 'verify'}>
            {t('auth.verify')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setStep('email');
              setCode('');
              setFieldError(null);
            }}
          >
            {t('auth.changeEmail')}
          </Button>
        </form>
      )}
    </Card>
  );
}
