import type {GameSnapshot, PlayerAction, GameEvent, Entity, Coord} from './types'
import eventBus from './eventBus'

function rng(seed:number){
  let s = seed >>> 0
  return ()=>{ s = Math.imul(1664525, s) + 1013904223 | 0; return ((s >>> 0) / 4294967296)
  }
}

export class Engine{
  tick = 0
  width:number
  height:number
  entities: Entity[] = []
  events: GameEvent[] = []
  score = 0
  gameOver = false
  outcome: 'victory'|'defeat'|undefined
  private rand: ()=>number

  constructor(width=30,height=30,seed=1){
    this.width = width
    this.height = height
    this.rand = rng(seed)
    // place player
    this.entities.push({id:'p',type:'player',pos:{x:Math.floor(width/2),y:Math.floor(height/2)},hp:10})

    // place a small pack of monsters for immediate challenge
    for(let i=1;i<=4;i++){
      let placed = false
      while(!placed){
        const pos = {x:Math.floor(this.rand()*width), y:Math.floor(this.rand()*height)}
        const occupied = this.entities.some(e=>e.pos.x===pos.x && e.pos.y===pos.y)
        const nearPlayer = Math.abs(pos.x-Math.floor(width/2)) + Math.abs(pos.y-Math.floor(height/2)) < 4
        if(!occupied && !nearPlayer){
          this.entities.push({id:`m${i}`,type:'monster',pos,hp:4})
          placed = true
        }
      }
    }

    const ev:GameEvent = {tick:this.tick,type:'init',payload:{width,height,entities:this.entities}}
    this.events.push(ev)
    eventBus.publish(ev)
  }

  getState(): GameSnapshot{
    return {
      tick:this.tick,
      width:this.width,
      height:this.height,
      entities:JSON.parse(JSON.stringify(this.entities)),
      score:this.score,
      gameOver:this.gameOver,
      ...(this.outcome ? { outcome: this.outcome } : {})
    }
  }

  step(action: PlayerAction){
    if(this.gameOver) return this.getState()
    this.tick++
    const player = this.entities.find(e=>e.type==='player')!
    if(!player) throw new Error('no player')
    if(action.type==='move'){
      const d:Record<'up'|'down'|'left'|'right',Coord>={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}
      const delta = d[action.dir]
      const nd = {x:player.pos.x + delta.x, y: player.pos.y + delta.y}
      // simple bounds check
      if(nd.x>=0 && nd.x<this.width && nd.y>=0 && nd.y<this.height){
        // check collisions
        const occ = this.entities.find(e=>e.pos.x===nd.x && e.pos.y===nd.y && e.id!=='p')
        if(occ && occ.type==='monster'){
          // simple combat
          occ.hp = (occ.hp||1) - 3
          const ev:GameEvent = {tick:this.tick,type:'combat',payload:{attacker:'p',target:occ.id,damage:3}}
          this.events.push(ev)
          eventBus.publish(ev)
          if((occ.hp||0) <=0){
            const evd:GameEvent = {tick:this.tick,type:'die',payload:{id:occ.id}}
            this.events.push(evd)
            eventBus.publish(evd)
            this.entities = this.entities.filter(e=>e.id!==occ.id)
            this.score += 100
          }
        } else {
          player.pos = nd
          const evm:GameEvent = {tick:this.tick,type:'move',payload:{id:'p',to:nd}}
          this.events.push(evm)
          eventBus.publish(evm)
        }
      }
    } else {
      const evw:GameEvent = {tick:this.tick,type:'wait'}
    this.events.push(evw)
    eventBus.publish(evw)
    }

    // monsters take a naive turn: move towards player if adjacent
    const playerPos = player.pos
    this.entities.filter(e=>e.type==='monster').forEach(m=>{
      const dx = playerPos.x - m.pos.x
      const dy = playerPos.y - m.pos.y
      // Move one axis per turn to keep pursuit readable/fair
      const stepX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0
      const stepY = stepX===0 ? Math.sign(dy) : 0
      const nd = {x:m.pos.x+stepX,y:m.pos.y+stepY}
      if(nd.x===playerPos.x && nd.y===playerPos.y){
        // attack player
        player.hp = (player.hp||0) - 1
        const evc:GameEvent = {tick:this.tick,type:'combat',payload:{attacker:m.id,target:'p',damage:1}}
        this.events.push(evc)
        eventBus.publish(evc)
      } else {
        // move if not occupied
        const occ = this.entities.find(e=>e.pos.x===nd.x && e.pos.y===nd.y)
        if(!occ){
          m.pos = nd
          this.events.push({tick:this.tick,type:'move',payload:{id:m.id,to:nd}})
        }
      }
    })

    const monstersLeft = this.entities.filter(e=>e.type==='monster').length
    if(monstersLeft===0){
      this.gameOver = true
      this.outcome = 'victory'
      const evWin:GameEvent = {tick:this.tick,type:'victory',payload:{reason:'all_monsters_defeated',score:this.score}}
      this.events.push(evWin)
      eventBus.publish(evWin)
    }
    if((player.hp||0)<=0){
      this.gameOver = true
      this.outcome = 'defeat'
      const evLose:GameEvent = {tick:this.tick,type:'defeat',payload:{reason:'player_dead',score:this.score}}
      this.events.push(evLose)
      eventBus.publish(evLose)
    }

    return this.getState()
  }
}

export default Engine
