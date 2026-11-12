import { ALL_AGES, FROM_U9, type Drill } from './types';

/** Warm-ups: short, ball-heavy, and already pointed at the session's focus. */
export const WARMUP_DRILLS: readonly Drill[] = [
  {
    key: 'rondo-warmup',
    name: { bs: 'Rondo 5 na 2', en: 'Rondo 5 v 2' },
    summary: {
      bs: 'Petorica čuvaju loptu po rubu kvadrata, dvojica u sredini pokušavaju je oduzeti.',
      en: 'Five players keep the ball around the edge of a square while two in the middle try to win it.',
    },
    setup: {
      bs: 'Kvadrat 10 x 10 m od čunjeva. Grupe po sedam igrača, dvojica s markerima u sredini.',
      en: 'Mark a 10 x 10 m square with cones. Groups of seven, two in bibs in the middle.',
    },
    coachingPoints: [
      {
        bs: 'Otvori tijelo prije nego što lopta stigne.',
        en: 'Open your body before the ball arrives.',
      },
      {
        bs: 'Prvi dodir dalje od protivnika, u slobodan prostor.',
        en: 'First touch away from the defender, into space.',
      },
    ],
    easier: {
      bs: 'Veći kvadrat ili samo jedan igrač u sredini.',
      en: 'A bigger square or only one defender in the middle.',
    },
    harder: { bs: 'Najviše dva dodira po igraču.', en: 'Two touches maximum.' },
    focus: ['receiving_under_pressure', 'passing_combinations'],
    phase: 'warmup',
    minPlayers: 6,
    maxPlayers: 21,
    minutes: 10,
    minArea: 'quarter',
    equipment: ['balls', 'cones', 'bibs'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 2,
  },
  {
    key: 'gate-dribble',
    name: { bs: 'Driblanje kroz vrata', en: 'Gate dribbling' },
    summary: {
      bs: 'U paru jedan vodi loptu kroz vrata od čunjeva, a drugi ga prati kao sjena.',
      en: 'In pairs, one dribbles through cone gates while the other follows as a shadow defender.',
    },
    setup: {
      bs: 'Rasporedite 8 do 10 vrata širine 2 m po prostoru. Svaki par ima jednu loptu.',
      en: 'Scatter 8 to 10 gates, 2 m wide, around the area. One ball per pair.',
    },
    coachingPoints: [
      { bs: 'Glava gore, traži slobodna vrata.', en: 'Head up, find a free gate.' },
      {
        bs: 'Odbrambeni igrač ostaje na nogama i ne uklizava.',
        en: 'The defender stays on their feet and does not slide in.',
      },
    ],
    easier: { bs: 'Odbrambeni igrač samo hoda.', en: 'The defender only walks.' },
    harder: {
      bs: 'Odbrambeni igrač smije oduzeti loptu; bod za svaka vrata.',
      en: 'The defender may tackle; a point for every gate.',
    },
    focus: ['one_v_one_attacking', 'one_v_one_defending'],
    phase: 'warmup',
    minPlayers: 4,
    maxPlayers: 24,
    minutes: 10,
    minArea: 'quarter',
    equipment: ['balls', 'cones'],
    ageGroups: ALL_AGES,
    repsPerPlayerMinute: 1.5,
  },
  {
    key: 'pass-and-shoot',
    name: { bs: 'Dodaj i šutiraj', en: 'Pass and shoot' },
    summary: {
      bs: 'Igrač doda, dobije loptu nazad i šutira na gol iz prvog ili drugog dodira.',
      en: 'A player passes, gets the ball back and shoots with the first or second touch.',
    },
    setup: {
      bs: 'Dvije kolone 20 m od gola, golman na golu. Lopte su kod prve kolone.',
      en: 'Two lines 20 m from goal, a keeper in goal. Balls with the first line.',
    },
    coachingPoints: [
      { bs: 'Pogledaj golmana prije udarca.', en: 'Look at the keeper before you strike.' },
      { bs: 'Prvo preciznost, pa snaga.', en: 'Accuracy first, then power.' },
    ],
    easier: {
      bs: 'Kraća udaljenost, udarac iz mirne lopte.',
      en: 'A shorter distance, shoot from a still ball.',
    },
    harder: {
      bs: 'Samo iz prvog dodira; dodavanje dolazi sa strane.',
      en: 'First time only; the pass comes from the side.',
    },
    focus: ['finishing'],
    phase: 'warmup',
    minPlayers: 6,
    maxPlayers: 18,
    minutes: 10,
    minArea: 'half',
    equipment: ['balls', 'cones', 'full_goals'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 0.6,
  },
  {
    key: 'hunt-the-ball',
    name: { bs: 'Lov na loptu', en: 'Hunt the ball' },
    summary: {
      bs: 'Tri lovca zajedno pritišću igrača s loptom; kad je osvoje, odmah je iznose iz kvadrata.',
      en: 'Three hunters press the player on the ball together; when they win it, they dribble out of the square at once.',
    },
    setup: {
      bs: 'Kvadrat 20 x 20 m. Svi osim lovaca imaju loptu. Lovci nose markere i mijenjaju se svake minute.',
      en: 'A 20 x 20 m square. Everyone except the hunters has a ball. Hunters wear bibs and change every minute.',
    },
    coachingPoints: [
      {
        bs: 'Najbliži pritišće, ostali zatvaraju dodavanje.',
        en: 'The nearest player presses, the others cut off the pass.',
      },
      {
        bs: 'Kad oduzmeš loptu, prvo pogledaj naprijed.',
        en: 'When you win the ball, look forward first.',
      },
    ],
    easier: { bs: 'Četiri lovca umjesto tri.', en: 'Four hunters instead of three.' },
    harder: {
      bs: 'Lovci moraju izaći iz kvadrata za pet sekundi.',
      en: 'Hunters must leave the square within five seconds.',
    },
    focus: ['pressing', 'transition'],
    phase: 'warmup',
    minPlayers: 8,
    maxPlayers: 20,
    minutes: 10,
    minArea: 'quarter',
    equipment: ['balls', 'cones', 'bibs'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 1.2,
  },
  {
    key: 'passing-square',
    name: { bs: 'Kvadrat dodavanja', en: 'Passing square' },
    summary: {
      bs: 'Dodaj i prati svoju loptu do sljedećeg čunja; lopta stalno putuje.',
      en: 'Pass and follow your ball to the next cone; the ball never stops.',
    },
    setup: {
      bs: 'Četiri čunja u kvadratu 12 x 12 m, po dva igrača kod svakog. Dvije lopte u igri.',
      en: 'Four cones in a 12 x 12 m square, two players at each. Two balls in play.',
    },
    coachingPoints: [
      { bs: 'Primi loptu na dalju nogu.', en: 'Receive on your back foot.' },
      {
        bs: 'Dodaj u nogu u koju saigrač želi loptu.',
        en: 'Pass to the foot your teammate asks for.',
      },
    ],
    easier: {
      bs: 'Jedna lopta, dodavanje samo u jednom smjeru.',
      en: 'One ball, passes in one direction only.',
    },
    harder: {
      bs: 'Dvije lopte u suprotnim smjerovima, najviše dva dodira.',
      en: 'Two balls going opposite ways, two touches maximum.',
    },
    focus: ['passing_combinations', 'build_up'],
    phase: 'warmup',
    minPlayers: 6,
    maxPlayers: 20,
    minutes: 12,
    minArea: 'quarter',
    equipment: ['balls', 'cones'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 2.5,
  },
  {
    key: 'turn-and-go',
    name: { bs: 'Okreni se i kreni', en: 'Turn and go' },
    summary: {
      bs: 'Igrač prima loptu leđima okrenut igri, okreće se uz lagani pritisak i vodi loptu do linije.',
      en: 'A player receives with their back to play, turns under light pressure and dribbles to a line.',
    },
    setup: {
      bs: 'Grupe po tri: dodavač, primač i odbrambeni igrač iza primača. Linija je 15 m iza njih.',
      en: 'Groups of three: passer, receiver and a defender behind the receiver. A line 15 m behind them.',
    },
    coachingPoints: [
      {
        bs: 'Prije prijema pogledaj preko ramena.',
        en: 'Check over your shoulder before the ball arrives.',
      },
      {
        bs: 'Okreni se na stranu gdje nema odbrambenog igrača.',
        en: 'Turn away from the side the defender is on.',
      },
    ],
    easier: { bs: 'Odbrambeni igrač samo stoji.', en: 'The defender just stands.' },
    harder: { bs: 'Odbrambeni igrač igra punom snagom.', en: 'The defender plays at full effort.' },
    focus: ['receiving_under_pressure', 'one_v_one_attacking'],
    phase: 'warmup',
    minPlayers: 3,
    maxPlayers: 24,
    minutes: 10,
    minArea: 'quarter',
    equipment: ['balls', 'cones'],
    ageGroups: ALL_AGES,
    repsPerPlayerMinute: 1.8,
  },
];
