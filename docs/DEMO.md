# Demo script

Five minutes, one phone, one laptop. Everything below runs on the live site; nothing is staged.

Live site: <https://klupa-pi.vercel.app>

## Before you start

- Phone: open the site, tap **Try the demo club**, then **Create club**. Today loads an invented season by itself (about three seconds), so every screen has real numbers. Two taps.
- Laptop: a demo account lives on one phone, so the laptop shows the public pages. Start on the front page: it says what Klupa is, shows the live match centre and a film of the 3D replay, and its header leads to **Pro matches**, **3D replay**, **Shot lab** and **Research**. Open the 2018 final in one tab and the **Match replay** in a second, and press play once on the replay so the 3D scene has loaded.
- Both: switch the language once so the jury sees Bosnian and English.

## The story (say this, in this order)

**1. The problem (20 s).** A volunteer coach of twelve-year-olds has one evening a week and a phone. Apps built for professionals give them a chart that looks certain and is not, and they ask for data about children that nobody should be collecting.

**2. Today (30 s).** Open the home screen on the phone. Three rings: did everyone get a fair share of minutes, has every child been looked at, was effort recorded. Under them, the three things that most need the coach this week. Tap a ring to show how the number is computed.

**3. A match, live (45 s).** Matches → the live match → tap a shot, pick where it was taken from, tap a corner, tap "lost the ball in our half". Switch the phone to flight mode and tap two more events: they wait in the outbox. Switch back: they send, once each. Then Home → **Watch live**: the match centre shows the score, who is on top as of the newest event and how far that can be trusted, and the counts so far. A second signed-in member of the club sees the same page update by itself as the coach taps.

**4. Momentum, honestly (45 s).** In the review, drag across the chart. Change the window from three minutes to ten: the app says when the answer depends on the window, instead of drawing one confident line. Then the evidence page: on 1,941 professional matches, the three- and ten-minute windows point in opposite directions in 18.9% of the moments where both lean. That is why the app refuses to pretend.

**5. Why they scored (30 s).** Scroll to "How the chances came about". For each side: chances after winning the ball high, after the other side lost it in its own half, after a corner. The app names a pattern only when at least three chances exist and one lead-up is behind half of them.

**6. From the match to training (30 s).** "Plan training from this match". The planner picks drills for the players who will be there, the pitch area and the kit, and explains what it left out and why.

**7. Fairness and load (30 s).** The fairness screen: minutes, training, what was observed, and a "second look" list of children who have had few chances to be seen. The relative-age check uses only a birth quarter. The load view flags a week that jumped, in plain words, not a medical claim.

**8. What the engine can read (60 s).** On the laptop: Pro matches, the 2018 World Cup final. Press **Watch as live** at 60×: the score, the chance-quality race, the momentum reading and the passing network build up minute by minute; a goal lands and its build-up can be replayed from above or in 3D. It is the same engine that read the taps a minute ago. Then the match replay: twenty-two players in 3D from open tracking data, team shape, who controls which space, one player's trail, speed and distance, and the physical report. Then Shot lab on the phone: the example kick, the strike found, the knee angle, the standing foot, all computed on the phone with nothing uploaded.

**9. Built to be trusted (20 s).** A child is a label and a shirt number. Row-level security on every table, tested by trying to break it. Every multi-step write is one transaction. One endpoint that says whether the database and sign-in actually answer. The numbers are in the README.

## If something goes wrong

- **No signal in the room:** the app shell and the last screens load from the phone's cache; tagging works offline by design. Say so and show the outbox.
- **3D does not render on the projector laptop:** the replay falls back to a flat pitch with the same controls.
- **Sign-in e-mail is slow:** use the demo club; it needs no e-mail.

## What not to claim

- Shot lab's measurements are checked on a generated kick and in tests. It has not been validated on real match footage, and the screen says which numbers depend on estimated depth.
- The player overlay shows where players are in the picture, not on the pitch: no distances, no speeds, and its numbers are not shirt numbers. It is checked in tests and on one sample clip of adults, not on a real match filmed from the touchline or on a real phone.
- The replays are seven professional matches from open data. A grassroots coach's own matches have no tracking data.
- The pro matches are read from event data: no off-ball positions, "share of passes" is not possession time, and a pass's receiver is read from the next touch. The live match centre knows the events, not the clock on the recording phone.
- Chance quality is a model trained on professional shots. For a youth team it ranks chances; it is not a probability of scoring.
- The load view is arithmetic on recorded minutes and effort. It is a prompt to talk to the player, not an injury prediction.
