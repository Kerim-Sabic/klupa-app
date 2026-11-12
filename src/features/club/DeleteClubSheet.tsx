import { useMutation } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useActiveClub, useClub } from '../../lib/club';
import { errorKey } from '../../lib/errors';
import { Button, Sheet, TextField, useToast } from '../../ui';
import { deleteClub } from './privacy/api';

export interface DeleteClubSheetProps {
  open: boolean;
  onClose: () => void;
}

const FORM_ID = 'delete-club-form';

/**
 * Deleting a club cannot be undone, so the coach types its name first. The database removes
 * everything the club holds in the same step; here we only reload who the coach is and leave.
 */
export function DeleteClubSheet({ open, onClose }: DeleteClubSheetProps) {
  const { t } = useTranslation();
  const { clubId, clubName } = useActiveClub();
  const { refresh } = useClub();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const remove = useMutation({
    mutationFn: () => deleteClub(clubId),
    onSuccess: async () => {
      await refresh();
      toast({ tone: 'success', message: t('club.privacy.delete.done') });
      void navigate('/welcome', { replace: true });
    },
    onError: (error) => {
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
  });

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typed.trim() !== clubName.trim()) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    remove.mutate();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('club.privacy.delete.sheetTitle', { club: clubName })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('club.squad.form.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} variant="danger" loading={remove.isPending}>
            {t('club.privacy.delete.confirm')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <p>{t('club.privacy.delete.sheetBody')}</p>
        <TextField
          label={t('club.privacy.delete.typeLabel')}
          hint={t('club.privacy.delete.typeHint', { club: clubName })}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          {...(mismatch && { error: t('club.privacy.delete.mismatch') })}
        />
      </form>
    </Sheet>
  );
}
