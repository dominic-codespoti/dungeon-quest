# Dungeon Quest (WIP)

Roguelike project scaffold: TypeScript + React + Phaser + Zustand. Strict typing. Exposes a machine-friendly JSON event log and `window.game` API.

## Run

```bash
npm install
npm run dev
```

## Build + Typecheck

```bash
npm run test:all  # typecheck + UI smoke checks
npm run build
# or one-shot:
npm run verify
```

## Core Flow

- **Main Menu** → open create, quick start, daily challenge, records/help overlays
- **Character Creation** → choose class/race/seed or launch daily/last-run presets
- **Run** → clear floors, survive boss milestones, reach floor 10 for victory

## Main Menu Hotkeys

- `Enter` Play (open create)
- `A` Quick Start
- `Y` Resume Last Run
- `G` Open Last Build (prefilled create)
- `Z` Daily Build (prefilled create)
- `D` Daily Challenge (immediate launch)
- `U` Copy Last Run Seed
- `V` Copy Daily Preset (`seed class/race`)
- `I` Copy Link Bundle
- `J` Copy Daily Link
- `K` Copy Profile Summary
- `P` / `R` / `H` / `?` Run Primer
- `N` Patch Notes
- `L` Legend
- `O` Records
- `Esc` close open menu modal

## Character Creation Hotkeys

- `1` Knight
- `2` Rogue
- `Q/W/E` Human/Elf/Dwarf
- `S` Surprise class/race
- `Z` Apply Daily Preset
- `Y` Apply Last-Run Preset
- `L` Start Last-Run Preset
- `D` Start Daily Preset
- `X` Randomize seed
- `C` Clear seed
- `A` Quickstart run
- `Enter` Start Adventure
- `Esc` Back to menu

## Daily Challenge

- Daily seed and class/race preset rotate by **UTC day**.
- UI shows reset ETA in UTC.
- Daily details can be copied as:
  - seed only
  - seed + class/race preset
  - direct run link
  - link bundle

## Records / Meta Persistence

Stored in browser localStorage:

- best score
- best floor reached
- last run snapshot (score, floor, class, race, seed, efficiency)

Records modal includes copy/share tools and quick reopen actions for daily/last-run builds.

Records quick-key strip (contextual):

- `Y` Resume Last Run *(only when last-run snapshot exists)*
- `G` Open Last Build *(only when last-run snapshot exists)*
- `U` Copy Last Run Seed *(only when last-run snapshot exists)*
- `Z` Open Daily Build in Create
- `D` Play Daily Challenge
- `V` Copy Daily Preset
- `J` Copy Daily Link
- `I` Copy Link Bundle
- `K` Copy Profile Summary
- `Esc` Close

## Share Link Formats

The game exposes copy helpers that generate URL-style launch links (seed/class/race encoded in query params).

Typical forms:

- Run link: `...?seed=<number>&class=<knight|rogue>&race=<human|elf|dwarf>`
- Daily link: same shape, using current UTC daily seed/preset
- Last-run link: same shape, using persisted last-run snapshot
- Link bundle: multiline export combining key launch/copy variants for sharing

Use these links to relaunch deterministic presets quickly across sessions/devices.
