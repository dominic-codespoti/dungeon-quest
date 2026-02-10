# Spirit Implants — System Design (v1 options)

Goal: capture DCSS-like mutation excitement with more tactical control and readable risk/reward.

## Design Pillars
- **Controlled chaos**: player can steer build, but each run still feels alive.
- **Tactical identity**: spirits should change decision-making, not just flat stats.
- **Readable tradeoffs**: if a spirit has downside, it should be explicit and understandable.
- **Low UI burden**: present core info in compact HUD/panel flow.

---

## Approach A — Socketed Spirit Cores (high control)

### Loop
1. Enemies drop spirit shards by family (Goblin, Brute, Sentinel, etc).
2. Shrines/chests fuse shards into a core.
3. Player equips cores into limited slots (e.g. 2 Major, 2 Minor).
4. Replacing a core is explicit and reversible.

### Pros
- High agency and buildcraft.
- Easy to balance and debug.
- Fits existing inventory/equip UX.

### Cons
- Less chaotic surprise unless intentionally injected.

### Chaos knobs
- Core quality tags: Stable / Volatile / Corrupted.
- Volatile cores roll one random side effect.

---

## Approach B — Adaptive Mutation Lines (mid control)

### Loop
1. Kill patterns build hidden/public affinity tracks.
2. Crossing thresholds grants mutation tiers from weighted pools.
3. Player can pick from 2 options or take a random surge.

### Pros
- Strong run identity and emergent stories.
- Encourages varied play patterns.

### Cons
- Harder to tune and communicate.
- More edge cases with deterministic testing.

### Chaos knobs
- Floor modifiers can alter mutation weights.
- Rare wild events force mutation with compensation reward.

---

## Approach C — Spirit Contracts (risk/reward pacts)

### Loop
1. Altars offer 2–3 pacts.
2. Each pact includes explicit boon + curse.
3. Can be broken at a cost (HP/score/resource).

### Pros
- Immediate strategic drama.
- Very readable consequences.
- Great for memorable run pivots.

### Cons
- Can feel swingy if curses are too punitive.

### Chaos knobs
- Pacts evolve on boss floors.
- Contract conflicts create hybrid penalties/bonuses.

---

## Recommended Direction (v1)
Hybrid of **A + C**.

- Use **Socketed Cores** as baseline progression/control.
- Add occasional **Contracts** as optional chaos spikes.

Why: this gives reliable build planning while preserving run-to-run weirdness.

---

## Suggested v1 Content Slice
- 6 spirit families: Goblin, Brute, Sentinel, Skitter, Warden, Rift.
- 2 tiers each (Minor/Major), each with:
  - 1 passive stat/profile effect
  - 1 tactical rider (trigger or cooldown skill)
- 1 contract offering per boss floor.

### Example Spirit: Goblin
- Minor: +1 mobility score (or reduced move friction), slight evasion bonus.
- Major: unlocks short reposition skill (cooldown-based).
- Volatile variant: +tempo, but -max HP.

---

## Integration Notes
- Data model draft:
  - `spiritId`, `family`, `tier`, `quality`, `passives[]`, `activeSkill?`, `curse?`
- Engine hooks:
  - move resolution
  - combat pre/post events
  - skill cooldown system
- UI hooks:
  - inventory-style implant list
  - equip/replace actions
  - compact run HUD tags for active spirits/contracts

---

## Open Questions
1. Should spirit passives be always-on or charge-based?
2. Should contracts be removable mid-floor or only at shrines?
3. How much RNG should affect spirit quality vs spirit identity?
4. Is there a hard cap on simultaneous curses?
