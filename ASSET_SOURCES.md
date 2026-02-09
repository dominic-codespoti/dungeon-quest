# Asset Sources Shortlist (Dungeon Quest)

## Status
`web_search` tool is currently unavailable in this environment (missing Brave API key), so this list is curated from known sources + direct page fetch checks.

## Recommended packs

1. **0x72 — 16x16 DungeonTileset II**
- URL: https://0x72.itch.io/dungeontileset-ii
- Style: classic pixel dungeon (characters, enemies, props)
- License: page community text indicates **CC0** (verify on download page before shipping)

2. **Kenney Asset Packs**
- URL: https://kenney.nl/assets
- Style: broad pack ecosystem, very usable for prototyping and shipping
- License: Kenney assets are generally very permissive (verify specific pack page)

3. **OpenGameArt (filtered dungeon/tileset searches)**
- URL: https://opengameart.org/art-search-advanced
- Style: mixed quality, but huge variety
- License: per-asset (CC0 / CC-BY / others) — verify each asset and keep attribution notes when required

## Import plan for this project
- Tilemap base: 0x72 dungeon tileset
- Item icons: OGA/ Kenney mix (potions/relics/gear)
- Class silhouettes: knight + rogue sprite variants from same pack family for cohesion

## License hygiene checklist
- Keep `CREDITS.md` with:
  - asset name
  - author
  - source URL
  - license
  - attribution text (if required)
- Do not mix incompatible attribution requirements without tracking.
- Preserve original license files in `assets/licenses/`.
