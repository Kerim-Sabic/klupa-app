import { ALL_AGES, FROM_U11, FROM_U9, type Drill } from './types';

/** Main practices for receiving, passing and finishing. */
export const MAIN_DRILLS_A: readonly Drill[] = [
  {
    key: 'possession-neutrals',
    name: { bs: 'Posjed 4 na 4 uz tri džokera', en: 'Possession 4 v 4 with three neutrals' },
    summary: {
      bs: 'Dvije ekipe po četiri čuvaju loptu uz tri džokera koji uvijek igraju s ekipom u posjedu.',
      en: 'Two teams of four keep the ball with three neutrals who always play for the team in possession.',
    },
    setup: {
      bs: 'Polje 30 x 25 m, džokeri u trećoj boji markera. S manje igrača igrajte 3 na 3 uz dva džokera.',
      en: 'A 30 x 25 m area, neutrals in a third bib colour. With fewer players, play 3 v 3 with two neutrals.',
    },
    coachingPoints: [
      { bs: 'Traži prostor između dva protivnika.', en: 'Find space between two opponents.' },
      {
        bs: 'Prvi dodir te mora izvući iz pritiska.',
        en: 'Your first touch must take you out of pressure.',
      },
    ],
    easier: { bs: 'Četiri džokera ili veće polje.', en: 'Four neutrals or a bigger area.' },
    harder: { bs: 'Džokeri igraju samo iz prve.', en: 'Neutrals play one touch only.' },
    focus: ['receiving_under_pressure', 'passing_combinations'],
    phase: 'main',
    minPlayers: 8,
    maxPlayers: 16,
    minutes: 20,
    minArea: 'half',
    equipment: ['balls', 'cones', 'bibs'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 1.4,
  },
  {
    key: 'receive-turn-channel',
    name: { bs: 'Prijem i okret u kanalu', en: 'Receive and turn in a channel' },
    summary: {
      bs: 'Igrač u sredini prima od jednog dodavača, okreće se i igra drugom dok ga protivnik pritišće.',
      en: 'The middle player receives from one passer, turns and finds the other while an opponent presses.',
    },
    setup: {
      bs: 'Kanal 20 x 10 m, dodavač na svakom kraju, primač i odbrambeni igrač u sredini. Uloge se mijenjaju svake minute.',
      en: 'A 20 x 10 m channel, a passer at each end, a receiver and a defender in the middle. Swap roles every minute.',
    },
    coachingPoints: [
      { bs: 'Skeniraj prije prijema.', en: 'Scan before you receive.' },
      {
        bs: 'Otvoren stav tijela, prijem dalje od protivnika.',
        en: 'Open body shape, receive away from pressure.',
      },
    ],
    easier: { bs: 'Odbrambeni igrač je pasivan.', en: 'The defender stays passive.' },
    harder: {
      bs: 'Najviše dva dodira do drugog dodavača.',
      en: 'Two touches maximum to reach the other passer.',
    },
    focus: ['receiving_under_pressure'],
    phase: 'main',
    minPlayers: 4,
    maxPlayers: 12,
    minutes: 15,
    minArea: 'quarter',
    equipment: ['balls', 'cones'],
    ageGroups: ['u9', 'u11', 'u13', 'u15', 'u17'],
    repsPerPlayerMinute: 2.2,
  },
  {
    key: 'pressure-box',
    name: { bs: 'Kutija pod pritiskom', en: 'Pressure box' },
    summary: {
      bs: 'Tri ekipe: dvije čuvaju loptu u kutiji, treća pritiska. Ekipa koja izgubi loptu ide u presing.',
      en: 'Three teams: two keep the ball in a box, the third presses. The team that loses the ball becomes the pressers.',
    },
    setup: {
      bs: 'Kutija 25 x 25 m, tri ekipe u različitim markerima, od tri do šest igrača u ekipi.',
      en: 'A 25 x 25 m box, three teams in different bibs, three to six players each.',
    },
    coachingPoints: [
      {
        bs: 'Primač traži liniju dodavanja prije nego lopta krene.',
        en: 'Receivers find a passing lane before the ball is played.',
      },
      { bs: 'Pritiskajte zajedno, ne jedan po jedan.', en: 'Press together, not one at a time.' },
    ],
    easier: { bs: 'Veća kutija.', en: 'A bigger box.' },
    harder: { bs: 'Najviše dva dodira u posjedu.', en: 'Two touches maximum in possession.' },
    focus: ['receiving_under_pressure', 'pressing'],
    phase: 'main',
    minPlayers: 8,
    maxPlayers: 18,
    minutes: 15,
    minArea: 'half',
    equipment: ['balls', 'cones', 'bibs'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 1.3,
  },
  {
    key: 'third-player-run',
    name: { bs: 'Treći igrač', en: 'Third-player run' },
    summary: {
      bs: 'A dodaje B, B spušta loptu C, a C igra u prostor za A koji je već krenuo.',
      en: 'A passes to B, B sets it to C, and C plays into space for A, who is already running.',
    },
    setup: {
      bs: 'Tri čunja u trouglu na 15 m razmaka i zona za utrčavanje. Grupe po tri ili četiri.',
      en: 'Three cones in a triangle 15 m apart, plus a zone to run into. Groups of three or four.',
    },
    coachingPoints: [
      {
        bs: 'Kreni u trenutku dodavanja, ne poslije.',
        en: 'Start the run as the pass is played, not after.',
      },
      { bs: 'Spusti loptu iz prve.', en: 'Set the ball with one touch.' },
    ],
    easier: { bs: 'Svako ima dva dodira.', en: 'Everyone gets two touches.' },
    harder: {
      bs: 'Dodajte pasivnog, pa aktivnog protivnika.',
      en: 'Add a passive, then an active, defender.',
    },
    focus: ['passing_combinations', 'build_up'],
    phase: 'main',
    minPlayers: 6,
    maxPlayers: 18,
    minutes: 15,
    minArea: 'half',
    equipment: ['balls', 'cones'],
    ageGroups: FROM_U11,
    repsPerPlayerMinute: 2,
  },
  {
    key: 'combine-and-finish',
    name: { bs: 'Kombinacija i završnica', en: 'Combine and finish' },
    summary: {
      bs: 'Dva napadača kombinuju kroz čunjeve i završavaju udarcem na gol.',
      en: 'Two attackers combine through a cone pattern and finish with a shot on goal.',
    },
    setup: {
      bs: 'Čunjevi u obliku slova Y, 25 m od gola, golman na golu. Dvije kolone napadača.',
      en: 'Cones in a Y shape 25 m from goal, a keeper in goal. Two lines of attackers.',
    },
    coachingPoints: [
      { bs: 'Dodaj u hod saigrača.', en: "Pass into your teammate's stride." },
      { bs: 'Šutiraj nisko, prema daljoj stativi.', en: 'Shoot low, towards the far post.' },
    ],
    easier: { bs: 'Kraća kombinacija, udarac s 12 m.', en: 'A shorter pattern, shoot from 12 m.' },
    harder: {
      bs: 'Dodajte odbrambenog igrača koji se vraća iz leđa.',
      en: 'Add a defender recovering from behind.',
    },
    focus: ['passing_combinations', 'finishing'],
    phase: 'main',
    minPlayers: 6,
    maxPlayers: 16,
    minutes: 15,
    minArea: 'half',
    equipment: ['balls', 'cones', 'full_goals'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 1,
  },
  {
    key: 'one-v-one-channels',
    name: { bs: '1 na 1 u kanalima', en: '1 v 1 in channels' },
    summary: {
      bs: 'U uskom kanalu napadač pokušava proći odbrambenog igrača i dati gol u mali gol.',
      en: 'In a narrow channel the attacker tries to beat the defender and score in a small goal.',
    },
    setup: {
      bs: 'Kanali 15 x 8 m s malim golom na kraju. Parovi se smjenjuju poslije svakog napada.',
      en: 'Channels 15 x 8 m with a small goal at the end. Pairs swap after every attack.',
    },
    coachingPoints: [
      {
        bs: 'Napadač: promijeni brzinu poslije finte.',
        en: 'Attacker: change speed after the feint.',
      },
      {
        bs: 'Odbrambeni igrač: bočni stav, tjeraj ga na slabiju nogu.',
        en: 'Defender: stand side-on and show them onto their weaker foot.',
      },
    ],
    easier: { bs: 'Širi kanal.', en: 'A wider channel.' },
    harder: {
      bs: 'Napad mora završiti za šest sekundi.',
      en: 'The attack must finish within six seconds.',
    },
    focus: ['one_v_one_attacking', 'one_v_one_defending'],
    phase: 'main',
    minPlayers: 4,
    maxPlayers: 16,
    minutes: 15,
    minArea: 'quarter',
    equipment: ['balls', 'cones', 'small_goals'],
    ageGroups: ALL_AGES,
    repsPerPlayerMinute: 1.2,
  },
];
