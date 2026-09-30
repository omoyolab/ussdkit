# Examples

## `paybank.mjs`

A complete small app: menus, free-text prompts with validation, data carried between
screens, a confirmation step, dynamic end screens and a paginated list.

```sh
pnpm build                          # once, so ../dist exists

node examples/paybank.mjs --simulate   # phone in your terminal, no server needed

node examples/paybank.mjs              # or serve it on http://localhost:3000/ussd
npx @omoyolab/ussdkit dial http://localhost:3000/ussd   # and dial it from another terminal
```

The example imports from `../dist` so it runs inside this repo. In your own project,
import from `@omoyolab/ussdkit`.
