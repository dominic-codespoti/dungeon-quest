# Playtest Report — Stairs & Floor Progression

Date: 2026-02-09
Branch: `main`
Feature slice: stairs spawn after floor clear, descent to next floor, floor scaling (more monsters + denser walls), floor UI/status updates.

## Validation
- `npm test` ✅
- `npm run build` ✅
- Automated gameplay playtest (`node scripts/playtest.mjs`) ✅

## Playtest Summary (8 seeded runs)
- Average floor reached: **2.00**
- Max floor reached: **3**
- Average score: **928**
- Defeats: **6/8**
- Two runs survived to turn cap (1400), indicating occasional tactical stalemates

## Fun & Challenge Assessment
### What's fun now
- **Clear short-term objective loop**: clear monsters → stairs appear → descend.
- **Good tension ramp** from floor 1 to floor 2+ (enemy count + map clutter increase).
- **Score pacing feels rewarding** when chaining combat + relic + floor bonus.

### Challenge feel
- **Floor 1:** manageable, readable.
- **Floor 2:** noticeably harder; pressure rises quickly.
- **Floor 3:** lethal without careful potion timing/positioning.

Overall difficulty: **moderately hard** and rising fast. Good for a roguelike, but currently punishing for less tactical players.

## What's missing / rough edges
1. **Monster pathing sophistication**
   - Current movement can cause local deadlocks or long chases around obstacles.
2. **Player survivability tools**
   - No abilities/cooldowns/escape mechanics yet; HP attrition is harsh on deeper floors.
3. **Floor identity/variety**
   - Floors scale numerically but don’t yet introduce new tactical patterns/biomes/modifiers.
4. **Run-end feedback**
   - No post-death summary panel (cause of death, floor reached, key events).
5. **Stairs signposting**
   - Works functionally, but stronger visual pulse/audio cue would improve discoverability.

## Follow-up Pass — Smarter Pursuit (BFS fallback)
Implemented after this report:
- Monsters now use a shortest-path step fallback (`nextStepToward`) when direct movement is blocked.
- If path is unavailable this turn, they still use local movement preferences.

### Updated automated playtest (8 seeded runs)
- Average floor reached: **2.13** (up from 2.00)
- Average score: **1061** (up from 928)
- Max floor: **3**
- Defeats: **6/8** (same)

Interpretation:
- Encounters are now **more decisive** (less idle circling around walls).
- Challenge feels cleaner and more fair, though still punishing on deeper floors.

### Headed browser playtest note
- Attempted headed playtest on local and GitHub Pages build.
- Current live Pages instance returned 404 for app assets (`/src/main.tsx`), so runtime interaction in headed browser was blocked in this pass.
- Continued with deterministic automated playtest and code-level validation.

## Suggested next changes
1. Add one **player tactical tool** (dash, block, or bomb) with cooldown.
2. Add **death summary modal** with run stats and “restart with same seed”.
3. Add **floor modifiers** every 2 floors (e.g., “Brute-heavy”, “Low potion”).
4. Add **spawn pacing guards** to reduce extreme spike floors.
