import { FROM_U11, FROM_U9, type Drill } from './types';

/** Closing games: a real game with one rule that rewards the session's focus. */
export const GAME_DRILLS: readonly Drill[] = [
  {
    key: 'four-goal-game',
    name: { bs: 'Igra na četiri mala gola', en: 'Four-goal game' },
    summary: {
      bs: 'Igra na po dva mala gola sa svake strane; promjena strane otvara lak gol.',
      en: 'A game with two small goals at each end; switching play opens an easy goal.',
    },
    setup: {
      bs: 'Polje 40 x 30 m, ekipe od četiri do osam igrača.',
      en: 'A 40 x 30 m area, teams of four to eight.',
    },
    coachingPoints: [
      { bs: 'Primi loptu okrenut prema igri.', en: 'Receive the ball facing forward.' },
      { bs: 'Kad izgubiš loptu, odmah reaguj.', en: 'React the moment the ball is lost.' },
    ],
    easier: {
      bs: 'Jedan džoker igra s ekipom u posjedu.',
      en: 'A neutral plays for the team in possession.',
    },
    harder: { bs: 'Najviše tri dodira.', en: 'Three touches maximum.' },
    focus: ['receiving_under_pressure', 'transition'],
    phase: 'game',
    minPlayers: 8,
    maxPlayers: 16,
    minutes: 20,
    minArea: 'half',
    equipment: ['balls', 'bibs', 'small_goals'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 0.6,
  },
  {
    key: 'shooting-game',
    name: { bs: 'Igra s puno udaraca', en: 'Shooting game' },
    summary: {
      bs: 'Igra na dva velika gola na kratkom terenu; udarac je dozvoljen s bilo kojeg mjesta.',
      en: 'A game to two full-size goals on a short pitch; shoot from anywhere.',
    },
    setup: {
      bs: 'Pola terena, dva gola s golmanima. Rezervne lopte iza svakog gola.',
      en: 'Half a pitch, two goals with keepers. Spare balls behind each goal.',
    },
    coachingPoints: [
      { bs: 'Ako imaš metar prostora, šutiraj.', en: 'If you have a metre of space, shoot.' },
      {
        bs: 'Prati svaki udarac zbog odbijene lopte.',
        en: 'Follow every shot in for the rebound.',
      },
    ],
    easier: {
      bs: 'Jedan džoker uvijek igra za ekipu s loptom.',
      en: 'A neutral always plays for the team with the ball.',
    },
    harder: {
      bs: 'Gol vrijedi samo poslije driblinga ili udarca iz prve.',
      en: 'A goal only counts after beating a player or a first-time finish.',
    },
    focus: ['finishing', 'one_v_one_attacking'],
    phase: 'game',
    minPlayers: 8,
    maxPlayers: 16,
    minutes: 20,
    minArea: 'half',
    equipment: ['balls', 'bibs', 'full_goals'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 0.5,
  },
  {
    key: 'end-zone-game',
    name: { bs: 'Igra u zonu', en: 'End-zone game' },
    summary: {
      bs: 'Bod se osvaja kad igrač primi loptu u protivničkoj zoni.',
      en: "A point is scored when a player receives the ball in the opponents' end zone.",
    },
    setup: {
      bs: 'Polje 40 x 30 m sa zonama dubine 5 m na oba kraja. Ekipe od četiri do devet igrača.',
      en: 'A 40 x 30 m area with 5 m deep end zones. Teams of four to nine.',
    },
    coachingPoints: [
      {
        bs: 'Strpljivo: vrati loptu da otvoriš put naprijed.',
        en: 'Be patient: play back to open the way forward.',
      },
      { bs: 'Utrči u zonu u pravom trenutku.', en: 'Time your run into the zone.' },
    ],
    easier: {
      bs: 'Bez ograničenja dodira, uz jednog džokera.',
      en: 'No touch limit, plus one neutral player.',
    },
    harder: {
      bs: 'Pet dodavanja prije ulaska u zonu.',
      en: 'Five passes before anyone enters the zone.',
    },
    focus: ['passing_combinations', 'build_up'],
    phase: 'game',
    minPlayers: 8,
    maxPlayers: 18,
    minutes: 20,
    minArea: 'half',
    equipment: ['balls', 'cones', 'bibs'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 0.8,
  },
  {
    key: 'win-it-and-score',
    name: { bs: 'Oduzmi i daj gol', en: 'Win it and score' },
    summary: {
      bs: 'Jedna ekipa gradi napad od svog gola, druga visokim presingom oduzima loptu i brzo napada.',
      en: 'One team builds from its own goal while the other presses high to win the ball and attack fast.',
    },
    setup: {
      bs: 'Polje 40 x 30 m, mali golovi na oba kraja. Ekipe mijenjaju uloge svakih pet minuta.',
      en: 'A 40 x 30 m area with small goals at both ends. Teams swap roles every five minutes.',
    },
    coachingPoints: [
      {
        bs: 'Pritiskaj iz ugla, prema bočnoj liniji.',
        en: 'Press at an angle, towards the touchline.',
      },
      { bs: 'U duelu ostani na nogama.', en: 'Stay on your feet in the duel.' },
    ],
    easier: {
      bs: 'Ekipa u presingu ima igrača više.',
      en: 'The pressing team has an extra player.',
    },
    harder: {
      bs: 'Gol poslije oduzimanja važi samo u osam sekundi.',
      en: 'A goal after winning the ball only counts within eight seconds.',
    },
    focus: ['pressing', 'one_v_one_defending'],
    phase: 'game',
    minPlayers: 8,
    maxPlayers: 16,
    minutes: 20,
    minArea: 'half',
    equipment: ['balls', 'cones', 'bibs', 'small_goals'],
    ageGroups: FROM_U11,
    repsPerPlayerMinute: 0.5,
  },
  {
    key: 'counter-attack-game',
    name: { bs: 'Igra kontranapada', en: 'Counter-attack game' },
    summary: {
      bs: 'Obična igra, ali gol iz kontranapada u deset sekundi vrijedi tri.',
      en: 'A normal game, but a goal from a counter within ten seconds is worth three.',
    },
    setup: {
      bs: 'Polje 45 x 35 m, mali golovi, ekipe od četiri do deset igrača.',
      en: 'A 45 x 35 m area, small goals, teams of four to ten.',
    },
    coachingPoints: [
      {
        bs: 'Kad oduzmeš loptu, prvo traži dubinu.',
        en: 'When you win the ball, look for depth first.',
      },
      {
        bs: 'Ko izgubi loptu, odmah pritišće.',
        en: 'Whoever loses the ball presses straight away.',
      },
    ],
    easier: { bs: 'Kontra traje petnaest sekundi.', en: 'Counters get fifteen seconds.' },
    harder: { bs: 'Kontra traje samo sedam sekundi.', en: 'Counters get only seven seconds.' },
    focus: ['transition', 'pressing'],
    phase: 'game',
    minPlayers: 8,
    maxPlayers: 20,
    minutes: 20,
    minArea: 'half',
    equipment: ['balls', 'bibs', 'small_goals'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 0.5,
  },
  {
    key: 'conditioned-match',
    name: { bs: 'Utakmica s uslovom', en: 'Conditioned match' },
    summary: {
      bs: 'Utakmica na cijelom terenu; gol poslije pet dodavanja zaredom vrijedi dva.',
      en: 'A full-pitch match; a goal after five passes in a row counts double.',
    },
    setup: {
      bs: 'Cijeli teren, dva gola s golmanima, ekipe od šest do jedanaest igrača.',
      en: 'The full pitch, two goals with keepers, teams of six to eleven.',
    },
    coachingPoints: [
      { bs: 'Pokreni se da otvoriš liniju dodavanja.', en: 'Move to open a passing line.' },
      { bs: 'Svaki napad završi udarcem.', en: 'Finish every attack with a shot.' },
    ],
    easier: {
      bs: 'Tri dodavanja zaredom umjesto pet.',
      en: 'Three passes in a row instead of five.',
    },
    harder: { bs: 'Najviše tri dodira po igraču.', en: 'Three touches maximum per player.' },
    focus: ['passing_combinations', 'finishing'],
    phase: 'game',
    minPlayers: 12,
    maxPlayers: 22,
    minutes: 25,
    minArea: 'full',
    equipment: ['balls', 'bibs', 'full_goals'],
    ageGroups: FROM_U11,
    repsPerPlayerMinute: 0.4,
  },
];
