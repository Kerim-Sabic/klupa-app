import MatchDay from './MatchDay';
import { ReplayTile } from './ReplayTile';
import { Tiles } from './Tiles';

/**
 * Everything on the front page under the headline. It brings the reading engine, the rings and
 * the research figures with it, so it is one chunk fetched after the headline and the sign-in
 * form are on screen.
 */
export default function Below() {
  return (
    <>
      <MatchDay />
      <ReplayTile />
      <Tiles />
    </>
  );
}
