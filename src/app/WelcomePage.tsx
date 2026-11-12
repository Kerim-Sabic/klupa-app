import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { AGE_GROUPS, type AgeGroup } from '../data/drills';
import { useAuth } from '../lib/auth';
import { useClub } from '../lib/club';
import { errorKey } from '../lib/errors';
import { Button, Card, SelectField, Spinner, TextField, useToast } from '../ui';
import { SAMPLE_PARAM } from './home/SetupSection';
import { createClubWithTeam } from './onboarding';
import { PublicLayout } from './PublicLayout';

type SubmitHandler = NonNullable<ComponentProps<'form'>['onSubmit']>;

function isAgeGroup(value: string): value is AgeGroup {
  return AGE_GROUPS.some((group) => group === value);
}

function validName(value: string): boolean {
  const length = value.trim().length;
  return length >= 2 && length <= 60;
}

/** First run: name the club and the team. Demo visitors get sensible names filled in. */
export function WelcomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { state: auth } = useAuth();
  const { state: club, refresh } = useClub();
  const { toast } = useToast();
  const demo = auth.status === 'signed-in' && auth.user.is_anonymous === true;
  const [clubName, setClubName] = useState(demo ? t('welcome.demoClub') : '');
  const [teamName, setTeamName] = useState(demo ? t('welcome.demoTeam') : '');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('u13');
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // A demo club made here opens on Today asking for the sample season. Kept in state because
  // the redirect below fires as soon as the new club is known, before the submit handler ends.
  const [created, setCreated] = useState(false);
  const home = created && demo ? `/?${SAMPLE_PARAM}=1` : '/';

  if (club.status === 'ready') return <Navigate to={home} replace />;
  if (club.status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }

  const submit: SubmitHandler = (event) => {
    event.preventDefault();
    if (!validName(clubName) || !validName(teamName)) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    createClubWithTeam({ clubName: clubName.trim(), teamName: teamName.trim(), ageGroup })
      .then(async () => {
        setCreated(true);
        await refresh();
        await navigate(demo ? `/?${SAMPLE_PARAM}=1` : '/', { replace: true });
      })
      .catch((error: unknown) => {
        toast({ tone: 'error', message: t(errorKey(error)) });
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const nameError = (value: string) =>
    showErrors && !validName(value) ? { error: t('welcome.nameInvalid') } : {};

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md">
        <h1 className="font-title text-large-title text-balance sm:text-[44px]">
          {t('welcome.title')}
        </h1>
        <p className="mt-2 text-[16px] text-pretty text-ink-soft">
          {t('welcome.intro')}
          {demo && ` ${t('welcome.demoNote')}`}
        </p>
        <Card className="mt-6">
          <form onSubmit={submit} noValidate className="grid gap-4">
            <TextField
              label={t('welcome.clubName')}
              name="club"
              autoComplete="organization"
              value={clubName}
              onChange={(event) => {
                setClubName(event.target.value);
              }}
              {...nameError(clubName)}
            />
            <TextField
              label={t('welcome.teamName')}
              name="team"
              value={teamName}
              onChange={(event) => {
                setTeamName(event.target.value);
              }}
              {...nameError(teamName)}
            />
            <SelectField
              label={t('welcome.ageGroup')}
              value={ageGroup}
              options={AGE_GROUPS.map((group) => ({ value: group, label: t(`ageGroup.${group}`) }))}
              onChange={(value) => {
                if (isAgeGroup(value)) setAgeGroup(value);
              }}
            />
            <Button type="submit" size="lg" fullWidth loading={busy}>
              {t('welcome.create')}
            </Button>
          </form>
        </Card>
      </div>
    </PublicLayout>
  );
}
