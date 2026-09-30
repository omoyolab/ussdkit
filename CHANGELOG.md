# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
