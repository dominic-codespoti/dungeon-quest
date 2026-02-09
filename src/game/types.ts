export type Coord = {x:number,y:number}
export type PlayerClass = 'knight'|'rogue'

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
  kind?: 'chaser'|'brute'|'skitter'|'potion'|'relic'|'stairs'|'elixir'|'cursed-idol'|'gear'
  pos: Coord
  hp?: number
  loot?: GeneratedItem
}

export type GameSnapshot = {
  tick: number
  floor: number
  floorModifier?: string
  playerClass: PlayerClass
  width: number
  height: number
  walls: Coord[]
  entities: Entity[]
  score: number
  attackBonus: number
  defenseBonus: number
  dashCooldown: number
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
  | {type:'wait'}

export type GameEvent = {
  tick: number
  type: string
  payload?: any
}
