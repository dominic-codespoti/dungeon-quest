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

## Follow-up Pass — Player Dash Ability
Implemented after prior pass:
- New player action: `dash` (2-tile burst, stops on walls/targets).
- Dash deals slightly stronger hit than normal attack when colliding with a monster.
- Dash cooldown added (`5` turns), surfaced in UI and status text.
- Controls: **Shift + direction** (or Dash buttons).

### Updated automated playtest (8 seeded runs)
- Average floor reached: **2.13** (flat)
- Average score: **1059** (roughly flat)
- Max floor: **3**
- Defeats: **7/8** (up from 6/8 in this bot strategy)

Interpretation:
- Dash increases tactical expression for a human player, but naive bot usage is over-aggressive and gets punished.
- This is expected: the mechanic is high-tempo and favors intentional timing, not always-on use.

### Headed browser playtest note (this pass)
- Attempted headed run again on live Pages.
- Still blocked by live asset mismatch (`/src/main.tsx` 404), so direct in-browser gameplay verification remains unavailable from deployed URL.

## Follow-up Pass — Death Summary + Seeded Restart
Implemented in this pass:
- Added end-of-run summary overlay (floor reached, score, HP, seed).
- Added **Restart same seed** and **New seed** actions.
- Exposed active seed in HUD.
- Added URL-seeded runs (`?seed=<n>`) so repro runs are deterministic.

### Updated automated playtest (8 seeded runs)
- Average floor reached: **2.13**
- Average score: **1059**
- Max floor: **3**
- Defeats: **7/8**

Interpretation:
- The new post-run UX is much better for iteration and balancing.
- Core difficulty is still on the hard side; survivability tuning remains the main lever.

### Headed browser playtest note (this pass)
- Attempted headed playtest again (local dev URL and live Pages).
- Local browser session loaded an empty document body (`<body></body>`), and live Pages still showed asset mismatch 404 in prior checks.
- Continued with deterministic automated playtest + compile/build validation while the browser serving issue is unresolved.

## Suggested next changes
1. Add **floor modifiers** every 2 floors (e.g., “Brute-heavy”, “Low potion”).
2. Add **spawn pacing guards** to reduce extreme spike floors.
3. Tune dash with **i-frames or knockback** to improve survivability feel.
4. Fix deployment/runtime serving path so headed browser playtests can be consistently executed.
