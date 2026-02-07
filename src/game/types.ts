export type Coord = {x:number,y:number}

export type Entity = {
  id: string
  type: 'player'|'monster'|'item'
  pos: Coord
  hp?: number
}

export type GameSnapshot = {
  tick: number
  width: number
  height: number
  entities: Entity[]
}

export type PlayerAction =
  | {type:'move',dir: 'up'|'down'|'left'|'right'}
  | {type:'wait'}

export type GameEvent = {
  tick: number
  type: string
  payload?: any
}

// --- Combat engine types (core loop) ---

export type BattlePhase =
  | 'idle'
  | 'startTurn'
  | 'awaitingAction'
  | 'resolvingAction'
  | 'endTurn'
  | 'finished'

export type EntityId = string

export type EntityTag = 'boss' | 'elite' | 'minion' | 'playerHero' | string

export type StatusTiming =
  | 'onStartTurn'
  | 'onEndTurn'
  | 'onBeforeAction'
  | 'onAfterAction'

export interface StatusEffect {
  id: string
  kind: string
  magnitude: number
  remainingTurns: number
  timing: StatusTiming[]
  stackable: boolean
}

export interface CombatEntity {
  id: EntityId
  kind: 'player' | 'enemy'
  name: string

  hp: number
  maxHp: number
  armor: number
  attack: number
  speed: number

  tags: EntityTag[]

  statuses: StatusEffect[]
  alive: boolean
  actionsRemaining: number
}

export type TargetingMode = 'single' | 'allEnemies' | 'self' | 'allAllies'

export interface ActionEffect {
  damage?: number
  applyStatuses?: StatusEffect[]
}

export interface BattleAction {
  kind: string
  actorId: EntityId
  targets: EntityId[]
  targetingMode: TargetingMode
  effect: ActionEffect
}

export interface LogEntry {
  id: string
  message: string
  round: number
  turnNumber: number
  timestamp: number
}

export interface BattleState {
  entities: Record<EntityId, CombatEntity>
  order: EntityId[]
  currentIndex: number
  round: number
  turnNumber: number
  phase: BattlePhase
  winner: 'players' | 'enemies' | null

  log: LogEntry[]

  currentActorId: EntityId | null
  pendingAction?: BattleAction

  rngSeed?: string
}
