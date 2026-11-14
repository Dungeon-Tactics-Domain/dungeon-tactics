# scripts

Applies together with the root `CLAUDE.md`.

- `battle-sim.ts`: AI against AI over N seeds (`npm run sim -- <scenario> <seeds>`). Optional: balance is decided by playing, not by the simulator.
- `smoke-game.mjs` (`npm run smoke`): serves `dist/` with `vite preview` on port 4173 and opens the title, `?scenario=ash_wood` and `?world` in headless Chrome (`PW_CHANNEL=chromium` in CI); fails on a missing screen, a console error or a failed request.
- `sandbox.mjs` (`npm run sandbox -- <spec.json | folder> [--out dir] [--sheet] [--url base]`): screenshots from scene specs (map, units, camera, hidden HUD) through its own Vite dev server and headless Chrome, one fresh context per spec on Playwright's fake clock, so the same spec gives the same picture; examples in `sandbox/`, format and live API in `docs/sandbox.md`.
- `smoke.mjs`: smoke test of the static site (page, bundle, icons, one model); runs on deploy and in the PR environment.
- `assets/`, `portraits.mjs`, `slim-character.mjs`, `lib/browser.mjs`: asset tools inherited from Warlock (icon sprite, KayKit index, portraits, animation trimming, windowless Chrome).
- They run straight on Node, which only strips types: no `enum` and no constructor parameter properties.
