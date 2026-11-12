import { FROM_U11, FROM_U9, type Drill } from './types';

/** Main practices for finishing, defending, building up, pressing and transition. */
export const MAIN_DRILLS_B: readonly Drill[] = [
  {
    key: 'finishing-crosses',
    name: { bs: 'Završnica poslije centaršuta', en: 'Finishing from crosses' },
    summary: {
      bs: 'Krilo ide niz bok i centrira, a dva napadača napadaju bližu i dalju stativu.',
      en: 'A winger goes down the side and crosses while two strikers attack the near and far post.',
    },
    setup: {
      bs: 'Pola terena, golman na golu, kolone na oba boka i dvije u sredini.',
      en: 'Half a pitch, a keeper in goal, lines on both wings and two in the middle.',
    },
    coachingPoints: [
      {
        bs: 'Napadači ne ulaze prerano u šesnaesterac.',
        en: 'Strikers do not arrive in the box too early.',
      },
      {
        bs: 'Jedan na bližu, jedan na dalju stativu.',
        en: 'One to the near post, one to the far post.',
      },
    ],
    easier: {
      bs: 'Lopta se ubacuje rukom ili iz mjesta.',
      en: 'The ball is thrown in or crossed from standing.',
    },
    harder: { bs: 'Dodajte jednog ili dva odbrambena igrača.', en: 'Add one or two defenders.' },
    focus: ['finishing'],
    phase: 'main',
    minPlayers: 8,
    maxPlayers: 16,
    minutes: 15,
    minArea: 'half',
    equipment: ['balls', 'cones', 'full_goals'],
    ageGroups: FROM_U11,
    repsPerPlayerMinute: 0.8,
  },
  {
    key: 'two-v-one-to-goal',
    name: { bs: '2 na 1 prema golu', en: '2 v 1 to goal' },
    summary: {
      bs: 'Dva napadača protiv jednog odbrambenog igrača; napad mora završiti udarcem za osam sekundi.',
      en: 'Two attackers against one defender; the attack must end in a shot within eight seconds.',
    },
    setup: {
      bs: 'Kanal širine 25 m ispred gola, golman na golu. Napadači kreću 30 m od gola.',
      en: 'A 25 m wide channel in front of goal, a keeper in goal. Attackers start 30 m out.',
    },
    coachingPoints: [
      {
        bs: 'Vodi loptu na odbrambenog igrača da ga vežeš.',
        en: 'Dribble at the defender to commit them.',
      },
      { bs: 'Dodaj ili šutiraj, ali odluči rano.', en: 'Pass or shoot, but decide early.' },
    ],
    easier: { bs: 'Odbrambeni igrač kreće sa zakašnjenjem.', en: 'The defender starts late.' },
    harder: {
      bs: 'Drugi odbrambeni igrač se vraća i pomaže.',
      en: 'A second defender recovers to help.',
    },
    focus: ['finishing', 'one_v_one_attacking'],
    phase: 'main',
    minPlayers: 6,
    maxPlayers: 18,
    minutes: 15,
    minArea: 'half',
    equipment: ['balls', 'cones', 'bibs', 'full_goals'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 0.9,
  },
  {
    key: 'defend-the-line',
    name: { bs: 'Odbrani liniju', en: 'Defend the line' },
    summary: {
      bs: 'Odbrambeni igrač doda loptu napadaču, zatvori ga i ne da mu da pređe liniju s loptom.',
      en: 'The defender passes to the attacker, closes them down and stops them crossing the line with the ball.',
    },
    setup: {
      bs: 'Polje 15 x 10 m. Odbrambeni igrač na jednoj liniji, napadač na drugoj, kolone iza obje.',
      en: 'A 15 x 10 m area. Defender on one line, attacker on the other, queues behind both.',
    },
    coachingPoints: [
      {
        bs: 'Zatvori brzo, pa uspori zadnja dva metra.',
        en: 'Close fast, then slow down for the last two metres.',
      },
      { bs: 'Gledaj loptu, ne noge napadača.', en: "Watch the ball, not the attacker's feet." },
    ],
    easier: { bs: 'Uže polje.', en: 'A narrower area.' },
    harder: { bs: 'Šire polje.', en: 'A wider area.' },
    focus: ['one_v_one_defending'],
    phase: 'main',
    minPlayers: 6,
    maxPlayers: 16,
    minutes: 15,
    minArea: 'quarter',
    equipment: ['balls', 'cones'],
    ageGroups: FROM_U9,
    repsPerPlayerMinute: 1.1,
  },
  {
    key: 'build-from-keeper',
    name: { bs: 'Izgradnja od golmana', en: 'Building from the keeper' },
    summary: {
      bs: 'Golman i četiri odbrambena igrača iznose loptu protiv tri napadača i osvajaju bod prolaskom kroz vrata na centru.',
      en: 'The keeper and four defenders play out against three attackers and score by dribbling through a gate at halfway.',
    },
    setup: {
      bs: 'Pola terena, golman na golu, dvoja vrata od čunjeva na centru. Napadači koji oduzmu loptu napadaju gol.',
      en: 'Half a pitch, a keeper in goal, two cone gates on halfway. Attackers who win the ball go for goal.',
    },
    coachingPoints: [
      {
        bs: 'Štoperi se šire do ivice šesnaesterca.',
        en: 'Centre-backs split wide to the edge of the box.',
      },
      {
        bs: 'Ako je naprijed zatvoreno, vrati i promijeni stranu.',
        en: 'If forward is closed, play back and switch.',
      },
    ],
    easier: { bs: 'Dva napadača umjesto tri.', en: 'Two attackers instead of three.' },
    harder: {
      bs: 'Četiri napadača i najviše tri dodira.',
      en: 'Four attackers and three touches maximum.',
    },
    focus: ['build_up'],
    phase: 'main',
    minPlayers: 8,
    maxPlayers: 16,
    minutes: 20,
    minArea: 'half',
    equipment: ['balls', 'cones', 'bibs', 'full_goals'],
    ageGroups: FROM_U11,
    repsPerPlayerMinute: 0.7,
  },
  {
    key: 'press-on-trigger',
    name: { bs: 'Presing na signal', en: 'Press on the trigger' },
    summary: {
      bs: 'Igra 4 na 4 do 6 na 6; loš prijem ili dodavanje unazad je signal da cijela ekipa krene u presing.',
      en: 'A 4 v 4 to 6 v 6 game where a poor touch or a backward pass is the signal for the whole team to press.',
    },
    setup: {
      bs: 'Polje 40 x 30 m, dva mala gola na svakom kraju. Gol u pet sekundi poslije oduzimanja vrijedi dupli.',
      en: 'A 40 x 30 m area, two small goals at each end. A goal within five seconds of winning the ball counts double.',
    },
    coachingPoints: [
      { bs: 'Prepoznaj signal i krenite zajedno.', en: 'Spot the trigger and go together.' },
      { bs: 'Zatvori put prema sredini.', en: 'Shut off the way into the middle.' },
    ],
    easier: {
      bs: 'Trener glasno najavljuje signal.',
      en: 'The coach calls the trigger out loud.',
    },
    harder: {
      bs: 'Veće polje, pa presing mora biti brži.',
      en: 'A bigger area, so the press has to be quicker.',
    },
    focus: ['pressing', 'transition'],
    phase: 'main',
    minPlayers: 8,
    maxPlayers: 16,
    minutes: 20,
    minArea: 'half',
    equipment: ['balls', 'cones', 'bibs', 'small_goals'],
    ageGroups: FROM_U11,
    repsPerPlayerMinute: 0.9,
  },
  {
    key: 'transition-waves',
    name: { bs: 'Talasi tranzicije', en: 'Transition waves' },
    summary: {
      bs: 'Ekipa napada 3 na 2; čim napad završi, odbrambeni igrači dobiju novu loptu i kontriraju na drugu stranu.',
      en: 'One team attacks 3 v 2; as soon as the attack ends, the defenders get a new ball and counter the other way.',
    },
    setup: {
      bs: 'Polje 40 x 25 m, mali golovi na oba kraja. Ekipe po tri igrača čekaju iza golova.',
      en: 'A 40 x 25 m area with small goals at both ends. Teams of three wait behind the goals.',
    },
    coachingPoints: [
      {
        bs: 'Kad se posjed promijeni, prvo pogledaj naprijed.',
        en: 'When the ball changes hands, look forward first.',
      },
      {
        bs: 'Kad izgubiš loptu, odmah se vrati iza nje.',
        en: 'When you lose it, get back behind the ball at once.',
      },
    ],
    easier: {
      bs: 'Trener ubacuje novu loptu sa zakašnjenjem.',
      en: 'The coach plays the new ball in later.',
    },
    harder: {
      bs: 'Kontra mora završiti za šest sekundi.',
      en: 'The counter must finish within six seconds.',
    },
    focus: ['transition'],
    phase: 'main',
    minPlayers: 6,
    maxPlayers: 18,
    minutes: 15,
    minArea: 'half',
    equipment: ['balls', 'cones', 'bibs', 'small_goals'],
    ageGroups: FROM_U11,
    repsPerPlayerMinute: 1,
  },
];
