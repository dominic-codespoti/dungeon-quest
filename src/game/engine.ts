import {GameSnapshot, PlayerAction, GameEvent, Entity, Coord} from './types'
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
  private rand: ()=>number

  constructor(width=30,height=30,seed=1){
    this.width = width
    this.height = height
    this.rand = rng(seed)
    // place player
    this.entities.push({id:'p',type:'player',pos:{x:Math.floor(width/2),y:Math.floor(height/2)},hp:10})
    // place one monster
    this.entities.push({id:'m1',type:'monster',pos:{x:Math.floor(width/2)+3,y:Math.floor(height/2)},hp:5})
    const ev:GameEvent = {tick:this.tick,type:'init',payload:{width,height,entities:this.entities}}
    this.events.push(ev)
    eventBus.publish(ev)
  }

  getState(): GameSnapshot{
    return {tick:this.tick,width:this.width,height:this.height,entities:JSON.parse(JSON.stringify(this.entities))}
  }

  step(action: PlayerAction){
    this.tick++
    const player = this.entities.find(e=>e.type==='player')!
    if(!player) throw new Error('no player')
    if(action.type==='move'){
      const d:Record<string,Coord>={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}
      const nd = {x:player.pos.x + d[action.dir].x, y: player.pos.y + d[action.dir].y}
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
      const dx = Math.sign(playerPos.x - m.pos.x)
      const dy = Math.sign(playerPos.y - m.pos.y)
      const nd = {x:m.pos.x+dx,y:m.pos.y+dy}
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

    return this.getState()
  }
}

export default Engine
