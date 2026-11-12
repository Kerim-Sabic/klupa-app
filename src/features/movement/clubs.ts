import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import type { Side } from '../../engine/types';
import type { Clubs } from './matches';

/** The two club names of the match on screen, by the data file's side label. */
export const ClubsContext = createContext<Clubs | null>(null);

/**
 * A side's name for any text on the replay: the club when a match is open, otherwise the
 * plain words "Home" and "Away" (used only by parts rendered on their own, as in tests).
 */
export function useClubName(): (side: Side) => string {
  const clubs = useContext(ClubsContext);
  const { t } = useTranslation();
  return (side) => clubs?.[side] ?? t(`movement.side.${side}`);
}
