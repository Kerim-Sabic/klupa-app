import { Archive, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveClub } from '../../lib/club';
import { usePlayers, type Player } from '../../lib/data';
import { Button, DataTable, EmptyState, PageHeader, Pill, type Column } from '../../ui';
import { canManage } from './model';
import { PlayerActionSheet, type PlayerAction } from './PlayerActionSheet';
import { PlayerSheet } from './PlayerSheet';
import { LoadingBlock, QueryFailed, ReadOnlyNote } from './states';
import { useTarget } from './useTarget';

interface ActionTarget {
  readonly player: Player;
  readonly kind: PlayerAction;
}

const CONSENT_TONE = { granted: 'pitch', withdrawn: 'clay', not_recorded: 'mute' } as const;

/** The roster: a label and a shirt number per player, and nothing that identifies a child. */
export function SquadPage() {
  const { t } = useTranslation();
  const { role, teamName } = useActiveClub();
  const players = usePlayers();
  const canWrite = canManage(role);
  const form = useTarget<Player>();
  const action = useTarget<ActionTarget>();
  const { show: showForm } = form;
  const { show: showAction } = action;

  const columns = useMemo<Column<Player>[]>(() => {
    const base: Column<Player>[] = [
      {
        id: 'shirt',
        header: t('club.squad.columns.shirt'),
        cell: (player) => <span className="font-semibold tabular-nums">{player.shirt_number}</span>,
        sortValue: (player) => player.shirt_number,
      },
      {
        id: 'label',
        header: t('club.squad.columns.label'),
        cell: (player) => player.label,
        sortValue: (player) => player.label,
      },
      {
        id: 'consent',
        header: t('club.squad.columns.consent'),
        cell: (player) => (
          <Pill tone={CONSENT_TONE[player.consent]}>
            {t(`club.squad.consent.${player.consent}`)}
          </Pill>
        ),
        sortValue: (player) => player.consent,
      },
      {
        id: 'quarter',
        header: t('club.squad.columns.quarter'),
        cell: (player) =>
          player.birth_quarter === null ? (
            <span role="img" aria-label={t('club.squad.quarter.none')}>
              –
            </span>
          ) : (
            t('club.squad.quarterShort', { n: player.birth_quarter })
          ),
        sortValue: (player) => player.birth_quarter,
      },
    ];
    if (!canWrite) return base;
    return [
      ...base,
      {
        id: 'actions',
        header: t('club.squad.columns.actions'),
        align: 'right',
        cell: (player) => (
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              variant="ghost"
              icon={<Pencil />}
              aria-label={t('club.squad.editFor', { label: player.label })}
              onClick={() => {
                showForm(player);
              }}
            >
              {t('club.squad.edit')}
            </Button>
            <Button
              variant="ghost"
              icon={<Archive />}
              aria-label={t('club.squad.archiveFor', { label: player.label })}
              onClick={() => {
                showAction({ player, kind: 'archive' });
              }}
            >
              {t('club.squad.archive.action')}
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 />}
              aria-label={t('club.squad.eraseFor', { label: player.label })}
              onClick={() => {
                showAction({ player, kind: 'erase' });
              }}
            >
              {t('club.squad.erase.action')}
            </Button>
          </div>
        ),
      },
    ];
  }, [t, canWrite, showForm, showAction]);

  const addButton = canWrite ? (
    <Button
      icon={<Plus />}
      onClick={() => {
        showForm(null);
      }}
    >
      {t('club.squad.add')}
    </Button>
  ) : undefined;

  let body: ReactNode;
  if (players.isPending) {
    body = <LoadingBlock />;
  } else if (players.isError) {
    body = (
      <QueryFailed
        error={players.error}
        onRetry={() => {
          void players.refetch();
        }}
      />
    );
  } else if (players.data.length === 0) {
    body = (
      <EmptyState
        icon={<Users />}
        title={t('club.squad.empty.title')}
        body={t(canWrite ? 'club.squad.empty.body' : 'club.squad.empty.bodyReadOnly')}
        {...(addButton !== undefined && { action: addButton })}
      />
    );
  } else {
    body = (
      <DataTable
        caption={t('club.squad.caption', { team: teamName })}
        columns={columns}
        rows={players.data}
        getRowId={(player) => player.id}
        initialSort={{ columnId: 'shirt', direction: 'asc' }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={t('club.squad.title')}
        subtitle={t('club.squad.subtitle')}
        back={{ to: '/club', label: t('club.back') }}
        {...(addButton !== undefined && players.isSuccess && players.data.length > 0
          ? { actions: addButton }
          : {})}
      />
      <div className="flex flex-col gap-4">
        {!canWrite && <ReadOnlyNote>{t('club.squad.readOnly')}</ReadOnlyNote>}
        {body}
      </div>
      {form.key > 0 && (
        <PlayerSheet
          key={form.key}
          open={form.open}
          player={form.value}
          players={players.data ?? []}
          onClose={form.hide}
        />
      )}
      {action.value !== null && (
        <PlayerActionSheet
          key={action.key}
          open={action.open}
          action={action.value.kind}
          player={action.value.player}
          onClose={action.hide}
        />
      )}
    </>
  );
}
