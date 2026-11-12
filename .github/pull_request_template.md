## What changed

<!-- One idea. If this needs "and", it is two pull requests. -->

## Why

<!-- The problem a coach or an operator had, or the finding this answers. -->

## How it was checked

- [ ] `npm run verify` passes locally
- [ ] New behaviour has a test that fails without the change
- [ ] Screens were looked at on a phone width, in both languages, light and dark
- [ ] Database change: a test in `supabase/tests/` covers the rule, and the types were regenerated

<!-- Say exactly what you looked at, and what is covered by tests only. -->

## Risk and how to undo it

<!-- What could go wrong for someone using the previous release? How is this undone:
     promote the previous deployment, switch the feature off, or a follow-up migration? -->
