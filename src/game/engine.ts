import type {GameSnapshot, PlayerAction, GameEvent, Entity, Coord} from './types'
import eventBus from './eventBus'

function rng(seed:number){
  let s = seed >>> 0
  return ()=>{ s = Math.imul(1664525, s) + 1013904223 | 0; return ((s >>> 0) / 4294967296) }
}

const key = (p:Coord)=> `${p.x},${p.y}`

export class Engine{
  tick = 0
  floor = 1
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
    this.setupFloor(true)
  }

  private setupFloor(initial=false){
    const currentHp = this.entities.find(e=>e.id==='p')?.hp ?? 12
    const preservedHp = initial ? 12 : Math.min(12, currentHp + 1)

    this.entities = [{id:'p',type:'player',pos:{x:Math.floor(this.width/2),y:Math.floor(this.height/2)},hp:preservedHp}]
    this.walls = new Set<string>()
    this.generateWalls()

    const baseCount = 4
    const monsterCount = Math.min(10, baseCount + (this.floor - 1) * 2)
    for(let i=0;i<monsterCount;i++){
      const pick = this.rand()
      const kind = pick < 0.5 ? 'chaser' : pick < 0.8 ? 'skitter' : 'brute'
      const hp = kind==='brute' ? 7 + Math.floor((this.floor-1)/2) : kind==='chaser' ? 4 + Math.floor((this.floor-1)/3) : 3 + Math.floor((this.floor-1)/3)
      this.spawnMonster(`m${this.floor}-${i+1}`,kind,hp)
    }

    this.spawnItem(`i${this.floor}-p1`,'potion')
    this.spawnItem(`i${this.floor}-r1`,'relic')

    if(!initial){
      this.emit({tick:this.tick,type:'floor',payload:{floor:this.floor}})
    }
    this.emit({
      tick:this.tick,
      type:'init',
      payload:{floor:this.floor,width:this.width,height:this.height,walls:this.getWalls(),entities:this.entities}
    })
  }

  private generateWalls(){
    const center = {x:Math.floor(this.width/2), y:Math.floor(this.height/2)}
    const density = Math.min(0.2, 0.1 + (this.floor - 1) * 0.015)
    for(let y=0; y<this.height; y++){
      for(let x=0; x<this.width; x++){
        const isBorder = x===0 || y===0 || x===this.width-1 || y===this.height-1
        if(isBorder){
          this.walls.add(key({x,y}))
          continue
        }
        const nearStart = Math.abs(x-center.x) + Math.abs(y-center.y) <= 3
        if(!nearStart && this.rand() < density){
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

  private hasPath(start:Coord, goal:Coord){
    if(this.isWall(start) || this.isWall(goal)) return false
    const q: Coord[] = [start]
    const seen = new Set<string>([key(start)])
    while(q.length){
      const cur = q.shift()!
      if(cur.x===goal.x && cur.y===goal.y) return true
      const neighbors: Coord[] = [
        {x:cur.x+1,y:cur.y},{x:cur.x-1,y:cur.y},{x:cur.x,y:cur.y+1},{x:cur.x,y:cur.y-1}
      ]
      for(const n of neighbors){
        if(n.x<0 || n.x>=this.width || n.y<0 || n.y>=this.height) continue
        if(this.isWall(n)) continue
        const nk = key(n)
        if(seen.has(nk)) continue
        seen.add(nk)
        q.push(n)
      }
    }
    return false
  }

  private spawnFreePos(minPlayerDistance=4){
    const player = this.entities.find(e=>e.id==='p')
    let tries = 0
    while(tries < 1200){
      tries++
      const pos = {x:Math.floor(this.rand()*this.width), y:Math.floor(this.rand()*this.height)}
      const occupied = this.isOccupiedByEntity(pos)
      const nearPlayer = player ? (Math.abs(pos.x-player.pos.x) + Math.abs(pos.y-player.pos.y) < minPlayerDistance) : false
      const reachable = player ? this.hasPath(player.pos, pos) : true
      if(!occupied && !nearPlayer && !this.isWall(pos) && reachable) return pos
    }
    return {x:Math.floor(this.width/2)+1,y:Math.floor(this.height/2)}
  }

  private spawnMonster(id:string,kind:'chaser'|'brute'|'skitter',hp:number){
    this.entities.push({id,type:'monster',kind,pos:this.spawnFreePos(5),hp})
  }

  private spawnItem(id:string,kind:'potion'|'relic'|'stairs'){
    this.entities.push({id,type:'item',kind,pos:this.spawnFreePos(kind==='stairs' ? 6 : 3)})
  }

  getState(): GameSnapshot{
    return {
      tick:this.tick,
      floor:this.floor,
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

  private trySpawnStairs(){
    const monstersLeft = this.entities.filter(e=>e.type==='monster').length
    const hasStairs = this.entities.some(e=>e.type==='item' && e.kind==='stairs')
    if(monstersLeft===0 && !hasStairs){
      this.spawnItem(`i${this.floor}-stairs`,'stairs')
      this.emit({tick:this.tick,type:'stairs_spawned',payload:{floor:this.floor}})
    }
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
              this.emit({tick:this.tick,type:'pickup',payload:{id:occ.id,kind:occ.kind}})
              this.entities = this.entities.filter(e=>e.id!==occ.id)
            } else if(occ.kind==='relic') {
              this.score += 200
              this.emit({tick:this.tick,type:'pickup',payload:{id:occ.id,kind:occ.kind}})
              this.entities = this.entities.filter(e=>e.id!==occ.id)
            } else if(occ.kind==='stairs'){
              this.score += 150 + this.floor * 25
              this.emit({tick:this.tick,type:'stairs_used',payload:{fromFloor:this.floor,toFloor:this.floor+1}})
              this.floor += 1
              this.setupFloor(false)
              return this.getState()
            }
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
        movePref.push({x:Math.sign(dy),y:0},{x:0,y:Math.sign(dx)},{x:Math.sign(dx),y:0},{x:0,y:Math.sign(dy)})
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

    this.trySpawnStairs()

    if((player.hp||0)<=0){
      this.gameOver = true
      this.outcome = 'defeat'
      this.emit({tick:this.tick,type:'defeat',payload:{reason:'player_dead',score:this.score,floor:this.floor}})
    }

    return this.getState()
  }
}

export default Engine
