import type {
  BattleState,
  BattlePhase,
  CombatEntity,
  EntityId,
  BattleAction,
  LogEntry,
  StatusTiming,
} from './types'

// Simple deterministic RNG based on a numeric seed
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0
    return (s >>> 0) / 4294967296
  }
}

export function createInitialBattleState(
  entities: CombatEntity[],
  seed = 1,
): BattleState {
  const living = entities.filter((e) => e.alive && e.hp > 0)

  const order = [...living]
    .sort((a, b) => b.speed - a.speed)
    .map((e) => e.id)

  const entityMap: Record<EntityId, CombatEntity> = {}
  for (const e of entities) {
    entityMap[e.id] = { ...e }
  }

  return {
    entities: entityMap,
    order,
    currentIndex: 0,
    round: 1,
    turnNumber: 1,
    phase: order.length > 0 ? 'startTurn' : 'finished',
    winner: null,
    log: [],
    currentActorId: order[0] ?? null,
    rngSeed: String(seed),
  }
}

// --- Core loop ---

export function step(state: BattleState): BattleState {
  switch (state.phase) {
    case 'startTurn':
      return handleStartTurn(state)
    case 'awaitingAction':
      // External code (UI / AI) must call applyAction; we just pause here.
      return state
    case 'resolvingAction':
      return handleResolvingAction(state)
    case 'endTurn':
      return handleEndTurn(state)
    case 'idle':
    case 'finished':
    default:
      return state
  }
}

export function isPlayersTurn(state: BattleState): boolean {
  const actor = state.currentActorId ? state.entities[state.currentActorId] : null
  return !!actor && actor.kind === 'player'
}

export function isEnemiesTurn(state: BattleState): boolean {
  const actor = state.currentActorId ? state.entities[state.currentActorId] : null
  return !!actor && actor.kind === 'enemy'
}

// --- Action application ---

export function applyAction(state: BattleState, action: BattleAction): BattleState {
  if (state.phase !== 'awaitingAction') return state

  return {
    ...state,
    pendingAction: action,
    phase: 'resolvingAction',
  }
}

// --- Phase handlers ---

function handleStartTurn(state: BattleState): BattleState {
  if (state.order.length === 0) return state

  const actorId = state.order[state.currentIndex]
  const actor = state.entities[actorId]
  if (!actor || !actor.alive || actor.hp <= 0) {
    // Skip dead or missing actors
    return advanceToNextTurn(state)
  }

  const updatedActor: CombatEntity = {
    ...actor,
    actionsRemaining: 1,
  }

  let next: BattleState = {
    ...state,
    entities: {
      ...state.entities,
      [actorId]: updatedActor,
    },
    currentActorId: actorId,
  }

  // Apply start-of-turn status effects (no-op for now; hook for later)
  next = applyStatusTiming(next, updatedActor, 'onStartTurn')

  return {
    ...next,
    phase: 'awaitingAction',
  }
}

function handleResolvingAction(state: BattleState): BattleState {
  const action = state.pendingAction
  if (!action) return state

  const actor = state.entities[action.actorId]
  if (!actor || !actor.alive || actor.hp <= 0) {
    // Actor is dead or missing; drop the action
    return {
      ...state,
      pendingAction: undefined,
      phase: 'endTurn',
    }
  }

  let next = state

  switch (action.kind) {
    case 'basicAttack':
      next = resolveBasicAttack(next, action)
      break
    default:
      // Unknown action kind; log and move on
      next = appendLog(next, {
        message: `${actor.name} tries to act, but nothing happens (unknown action).`,
      })
      break
  }

  const updatedActor = next.entities[actor.id]
  if (updatedActor) {
    updatedActor.actionsRemaining = Math.max(0, updatedActor.actionsRemaining - 1)
  }

  return {
    ...next,
    pendingAction: undefined,
    phase: 'endTurn',
  }
}

