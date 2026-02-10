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

## Follow-up Pass — Floor Modifiers + Spawn Pacing
Implemented in this pass:
- Added rotating floor modifiers:
  - `swarm` (more total mobs, lighter wall density)
  - `brute-heavy` (higher brute mix)
  - `scarce-potions` (healing pressure)
  - `none` baseline floors
- Added spawn pacing guard via **threat budget cap** per floor to avoid runaway spike spawns.
- Smoothed base monster ramp and potion allocation rules.
- Surfaced modifier in HUD and floor transition text.

### Updated automated playtest (8 seeded runs)
- Average floor reached: **2.13**
- Average score: **1141** (up from 1059)
- Max floor: **3**
- Defeats: **7/8**

Interpretation:
- Variety improved: runs now have clearer identity floor-to-floor.
- Score progression improved without raising average floor yet.
- Difficulty remains harsh; major survivability spikes still occur on unlucky aggro patterns.

## Follow-up Pass — Class-Dependent Skills (Knight + Rogue)
Implemented in this pass:
- Added **class system** with URL/runtime selection (`class=knight|rogue`).
- **Rogue**: keeps Dash as signature skill.
- **Knight**: new skills
  - `Guard` (cooldown 4): mitigates next incoming hit.
  - `Bash` (directional): heavy melee hit with conditional knockback.
- HUD now shows class + class cooldowns and class-specific controls.
- Run summary and reruns preserve seed/class context.

### Updated automated class playtest (6 seeds each)
- **Knight**
  - Avg floor: **3.83**
  - Avg score: **3227**
  - Max floor: **5**
- **Rogue**
  - Avg floor: **2.00**
  - Avg score: **994**
  - Max floor: **3**

Interpretation:
- Knight currently has much stronger survival/control in this sim profile.
- Rogue feels high-variance and fragile; dash skill ceiling exists but baseline consistency is lower.

## Tightening Pass — Class Parity (Now)
Applied now:
- **Knight toned down**
  - Guard cooldown increased: 4 → 5
  - Bash damage reduced: 4 → 3
- **Rogue tightened up**
  - Dash cooldown reduced: 5 → 4
  - New rogue perk: dash kill refunds 1 cooldown (`dash_refresh`)

### Fresh class test run (6 seeds each)
- **Knight:** avg floor **3.50**, avg score **2504**, max floor **4**
- **Rogue:** avg floor **2.17**, avg score **1179**, max floor **3**

Interpretation:
- Gap narrowed (Knight still ahead on depth, Rogue improved in scoring/tempo).
- Better parity baseline for adding rogue secondary skill next.

## Follow-up Pass — Item Variety
Implemented in this pass:
- Added new pickups:
  - **Elixir**: +2 HP, reduces cooldowns by 1, small score bonus.
  - **Cursed Idol**: +350 score, but -2 HP on pickup.
- Spawn rules:
  - Elixir appears on even floors.
  - Cursed Idol can appear from floor 3 onward.
- HUD/status updates for new pickups and item legend.

### Quick impact read
- More meaningful route decisions now: survival vs greed.
- Better roguelike flavor from explicit risk/reward pickups.

## Follow-up Pass — Item Generation System Foundations
Implemented in this pass:
- New generated **gear** item class (`weapon` / `armor`) with:
  - rarity tiers: common, magic, rare, epic
  - base types (e.g., Sword, Plate)
  - random enchantment text
  - rolled stat bonuses (`atkBonus`, `defBonus`, `hpBonus`)
- Gear now spawns each floor and auto-equips on pickup.
- Combat now reads build stats:
  - player damage scales with `ATK+`
  - incoming monster damage reduced by `DEF+`
- HUD now shows `ATK+` and `DEF+`.

Validation:
- `npm test` ✅
- `npm run build` ✅

## Suggested next changes
1. Add an explicit **inventory/equipment panel** (currently auto-equip only).
2. Add **item subclasses** per class fantasy (Knight heavy armor bias, Rogue light weapon bias).
3. Add true enchantment effects (not just flavor text) via affix hooks.
4. Re-enable full automated playtest with tuned turn budget after combat-cost optimization.

## Headed Stability Check — Blank Game Screen Investigation (2026-02-10)

User-reported issue:
- Intermittent blank game screen on open/start.

### Repro protocol run
- Performed repeated headed open -> game loads on deployed URL with varying class/race/seed combinations.
- Observed intermittent startup states where HUD showed placeholder values (`Objective: Initialize run...`, floor/HP `-`) before scene/event hookup completed.
- Did not observe persistent hard-crash console errors during sampled runs; behavior aligned with renderer/bootstrap race/timing.

### Fixes shipped
1. **GameMount bootstrap hardening**
   - Added cancellation-safe scene retry loop.
   - Removed brittle fixed-stop behavior.
   - Retry continues until scene is ready (with warning logs at 4s/10s).
2. **User-facing fallback/recovery**
   - Added in-canvas fallback banner when snapshot isn’t ready.
   - Added one-click Retry action (reload).
   - Tuned fallback to appear after delay (~1.6s) to avoid normal-load flicker.
3. **Regression coverage**
   - Extended `scripts/smoke-ui.mjs` with checks for fallback state, delayed trigger, and retry UI wiring.

### Validation
- `npm run test:all` ✅ (`UI smoke checks passed (64 checks, 1 guard)`)
- `npm run build` ✅

### Current status
- Startup path is more resilient and now has an explicit player-visible recovery mechanism for rare initialization stalls.
