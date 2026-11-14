# Dungeon Tactics

A turn-based tactics game for the browser, with the pacing and layout of Final Fantasy Tactics and Tactics Ogre, painted 3D maps, KayKit characters and a story campaign. Nothing is copied from the originals: art, music, text and rules are our own.

**Play:** https://dungeon-tactics.fernandorffdev.com

## Features

- **Campaign "Beacon Ashes":** an opening, character creation, an illustrated world map with towns, 7 battles across 2 acts with dialogue before and after each one, and an epilogue.
- **Tactical rules in the FFT tradition:** a CT turn queue, charged spells, per-class jump and leaps, height that adds range and hit chance, facing, push and fall damage, counters, deep and shallow water, spike traps and 2x2 bosses.
- **Move, act, keep moving:** units spend a movement budget around their action, and the move can be undone while nothing has happened.
- **Party management:** recruit at the tavern, change classes (including the new lancer), equip items bought at the shop, take side quests.
- **Readable combat:** a Tactics Ogre-style forecast with hit chance and HP before and after, shot trajectories that stop at the first obstacle, a range ring for the longest skill and an action camera.
- **Painted maps:** smooth terrain with hand-made textures, procedural trees and props, wave-field water with currents and waterfalls, fog and light per map, 8 camera angles.
- Keyboard, mouse and gamepad; English and Portuguese.

## Stack

- **Client:** TypeScript, Vite, Three.js (WebGL), plain DOM and CSS for the interface, Web Audio. Deployed as static files on Cloudflare.
- **Rules:** `src/shared/battle`, pure TypeScript with no DOM, so the same code runs the game, the AI and the headless simulator.
- **Tests:** Vitest for the rules and the pure client functions.

## Run

```bash
npm ci
npm run dev        # http://localhost:5173
npm run typecheck
npx vitest run
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and commit convention, and [CLAUDE.md](CLAUDE.md) for the code rules and decision log.

## Credits

Models, textures, effects, sounds and music under free licences (KayKit, Kenney, ambientCG, Poly Haven, OpenGameArt): full list in `public/CREDITS.txt` and an index of every asset in [docs/ASSETS.md](docs/ASSETS.md).
