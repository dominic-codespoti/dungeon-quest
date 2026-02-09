export type Coord = {x:number,y:number}
export type PlayerClass = 'knight'|'rogue'
export type PlayerRace = 'human'|'elf'|'dwarf'

export type ItemClass = 'weapon'|'armor'
export type Rarity = 'common'|'magic'|'rare'|'epic'

export type GeneratedItem = {
  itemClass: ItemClass
  baseType: string
  rarity: Rarity
  name: string
  atkBonus: number
  defBonus: number
  hpBonus: number
  scoreValue: number
  enchantments: string[]
}

export type Entity = {
  id: string
  type: 'player'|'monster'|'item'
  kind?: 'chaser'|'brute'|'skitter'|'spitter'|'boss'|'sentinel'|'potion'|'relic'|'stairs'|'elixir'|'cursed-idol'|'gear'|'bomb'|'blink-shard'|'chest'|'shrine'|'fountain'
  pos: Coord
  hp?: number
  loot?: GeneratedItem
  used?: boolean
}

export type GameSnapshot = {
  tick: number
  floor: number
  floorModifier?: string
  nextFloorModifier?: string
  playerClass: PlayerClass
  playerRace: PlayerRace
  width: number
  height: number
  walls: Coord[]
  visible: Coord[]
  discovered: Coord[]
  entities: Entity[]
  score: number
  killStreak: number
  attackBonus: number
  defenseBonus: number
  maxHp: number
  inventory: GeneratedItem[]
  dashCooldown: number
  backstepCooldown: number
  guardCooldown: number
  guardActive: boolean
  gameOver: boolean
  outcome?: 'victory'|'defeat'
}

export type PlayerAction =
  | {type:'move',dir: 'up'|'down'|'left'|'right'}
  | {type:'dash',dir: 'up'|'down'|'left'|'right'}
  | {type:'guard'}
  | {type:'bash',dir:'up'|'down'|'left'|'right'}
  | {type:'backstep',dir:'up'|'down'|'left'|'right'}
  | {type:'interact'}
  | {type:'wait'}

export type GameEvent = {
  tick: number
  type: string
  payload?: any
}
