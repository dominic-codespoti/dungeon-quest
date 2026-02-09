import type {GameSnapshot, PlayerAction, GameEvent, Entity, Coord} from './types'
import eventBus from './eventBus'

function rng(seed:number){
  let s = seed >>> 0
  return ()=>{ s = Math.imul(1664525, s) + 1013904223 | 0; return ((s >>> 0) / 4294967296) }
}

const key = (p:Coord)=> `${p.x},${p.y}`

export class Engine{
  tick = 0
  width:number
  height:number
  entities: Entity[] = []
  events: GameEvent[] = []
  walls = new Set<string>()
  score = 0
  gameOver = false
  outcome: 'victory'|'defeat'|undefined
  private rand: ()=>number

  constructor(width=30,height=30,seed=1){
    this.width = width
    this.height = height
    this.rand = rng(seed)

    this.entities.push({id:'p',type:'player',pos:{x:Math.floor(width/2),y:Math.floor(height/2)},hp:12})
    this.generateWalls()

    // Monster pack with different behavior profiles
    this.spawnMonster('m1','chaser',4)
    this.spawnMonster('m2','chaser',4)
    this.spawnMonster('m3','brute',7)
    this.spawnMonster('m4','skitter',3)

    // Tactical pickups
    this.spawnItem('i1','potion')
    this.spawnItem('i2','relic')

    const ev:GameEvent = {tick:this.tick,type:'init',payload:{width,height,walls:this.getWalls(),entities:this.entities}}
    this.events.push(ev)
    eventBus.publish(ev)
  }

  private generateWalls(){
    const center = {x:Math.floor(this.width/2), y:Math.floor(this.height/2)}
    for(let y=0; y<this.height; y++){
      for(let x=0; x<this.width; x++){
        const isBorder = x===0 || y===0 || x===this.width-1 || y===this.height-1
        if(isBorder){
          this.walls.add(key({x,y}))
          continue
        }
        const nearStart = Math.abs(x-center.x) + Math.abs(y-center.y) <= 3
        if(!nearStart && this.rand() < 0.1){
          this.walls.add(key({x,y}))
        }
      }
    }
  }

  private getWalls(): Coord[]{
    return [...this.walls].map(k=>{
      const parts = k.split(',')
      return {x: Number(parts[0] ?? 0), y: Number(parts[1] ?? 0)}
    })
  }

  private isWall(pos:Coord){
    return this.walls.has(key(pos))
  }

  private isOccupiedByEntity(pos:Coord, exceptId?:string){
    return this.entities.some(e=>e.id!==exceptId && e.pos.x===pos.x && e.pos.y===pos.y)
  }

  private spawnFreePos(minPlayerDistance=4){
    const player = this.entities.find(e=>e.id==='p')
    while(true){
      const pos = {x:Math.floor(this.rand()*this.width), y:Math.floor(this.rand()*this.height)}
      const occupied = this.isOccupiedByEntity(pos)
      const nearPlayer = player ? (Math.abs(pos.x-player.pos.x) + Math.abs(pos.y-player.pos.y) < minPlayerDistance) : false
      if(!occupied && !nearPlayer && !this.isWall(pos)) return pos
    }
  }

  private spawnMonster(id:string,kind:'chaser'|'brute'|'skitter',hp:number){
    this.entities.push({id,type:'monster',kind,pos:this.spawnFreePos(5),hp})
  }

  private spawnItem(id:string,kind:'potion'|'relic'){
    this.entities.push({id,type:'item',kind,pos:this.spawnFreePos(3)})
  }

  getState(): GameSnapshot{
    return {
      tick:this.tick,
      width:this.width,
      height:this.height,
      walls:this.getWalls(),
      entities:JSON.parse(JSON.stringify(this.entities)),
      score:this.score,
      gameOver:this.gameOver,
      ...(this.outcome ? { outcome: this.outcome } : {})
    }
  }

  private emit(ev:GameEvent){
    this.events.push(ev)
    eventBus.publish(ev)
  }

