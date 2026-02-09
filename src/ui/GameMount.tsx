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
          const wallDisplays: Record<string, any> = {}
          const floorDisplays: Record<string, any> = {}
          let fogGraphics: any
          let flashOverlay: any
          let playerPos: Coord = {x: Math.floor(eng.width/2), y: Math.floor(eng.height/2)}

          function toScreen(pos:{x:number,y:number}){ return {x: pos.x * tileSize + tileSize/2, y: pos.y * tileSize + tileSize/2} }

          function ensureFlashOverlay(){
            if(flashOverlay) return
            flashOverlay = sc.add.rectangle(sc.scale.width/2, sc.scale.height/2, sc.scale.width, sc.scale.height, 0xff3355, 0).setDepth(999)
          }

          function flashDamage(){
            ensureFlashOverlay()
            flashOverlay.setAlpha(0.28)
            sc.tweens.add({targets:flashOverlay, alpha:0, duration:140, ease:'Cubic.Out'})
            try{ sc.cameras.main.shake(90, 0.003) }catch{}
          }

          function fxBurstAt(pos:Coord, color=0xffffff){
            const p = toScreen(pos)
            const c = sc.add.circle(p.x, p.y, Math.max(2, tileSize*0.22), color, 0.9)
            c.setDepth(200)
            sc.tweens.add({targets:c, scale:2.2, alpha:0, duration:180, onComplete:()=>c.destroy()})
          }

          function paintFog(){
            if(!fogGraphics) return
            fogGraphics.clear()
            fogGraphics.fillStyle(0x000000, 0.84)
            fogGraphics.fillRect(0, 0, sc.scale.width, sc.scale.height)

            const p = toScreen(playerPos)
            // soft edge: erase large then inner circles for smoother falloff
            fogGraphics.fillStyle(0x000000, 0)
            fogGraphics.fillCircle(p.x, p.y, tileSize * 5.2)
            fogGraphics.fillStyle(0x000000, 0.08)
            fogGraphics.fillCircle(p.x, p.y, tileSize * 4.5)
            fogGraphics.fillStyle(0x000000, 0.15)
            fogGraphics.fillCircle(p.x, p.y, tileSize * 3.8)
          }

          function applyVision(){
            const state = (window as any).game?.getState?.()
            if(!state) return
            const vis = new Set((state.visible||[]).map((v:any)=>`${v.x},${v.y}`))
            const seen = new Set((state.discovered||[]).map((v:any)=>`${v.x},${v.y}`))

            Object.keys(floorDisplays).forEach(k=>{
              if(vis.has(k)) floorDisplays[k].setAlpha(0.9)
              else if(seen.has(k)) floorDisplays[k].setAlpha(0.23)
              else floorDisplays[k].setAlpha(0)
            })

            Object.keys(wallDisplays).forEach(k=>{
              if(vis.has(k)) wallDisplays[k].setAlpha(1)
              else if(seen.has(k)) wallDisplays[k].setAlpha(0.32)
              else wallDisplays[k].setAlpha(0)
            })

            ;(state.entities||[]).forEach((ent:any)=>{
              const d = displays[ent.id]
              if(!d) return
              const k = `${ent.pos.x},${ent.pos.y}`
              if(ent.id==='p') d.setAlpha(1)
              else d.setAlpha(vis.has(k) ? 1 : 0)
            })
          }

          function rebuildMapAndEntities(payload:any){
            Object.keys(displays).forEach(id=>{ try{ displays[id].destroy() }catch{}; delete displays[id] })
            Object.keys(wallDisplays).forEach(k=>{ try{ wallDisplays[k].destroy() }catch{}; delete wallDisplays[k] })
            Object.keys(floorDisplays).forEach(k=>{ try{ floorDisplays[k].destroy() }catch{}; delete floorDisplays[k] })
            if(fogGraphics){ try{ fogGraphics.destroy() }catch{}; fogGraphics = undefined }

            const wallSet = new Set((payload.walls||[]).map((w:any)=>`${w.x},${w.y}`))
            for(let y=0;y<eng.height;y++){
              for(let x=0;x<eng.width;x++){
                const k = `${x},${y}`
                const p = toScreen({x,y})
                if(wallSet.has(k)){
                  wallDisplays[k] = sc.add.rectangle(p.x,p.y,tileSize-1,tileSize-1,0x3a3a3a).setOrigin(0.5)
                } else {
                  floorDisplays[k] = sc.add.rectangle(p.x,p.y,tileSize-1,tileSize-1,0x1d2742).setOrigin(0.5)
                }
              }
            }

            ;(payload.entities||[]).forEach((ent:any)=>{
              const p = toScreen(ent.pos)
              const color = ent.type==='player'
                ? 0x00ff88
                : ent.type==='monster'
                  ? (ent.kind==='brute' ? 0xaa0000 : ent.kind==='skitter' ? 0xff8800 : 0xff3355)
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

            fogGraphics = sc.add.graphics().setDepth(500)
            paintFog()
            applyVision()
          }

          const handler = (e:any)=>{
            if(e.type==='init'){
              rebuildMapAndEntities(e.payload || {})
            } else if(e.type==='move'){
              const id = e.payload.id
              const to = e.payload.to
              const d = displays[id]
              if(d){
                const p = toScreen(to)
                sc.tweens.add({targets:d,x:p.x,y:p.y,duration:100,ease:'Quad.Out'})
              }
              if(id==='p'){ playerPos = to; paintFog() }
              applyVision()
            } else if(e.type==='die'){
              const id = e.payload.id
              const d = displays[id]
              if(d){
                sc.tweens.add({targets:d, scale:0.1, alpha:0, duration:120, onComplete:()=>{ d.destroy(); delete displays[id] }})
              }
              if(d?.x!=null && d?.y!=null) fxBurstAt({x:Math.floor(d.x/tileSize),y:Math.floor(d.y/tileSize)}, 0xff5566)
            } else if(e.type==='combat'){
              const attacker = displays[e.payload.attacker]
              const target = displays[e.payload.target]
              if(attacker){ sc.tweens.add({targets:attacker,alpha:0.25,duration:70,yoyo:true}) }
              if(target){ sc.tweens.add({targets:target,scale:1.22,duration:70,yoyo:true}) }
              if(e.payload.target==='p') flashDamage()
            } else if(e.type==='pickup'){
              const st = (window as any).game?.getState?.()
              const p = st?.entities?.find((x:any)=>x.id==='p')?.pos
              if(p) fxBurstAt(p, 0x88ffcc)
            } else if(e.type==='stairs_spawned'){
              const st = (window as any).game?.getState?.()
              const s = st?.entities?.find((x:any)=>x.type==='item' && x.kind==='stairs')
              if(s){
                const d = displays[s.id]
                if(d){ sc.tweens.add({targets:d,alpha:0.35,duration:240,yoyo:true,repeat:3}) }
              }
            }
          }

          unsub = eventBus.subscribe(handler)
          eventBus.getLines().forEach(l=>{ try{ handler(JSON.parse(l)) }catch(_){ } })
          const visionPoll = setInterval(applyVision, 140)
          const oldUnsub = unsub
          unsub = ()=>{ clearInterval(visionPoll); oldUnsub() }
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