function handleEndTurn(state: BattleState): BattleState {
  const actorId = state.currentActorId
  const actor = actorId ? state.entities[actorId] : undefined

  let next = state

  if (actor) {
    next = applyStatusTiming(next, actor, 'onEndTurn')
  }

  // Re-evaluate alive flags
  const entities: typeof next.entities = { ...next.entities }
  for (const id of Object.keys(entities)) {
    const e = entities[id]
    if (!e) continue
    if (e.hp <= 0 && e.alive) {
      entities[id] = { ...e, alive: false, hp: 0 }
      next = appendLog(next, { message: `${e.name} falls in battle.` })
    }
  }

  next = { ...next, entities }

  const winner = evaluateWinner(next)
  if (winner) {
    return {
      ...next,
      winner,
      phase: 'finished',
    }
  }

  return advanceToNextTurn(next)
}

// --- Helpers ---

function advanceToNextTurn(state: BattleState): BattleState {
  if (state.order.length === 0) return state

  const nextIndex = (state.currentIndex + 1) % state.order.length
  const wrapped = nextIndex === 0

  return {
    ...state,
    currentIndex: nextIndex,
    round: wrapped ? state.round + 1 : state.round,
    turnNumber: state.turnNumber + 1,
    phase: 'startTurn',
    currentActorId: state.order[nextIndex] ?? null,
    pendingAction: undefined,
  }
}

function evaluateWinner(state: BattleState): 'players' | 'enemies' | null {
  const entities = Object.values(state.entities)
  const anyPlayersAlive = entities.some((e) => e.kind === 'player' && e.alive && e.hp > 0)
  const anyEnemiesAlive = entities.some((e) => e.kind === 'enemy' && e.alive && e.hp > 0)

  if (!anyEnemiesAlive && anyPlayersAlive) return 'players'
  if (!anyPlayersAlive && anyEnemiesAlive) return 'enemies'
  return null
}

function appendLog(state: BattleState, partial: { message: string }): BattleState {
  const entry: LogEntry = {
    id: `${state.turnNumber}-${state.log.length}`,
    message: partial.message,
    round: state.round,
    turnNumber: state.turnNumber,
    timestamp: Date.now(),
  }

  return {
    ...state,
    log: [...state.log, entry],
  }
}

// For now status timing is a no-op hook we can fill in later
function applyStatusTiming(
  state: BattleState,
  actor: CombatEntity,
  timing: StatusTiming,
): BattleState {
  // Placeholder: iterate statuses and apply behaviour once we define status rules
  // Returning state unchanged keeps the core loop functioning.
  return state
}

// --- Basic attack resolution ---

function resolveBasicAttack(state: BattleState, action: BattleAction): BattleState {
  const actor = state.entities[action.actorId]
  if (!actor) return state

  // Single-target only for now; ignore extras
  const targetId = action.targets[0]
  const target = targetId ? state.entities[targetId] : undefined
  if (!target) return state

  // Build a simple RNG based on seed + turnNumber so we get deterministic crits
  const seedNum = Number(state.rngSeed ?? '1') + state.turnNumber
  const rng = makeRng(seedNum)

  const baseDamage = action.effect.damage ?? actor.attack

  // Simple crit model: 10% crit chance, 1.5x damage (placeholder)
  const critChance = 0.1
  const isCrit = rng() < critChance

  let damage = baseDamage
  if (isCrit) {
    damage = Math.round(damage * 1.5)
  }

  const reduced = Math.max(1, damage - target.armor)

  const updatedTarget: CombatEntity = {
    ...target,
    hp: Math.max(0, target.hp - reduced),
  }

  let next = {
    ...state,
    entities: {
      ...state.entities,
      [updatedTarget.id]: updatedTarget,
    },
  }

  const msgBase = `${actor.name} hits ${target.name} for ${reduced}`
  const msgDetail = target.armor > 0 ? ` (${damage} - ${target.armor} armor)` : ''
  const msgCrit = isCrit ? ' (CRIT!)' : ''

  next = appendLog(next, { message: `${msgBase}${msgDetail}.${msgCrit}` })

  return next
}
