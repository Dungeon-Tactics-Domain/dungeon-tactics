# scripts

Applies together with the root `CLAUDE.md`.

- `battle-sim.ts`: AI against AI over N seeds (`npm run sim -- <scenario> <seeds>`). Optional: balance is decided by playing, not by the simulator.
- `smoke.mjs`: smoke test of the static site (page, bundle, icons, one model); runs on deploy and in the PR environment.
- `assets/`, `portraits.mjs`, `slim-character.mjs`, `lib/browser.mjs`: asset tools inherited from Warlock (icon sprite, KayKit index, portraits, animation trimming, windowless Chrome).
- They run straight on Node, which only strips types: no `enum` and no constructor parameter properties.
