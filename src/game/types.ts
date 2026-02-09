export type Coord = {x:number,y:number}

export type Entity = {
  id: string
  type: 'player'|'monster'|'item'
  kind?: 'chaser'|'brute'|'skitter'|'potion'|'relic'|'stairs'
  pos: Coord
  hp?: number
}

export type GameSnapshot = {
  tick: number
  floor: number
  width: number
  height: number
  walls: Coord[]
  entities: Entity[]
  score: number
  gameOver: boolean
  outcome?: 'victory'|'defeat'
}

export type PlayerAction =
  | {type:'move',dir: 'up'|'down'|'left'|'right'}
  | {type:'wait'}

export type GameEvent = {
  tick: number
  type: string
  payload?: any
}
