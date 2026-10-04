# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-10-04

Every change here came from the second use case, a civic lookup that waits on a live API for every answer: your senator and House member, and who is running in 2027, by state and LGA. The findings are in the use case's FINDINGS.md.

### Added

- `list(title, items, onPick, options)`: a long list in numbered pages, `9` and `8` to turn them, and with `filter: true` typing the first letters of any word to narrow it. One match is chosen at once. Items can be loaded when the screen is drawn. The page and filter are kept per screen and start afresh when the user arrives from elsewhere. (#5)
- `info(text)`: a screen that shows text and waits, with Back and Home still working. `end()` closes the session. (#7)
- `{ stay: true }` from a handler draws the screen again with nothing above it, for turning a page. `{ retry: "" }` still works. (#6)
- `ctx.room`: the characters left for a screen's own text, after the back and home hints, a retry message and a menu's options. (#8)
- `onError(error, ctx)`: return text to end the session with it when a screen, a handler or `onStart` throws. Return nothing to let the error through. Without it, errors behave as before. (#3)
- `slowMs`: warns through `onWarning` when answering one request takes longer, 3000 ms by default, since a network gives a USSD reply only a few seconds. `false` turns it off. (#4)
- `homeHint`, such as `00. Home`, shown on screens two or more steps from home, on the back hint's line.
- The simulator says how to hang up, and Ctrl+C ends the call cleanly, like Cancel on a phone.
- `startsAnyWord(label, typed)`, the matcher `list()` uses, exported for your own screens.

## [0.2.0] - 2026-10-02

Every change here came from building a real menu on 0.1.0: a mobile money service with 27 screens. The findings are in the use case's FINDINGS.md.

### Fixed

- A lost session no longer has to run side effects twice. `ctx.replaying` is true for inputs that were handled before the session was lost, so a handler can skip what must happen once. Before this, two wrong PINs followed by a server restart locked a customer out when they typed the right one.
- `paginate()` no longer uses the app's back key. The previous-page key is `8`, labelled "Previous". With `0`, the app took the key first and left the list.

### Added

- `createApp<YourData>()` types `ctx.data` and the `data` a handler passes to `goto`.
- `onStart`: runs once when a session begins. It can end the session before any screen, or start on a screen other than home.
- `prompt(text, handle, { back: false })` and `menu(text, choices, { back: false })`: the back key reaches the screen as input, for prompts where `0` is an answer. `home: false` does the same for the home key.
- `transient: true` on a screen keeps it out of the history, so Back skips a PIN prompt the user has already passed.
- `backHint`: a line such as "0. Back" added to every screen the back key works on.
- `menu(title, [["Send money", "send"], ...])` numbers its own items.
- `paginate(items, { numbered: false })` for lists people read but do not pick from.
- `testPhone`: `loseSession()`, `steps` and `transcript()`.
- The simulator shows piped input, so a scripted run reads as a transcript.
- `frame()` is exported.

### Changed

- `Context` has a new required field, `replaying`. Code that builds a context by hand, as a test fixture might, needs to add it.

## [0.1.0] - 2026-09-30

### Added

- `createApp()` with declarative screens, `menu()`, `prompt()`, `end()` and `lines()` helpers.
- Navigation: `goto`, `retry`, `end`, `back`, `home`, plus configurable back and home keys.
- Session stores: in-memory with TTL and sweep, and `createRedisStore()` for ioredis or node-redis.
- Automatic session replay from the gateway's input history when a session is lost.
- Africa's Talking gateway adapter.
- `createNodeHandler()` for node:http, Express and anything that passes `(req, res)`.
- `testPhone()` for driving an app in tests without HTTP.
- `simulate()` terminal phone for local apps and the `ussdkit dial` command for any USSD endpoint.
- `paginate()` for long lists.
- Over-length screen warnings.
- PayBank example app.

[Unreleased]: https://github.com/omoyolab/ussdkit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/omoyolab/ussdkit/releases/tag/v0.1.0
