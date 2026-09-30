# Contributing to ussdkit

Thanks for helping. This file covers setup, the kinds of changes we are looking for, and
what a pull request needs to be merged.

## Setup

```sh
git clone https://github.com/omoyolab/ussdkit
cd ussdkit
pnpm install
pnpm check        # lint, typecheck, build, test
```

Node 20 or newer and pnpm 9 or newer. The CLI tests run the built `dist/cli.js`, so run
`pnpm build` (or `pnpm check`) before `pnpm test` if you only changed the CLI.

| Script            | What it does           |
| ----------------- | ---------------------- |
| `pnpm dev`        | Rebuild on change      |
| `pnpm test:watch` | Re-run tests on change |
| `pnpm format`     | Prettier               |
| `pnpm check`      | Everything CI runs     |

Try things quickly with `node examples/paybank.mjs --simulate`.

## What we are looking for

**Gateway adapters.** The most valuable contribution. One file in `src/gateways/`
exporting a `Gateway` object with `parse`, `format` and `contentType`, registered in
`src/gateways/index.ts`, with a test file mirroring `test/africastalking.test.ts`. Link
the gateway's documentation in a comment at the top. If the gateway does not resend
input history, say so in the README table.

**Network gotchas.** Character limits, encoding quirks, how a specific operator handles
timeouts. Open an issue or add a note to the README. This knowledge is scattered across
Slack groups and it belongs somewhere permanent.

**Store adapters.** Anything with `get`, `set` and `delete`. Keep them dependency-free
by accepting a client object the way `createRedisStore` does.

**Bugs and docs.** Always welcome. Small PRs merge fastest.

For roadmap items (browser simulator, lint command, SMS fallback) open an issue first so
we can agree on the shape.

## Pull request checklist

- `pnpm check` passes.
- New behaviour has a test. Bug fixes have a test that fails without the fix.
- `CHANGELOG.md` has a line under **Unreleased**.
- README updated if the API, a command or a gateway changed.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):
  `feat:`, `fix:`, `docs:`, `test:`, `chore:`. Scope is optional, e.g. `feat(gateway): add hubtel`.

## Code style

Prettier and ESLint are configured, so formatting is not a review topic. Beyond that:

- No runtime dependencies. Node's standard library is enough.
- Errors thrown to developers are `UssdkitError` with a `hint` that says what to do next.
- Errors must never reach the phone as a stack trace.
- Keep `app.ts` the only place that knows about sessions and navigation.

## Releasing (maintainers)

1. Update `CHANGELOG.md`: move **Unreleased** into a new version heading with today's date.
2. `pnpm version <patch|minor|major>` to bump `package.json` and create the tag.
3. `git push --follow-tags`.
4. The release workflow runs `pnpm check`, publishes to npm with provenance through
   Trusted Publishing, and creates the GitHub release from the tag.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind.
