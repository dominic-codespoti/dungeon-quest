import React, {useEffect, useRef} from 'react'
import { createGame } from '../game'
import Engine from '../game/engine'
import eventBus from '../game/eventBus'
import type {PlayerClass} from '../game/types'

type Coord = {x:number,y:number}

function getSeedFromUrl(){
  const s = new URLSearchParams(window.location.search).get('seed')
  const n = s ? Number(s) : 1
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

function getClassFromUrl(): PlayerClass {
  const c = new URLSearchParams(window.location.search).get('class')
  return c === 'rogue' ? 'rogue' : 'knight'
}

function navigate(seed:number, klass:PlayerClass){
  const u = new URL(window.location.href)
  u.searchParams.set('seed', String(seed))
  u.searchParams.set('class', klass)
  window.location.href = u.toString()
}

export default function GameMount(){
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(()=>{
    let unsub:()=>void = ()=>{}
    if(ref.current){
      const g = createGame(ref.current)

      const seed = getSeedFromUrl()
      const klass = getClassFromUrl()
      const eng = new Engine(30,30,seed,klass)
      ;(window as any).game = {
        getState: ()=> eng.getState(),
        step: (a:any)=> eng.step(a),
        getSeed: ()=> seed,
        getClass: ()=> klass,
        resetSameSeed: ()=> navigate(seed, klass),
        resetNewSeed: ()=> navigate(Math.floor(Math.random()*1_000_000)+1, klass),
        setClass: (next:PlayerClass)=> navigate(seed, next),
        subscribe: (fn:(e:any)=>void)=>{ return eventBus.subscribe(fn) }
      }

      const scene = g.scene.scenes[0]
      function setupScene(sc:any){
        try{
          const tileW = Math.floor(sc.scale.width / eng.width)
          const tileH = Math.floor(sc.scale.height / eng.height)
          const tileSize = Math.max(8, Math.min(tileW, tileH))

          const displays: Record<string, any> = {}
          let wallDisplays: any[] = []
          let fogGraphics: any
          let playerPos: Coord = {x: Math.floor(eng.width/2), y: Math.floor(eng.height/2)}

          function toScreen(pos:{x:number,y:number}){ return {x: pos.x * tileSize + tileSize/2, y: pos.y * tileSize + tileSize/2} }
          function paintFog(){
            if(!fogGraphics) return
            fogGraphics.clear()
            fogGraphics.fillStyle(0x000000, 0.55)
            fogGraphics.fillRect(0, 0, sc.scale.width, sc.scale.height)
            const p = toScreen(playerPos)
            fogGraphics.fillStyle(0x000000, 0)
            fogGraphics.fillCircle(p.x, p.y, tileSize * 3.5)
          }

          const handler = (e:any)=>{
            if(e.type==='init'){
              Object.keys(displays).forEach(id=>{ try{ displays[id].destroy() }catch{}; delete displays[id] })
              wallDisplays.forEach(w=>{ try{ w.destroy() }catch{} })
              wallDisplays = []
              if(fogGraphics){ try{ fogGraphics.destroy() }catch{}; fogGraphics = undefined }

              ;(e.payload.walls||[]).forEach((w:any)=>{
                const p = toScreen(w)
                const wall = sc.add.rectangle(p.x,p.y,tileSize-1,tileSize-1,0x3a3a3a).setOrigin(0.5)
                wallDisplays.push(wall)
              })

              ;(e.payload.entities||[]).forEach((ent:any)=>{
                const p = toScreen(ent.pos)
                const color = ent.type==='player'
                  ? 0x00ff00
                  : ent.type==='monster'
                    ? (ent.kind==='brute' ? 0xaa0000 : ent.kind==='skitter' ? 0xff8800 : 0xff0000)
                    : ent.kind==='stairs'
                      ? 0xaa66ff
                      : ent.kind==='relic'
                        ? 0x00ffff
                        : ent.kind==='elixir'
                          ? 0xaaff66
                          : ent.kind==='cursed-idol'
                            ? 0xaa33aa
                            : ent.kind==='gear'
                              ? 0xffd166
                              : 0x4488ff
                const r = sc.add.rectangle(p.x,p.y,tileSize-2,tileSize-2,color).setOrigin(0.5)
                displays[ent.id] = r
                if(ent.id==='p') playerPos = ent.pos
              })

              fogGraphics = sc.add.graphics()
              paintFog()
            } else if(e.type==='move'){
              const id = e.payload.id
              const to = e.payload.to
              const d = displays[id]
              if(d){
                const p = toScreen(to)
                sc.tweens.add({targets:d,x:p.x,y:p.y,duration:120,ease:'Linear'})
              }
              if(id==='p'){ playerPos = to; paintFog() }
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

          unsub = eventBus.subscribe(handler)
          eventBus.getLines().forEach(l=>{ try{ handler(JSON.parse(l)) }catch(_){ } })
        }catch(err){ console.error('renderer setup failed',err) }
      }

      if(scene && scene.sys && scene.sys.events){
        if(scene.sys.settings && scene.sys.settings.active) setupScene(scene)
        else scene.sys.events.once('create',()=> setupScene(scene))
      } else {
        setTimeout(()=>{ const s2 = g.scene.scenes[0]; if(s2) setupScene(s2) },200)
      }

      return ()=>{ try{ unsub() }catch{}; g.destroy(true) }
    }
  },[])
  return <div ref={ref} id="phaser-root"></div>
}
