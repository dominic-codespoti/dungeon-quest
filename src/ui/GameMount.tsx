import React, {useEffect, useRef} from 'react'
import { createGame } from '../game'
import Engine from '../game/engine'
import eventBus from '../game/eventBus'

export default function GameMount(){
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(()=>{
    let unsub:()=>void = ()=>{}
    if(ref.current){
      const g = createGame(ref.current)

      // attach engine to window for automation/debugging
      const eng = new Engine(30,30,1)
      ;(window as any).game = {
        getState: ()=> eng.getState(),
        step: (a:any)=> eng.step(a),
        subscribe: (fn:(e:any)=>void)=>{ return eventBus.subscribe(fn) }
      }

      // when the Phaser scene is ready, set up simple renderer
      const scene = g.scene.scenes[0]
      function setupScene(sc:any){
        try{
          const tileW = Math.floor(sc.scale.width / eng.width)
          const tileH = Math.floor(sc.scale.height / eng.height)
          const tileSize = Math.max(8, Math.min(tileW, tileH))

          const displays: Record<string, any> = {}

          function toScreen(pos:{x:number,y:number}){
            return {x: pos.x * tileSize + tileSize/2, y: pos.y * tileSize + tileSize/2}
          }

          const handler = (e:any)=>{
            if(e.type==='init'){
              ;(e.payload.entities||[]).forEach((ent:any)=>{
                const p = toScreen(ent.pos)
                const color = ent.type==='player'?0x00ff00: ent.type==='monster'?0xff0000:0x8888ff
                const r = sc.add.rectangle(p.x,p.y,tileSize-2,tileSize-2,color).setOrigin(0.5)
                displays[ent.id] = r
              })
            } else if(e.type==='move'){
              const id = e.payload.id
              const to = e.payload.to
              const d = displays[id]
              if(d){
                const p = toScreen(to)
                sc.tweens.add({targets:d,x:p.x,y:p.y,duration:120,ease:'Linear'})
              }
            } else if(e.type==='die'){
              const id = e.payload.id
              const d = displays[id]
              if(d){ d.destroy(); delete displays[id] }
            } else if(e.type==='combat'){
              const id = e.payload.attacker
              const d = displays[id]
              if(d){ sc.tweens.add({targets:d,alpha:0.2,duration:80,yoyo:true,repeat:0}) }
            }
          }

          // subscribe to future events
          unsub = eventBus.subscribe(handler)

          // process existing events (so we don't miss the init already published)
          eventBus.getLines().forEach(l=>{
            try{ handler(JSON.parse(l)) }catch(_){}
          })
        }catch(err){
          console.error('renderer setup failed',err)
        }
      }

      if(scene && scene.sys && scene.sys.events){
        // if create already happened, setup immediately; otherwise wait for 'create'
        if(scene.sys.settings && scene.sys.settings.active){
          setupScene(scene)
        } else {
          scene.sys.events.once('create',()=> setupScene(scene))
        }
      } else {
        // fallback: try after a short delay
        setTimeout(()=>{
          const s2 = g.scene.scenes[0]
          if(s2) setupScene(s2)
        },200)
      }

      return ()=>{ try{ unsub() }catch{}; g.destroy(true) }
    }
  },[])
  return <div ref={ref} id="phaser-root"></div>
}
