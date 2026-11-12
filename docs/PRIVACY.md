# Privacy and data protection

Klupa is used by coaches of children. It is built to hold as little as possible about them.

## What is stored

| Data                                               | Why                                                    | Notes                                                       |
| -------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Coach's email address                              | To sign in                                             | Held by the authentication service. Demo sessions have none |
| Club and team name                                 | To organise records                                    | Chosen by the coach                                         |
| Player label and shirt number                      | To tell players apart                                  | The app asks for a nickname or initials, not a full name    |
| Birth quarter (optional)                           | To check whether younger-born players get a fair share | The quarter only. A birth date is never stored              |
| Guardian consent status                            | To record that consent was given or withdrawn          | With the time it was recorded                               |
| Match events, minutes on the pitch                 | To review matches and playing time                     |                                                             |
| Training attendance, minutes, effort rating (1–10) | To review training load                                | A rating the player gives, not a medical measure            |
| Observation counts                                 | To see who has been observed, and how much             | Attempts and successes only                                 |
| Activity log                                       | To show who changed what                               | Column names only, never values                             |

## What is not stored

Names, birth dates, photos, video, addresses, phone numbers, health or injury records, location, device identifiers for tracking, advertising data. There are no advertising or tracking scripts and no analytics about people. The app does measure itself: error reports and three page-speed numbers per page load, neither tied to a person, both described under "Who else handles the data".

## Where and who

Data is stored in the European Union (Frankfurt). Only members of a club can read that club's records; this is enforced by the database, not only by the app. Staff of the hosting providers operate the infrastructure under their own terms.

## How long

| Data                         | Kept for                  |
| ---------------------------- | ------------------------- |
| Undone (soft-deleted) events | 30 days, then purged      |
| Activity log                 | 365 days                  |
| Demo clubs                   | 7 days                    |
| Everything else              | Until the club deletes it |

A scheduled database job runs every night to enforce this.

## Rights

- **Access and portability:** a club owner can download everything the club holds as one file, from Club → Privacy and data.
- **Erasure of one player:** removes the player, their minutes, attendance and observations; match events remain without a link to the player.
- **Erasure of a club:** removes every record of the club, including its activity log.
- **Rectification:** every field can be edited by a coach or owner.
- Each export and erasure request is recorded with a date and outcome.

**Who to ask.** A parent, guardian or player with a question about a club's records asks the club: its owner can show, correct, export and erase everything in the app, and is the one who decides. For a question about Klupa itself, how it stores data or a concern that something is wrong, write to the maintainer named on the project's repository, the same route as for a security report (`SECURITY.md`). We aim to reply within two working days.

## For clubs in Bosnia and Herzegovina and the EU

The club is the controller of its players' data and is responsible for having a lawful basis, typically the consent of a parent or guardian. Klupa records the consent status but does not collect the consent itself. Before using Klupa with real players, a club should tell guardians what is recorded and why, using the table above.

This page describes how the software behaves. It is not legal advice.

## Who else handles the data

Klupa uses three services to run. None of them is given anything beyond what the table says, and there is no advertising, no third-party script and no outside analytics service in the app. The only measurements are the app's own error reports and page-speed samples, described below the table; they go to the same database and nowhere else.

| Service  | What it does                                   | What it sees                                                                                                                               | Where                      |
| -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Supabase | The database and sign-in                       | Everything a club stores (labels, shirt numbers, matches, training), and the coach's e-mail address                                        | European Union (Frankfurt) |
| Vercel   | Serves the app's files and the health endpoint | The address a request comes from and which page was asked for. No club data passes through it: the browser talks to the database directly. | Global edge network        |
| Resend   | Delivers the sign-in code e-mail               | The coach's e-mail address and the code, for one message                                                                                   | United States              |

Video chosen in Shot lab, and the picture from its live camera, is analysed on the phone and is never uploaded or stored; the live camera keeps only the last three seconds of skeleton points, in memory, and is turned off when the coach stops it, leaves the page or hides the tab. The player overlay works the same way: the chosen video or the camera picture is analysed in the browser and is never uploaded or stored; between two frames only boxes, one colour per player and two team colours are kept, in memory, until Stop, and the camera is turned off on Stop, on leaving the page and when the tab is hidden. Its sample clip is stock footage of adults. The vision library both screens use (MediaPipe) is built to report usage counters, with no picture in them, to Google; Klupa refuses that request in the page, so it is never sent. The match replay (seven professional matches) and the pro matches (115) show open data and store nothing about the viewer.

Error reports (`docs/RUNBOOK.md`, How we know) are kept in the same database for thirty days. They hold an error's name, a message with ids, e-mail addresses and long numbers removed, the kind of screen and the release, and, when someone is signed in, the reporting account's id so that one broken phone cannot flood them. A report from a signed-out page holds no account at all.

Page-speed samples are kept the same thirty days. One row per page load: the kind of screen, the release and up to three numbers (how long the largest thing took to appear, how slow the slowest tap was, how much the layout moved). No account, no address, no device details, no cookie. They can be switched off for a build with `VITE_DISABLED_FEATURES=pageSpeed`.