  step(action: PlayerAction){
    if(this.gameOver) return this.getState()
    this.tick++

    const player = this.entities.find(e=>e.type==='player')
    if(!player) throw new Error('no player')

    if(action.type==='move'){
      const d:Record<'up'|'down'|'left'|'right',Coord>={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}
      const delta = d[action.dir]
      const nd = {x:player.pos.x + delta.x, y: player.pos.y + delta.y}

      if(nd.x>=0 && nd.x<this.width && nd.y>=0 && nd.y<this.height){
        if(this.isWall(nd)){
          this.emit({tick:this.tick,type:'bump',payload:{id:'p',to:nd,reason:'wall'}})
        } else {
          const occ = this.entities.find(e=>e.pos.x===nd.x && e.pos.y===nd.y && e.id!=='p')

          if(occ?.type==='monster'){
            const damage = 3
            occ.hp = (occ.hp||1) - damage
            this.emit({tick:this.tick,type:'combat',payload:{attacker:'p',target:occ.id,damage}})
            if((occ.hp||0) <=0){
              this.emit({tick:this.tick,type:'die',payload:{id:occ.id,kind:occ.kind}})
              this.entities = this.entities.filter(e=>e.id!==occ.id)
              this.score += occ.kind==='brute' ? 180 : occ.kind==='skitter' ? 120 : 100
            }
          } else if(occ?.type==='item'){
            player.pos = nd
            if(occ.kind==='potion'){
              player.hp = Math.min(12, (player.hp||0) + 4)
              this.score += 25
            } else if(occ.kind==='relic') {
              this.score += 200
            }
            this.emit({tick:this.tick,type:'pickup',payload:{id:occ.id,kind:occ.kind}})
            this.entities = this.entities.filter(e=>e.id!==occ.id)
            this.emit({tick:this.tick,type:'move',payload:{id:'p',to:nd}})
          } else {
            player.pos = nd
            this.emit({tick:this.tick,type:'move',payload:{id:'p',to:nd}})
          }
        }
      }
    } else {
      this.emit({tick:this.tick,type:'wait'})
    }

    const playerPos = player.pos
    const monsters = this.entities.filter(e=>e.type==='monster')

    monsters.forEach(m=>{
      const kind = m.kind || 'chaser'
      const attacks = kind==='skitter' && this.tick % 3 === 0 ? 0 : 1
      if(attacks===0) return

      const dx = playerPos.x - m.pos.x
      const dy = playerPos.y - m.pos.y
      const distance = Math.abs(dx)+Math.abs(dy)

      const movePref: Coord[] = []
      if(kind==='skitter'){
        movePref.push({x:Math.sign(dy),y:0},{x:0,y:Math.sign(dx)})
      } else if(kind==='brute'){
        movePref.push({x:Math.sign(dx),y:0},{x:0,y:Math.sign(dy)})
      } else {
        const stepX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0
        const stepY = stepX===0 ? Math.sign(dy) : 0
        movePref.push({x:stepX,y:stepY},{x:Math.sign(dx),y:0},{x:0,y:Math.sign(dy)})
      }

      if(distance===1){
        const dmg = kind==='brute' ? 2 : 1
        player.hp = (player.hp||0) - dmg
        this.emit({tick:this.tick,type:'combat',payload:{attacker:m.id,target:'p',damage:dmg,kind}})
        return
      }

      for(const step of movePref){
        const nd = {x:m.pos.x + step.x, y:m.pos.y + step.y}
        if(nd.x<0 || nd.x>=this.width || nd.y<0 || nd.y>=this.height) continue
        if(this.isWall(nd)) continue
        const occ = this.entities.find(e=>e.pos.x===nd.x && e.pos.y===nd.y)
        if(!occ){
          m.pos = nd
          this.emit({tick:this.tick,type:'move',payload:{id:m.id,to:nd}})
          break
        }
      }
    })

    const monstersLeft = this.entities.filter(e=>e.type==='monster').length
    if(monstersLeft===0){
      this.gameOver = true
      this.outcome = 'victory'
      this.emit({tick:this.tick,type:'victory',payload:{reason:'all_monsters_defeated',score:this.score}})
    }
    if((player.hp||0)<=0){
      this.gameOver = true
      this.outcome = 'defeat'
      this.emit({tick:this.tick,type:'defeat',payload:{reason:'player_dead',score:this.score}})
    }

    return this.getState()
  }
}

export default Engine
