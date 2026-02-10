export type Coord = {x:number,y:number}
export type PlayerClass = 'knight'|'rogue'
export type PlayerRace = 'human'|'elf'|'dwarf'

export type ItemClass = 'weapon'|'armor'
export type Rarity = 'common'|'magic'|'rare'|'epic'

export type SpiritModifier = 'pure'|'empowered'|'corrupted'|'fractured'

export type ShopOffer = {
  id: string
  name: string
  kind: 'essence-pack'|'spirit-core'
  cost: number
  essenceAmount?: number
  core?: SpiritCore
}

export type SpiritCore = {
  id: string
  spirit: string
  source: string
  tier: 'major'|'minor'
  modifier: SpiritModifier
  bonuses: {atk:number,def:number,hp:number,dex:number}
  note: string
  equipped?: boolean
}

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
  equipped?: boolean
}

export type Entity = {
  id: string
  type: 'player'|'monster'|'item'
  kind?: 'chaser'|'brute'|'skitter'|'spitter'|'boss'|'sentinel'|'potion'|'relic'|'stairs'|'elixir'|'cursed-idol'|'gear'|'bomb'|'blink-shard'|'chest'|'shrine'|'fountain'|'rift-orb'|'essence'|'spirit-implant'
  pos: Coord
  hp?: number
  loot?: GeneratedItem
  spiritLoot?: SpiritCore
  essenceAmount?: number
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
  essence: number
  spiritCores: SpiritCore[]
  spiritMajorSlots: number
  spiritMinorSlots: number
  shopOffers: ShopOffer[]
  shopRerollCost: number
  spiritDryFloors: number
  lastSpiritEquipBlockedReason?: string | null
  dashCooldown: number
  backstepCooldown: number
  guardCooldown: number
  guardActive: boolean
  bossCharging: number
  gameOver: boolean
  outcome?: 'victory'|'defeat'
}

export type Dir = 'up'|'down'|'left'|'right'|'up-left'|'up-right'|'down-left'|'down-right'

export type PlayerAction =
  | {type:'move',dir: Dir}
  | {type:'dash',dir: Dir}
  | {type:'guard'}
  | {type:'bash',dir:Dir}
  | {type:'backstep',dir:Dir}
  | {type:'interact'}
  | {type:'wait'}

export type GameEvent = {
  tick: number
  type: string
  payload?: any
}
