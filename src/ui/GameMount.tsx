import React, {useEffect, useRef} from 'react'
import Phaser from 'phaser'
import { createGame, TEX_KEYS } from '../game'
import Engine from '../game/engine'
import eventBus from '../game/eventBus'
import type {PlayerClass, PlayerRace} from '../game/types'

// textures/sprites loaded in Phaser preload via TEX_KEYS

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

function getRaceFromUrl(): PlayerRace {
  const r = new URLSearchParams(window.location.search).get('race')
  return r==='elf' || r==='dwarf' ? r : 'human'
}

function navigate(seed:number, klass:PlayerClass, race:PlayerRace){
  const u = new URL(window.location.href)
  u.searchParams.set('seed', String(seed))
  u.searchParams.set('class', klass)
  u.searchParams.set('race', race)
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
      const race = getRaceFromUrl()
      const eng = new Engine(30,30,seed,klass,race)
      ;(window as any).game = {
        getState: ()=> eng.getState(),
        step: (a:any)=> eng.step(a),
        getSeed: ()=> seed,
        getClass: ()=> klass,
        getRace: ()=> race,
        resetSameSeed: ()=> navigate(seed, klass, race),
        resetNewSeed: ()=> navigate(Math.floor(Math.random()*1_000_000)+1, klass, race),
        setClass: (next:PlayerClass)=> navigate(seed, next, race),
        setRace: (next:PlayerRace)=> navigate(seed, klass, next),
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
          let targetingGraphics: any
          let playerPos: Coord = {x: Math.floor(eng.width/2), y: Math.floor(eng.height/2)}

          function toScreen(pos:{x:number,y:number}){ return {x: pos.x * tileSize + tileSize/2, y: pos.y * tileSize + tileSize/2} }

          function textureForEntity(ent:any){
            if(ent.type==='player') return klass==='rogue' ? TEX_KEYS.rogue : TEX_KEYS.knight
            if(ent.type==='monster'){
              if(ent.kind==='boss') return TEX_KEYS.brute
              if(ent.kind==='brute') return TEX_KEYS.brute
              if(ent.kind==='skitter') return TEX_KEYS.skitter
              return TEX_KEYS.chaser
            }
            if(ent.kind==='stairs') return TEX_KEYS.stairs
            if(ent.kind==='relic') return TEX_KEYS.relic
            if(ent.kind==='potion' || ent.kind==='elixir') return TEX_KEYS.potion
            if(ent.kind==='bomb') return TEX_KEYS.relic
            if(ent.kind==='cursed-idol') return TEX_KEYS.idol
            if(ent.kind==='gear') return TEX_KEYS.gear
            return TEX_KEYS.relic
          }

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
            // Keep a very subtle vignette only; tile visibility is controlled by applyVision alpha.
            fogGraphics.fillStyle(0x000000, 0.18)
            fogGraphics.fillRect(0, 0, sc.scale.width, sc.scale.height)
          }

          function drawTargeting(){
            if(!targetingGraphics) return
            targetingGraphics.clear()
            const t = (window as any).gameTargeting
            if(!t?.active || !Array.isArray(t.tiles)) return
            for(const tile of t.tiles){
              const p = toScreen(tile)
              const color = tile.kind==='enemy' ? 0xff6677 : tile.kind==='blocked' ? 0xffcc66 : 0x67a6ff
              const alpha = tile.selected ? 0.55 : 0.3
              targetingGraphics.fillStyle(color, alpha)
              targetingGraphics.fillRect(p.x - tileSize/2 + 1, p.y - tileSize/2 + 1, tileSize-2, tileSize-2)
              targetingGraphics.lineStyle(1, color, 0.95)
              targetingGraphics.strokeRect(p.x - tileSize/2 + 1, p.y - tileSize/2 + 1, tileSize-2, tileSize-2)
            }
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
              d.clearTint()
              if(ent.kind==='boss') d.setTint(0xff8a66)
            })
            drawTargeting()
          }

          function rebuildMapAndEntities(payload:any){
            Object.keys(displays).forEach(id=>{ try{ displays[id].destroy() }catch{}; delete displays[id] })
            Object.keys(wallDisplays).forEach(k=>{ try{ wallDisplays[k].destroy() }catch{}; delete wallDisplays[k] })
            Object.keys(floorDisplays).forEach(k=>{ try{ floorDisplays[k].destroy() }catch{}; delete floorDisplays[k] })
            if(fogGraphics){ try{ fogGraphics.destroy() }catch{}; fogGraphics = undefined }
            if(targetingGraphics){ try{ targetingGraphics.destroy() }catch{}; targetingGraphics = undefined }

            const wallSet = new Set((payload.walls||[]).map((w:any)=>`${w.x},${w.y}`))
            for(let y=0;y<eng.height;y++){
              for(let x=0;x<eng.width;x++){
                const k = `${x},${y}`
                const p = toScreen({x,y})
                if(wallSet.has(k)){
                  const wall = sc.add.rectangle(p.x,p.y,tileSize-1,tileSize-1,0x3a3f52).setOrigin(0.5)
                  wall.setStrokeStyle(1, 0x6f7aa1, 0.65)
                  wallDisplays[k] = wall
                } else {
                  const floor = sc.add.rectangle(p.x,p.y,tileSize-1,tileSize-1,0x1b2340).setOrigin(0.5)
                  floor.setStrokeStyle(1, 0x2f3d66, 0.28)
                  floorDisplays[k] = floor
                }
              }
            }

            ;(payload.entities||[]).forEach((ent:any)=>{
              const p = toScreen(ent.pos)
              const s = sc.add.image(p.x,p.y,textureForEntity(ent)).setOrigin(0.5)
              s.setDisplaySize(tileSize-2, tileSize-2)
              if(ent.kind==='boss') s.setTint(0xff8a66)
              displays[ent.id] = s
              if(ent.id==='p') playerPos = ent.pos
            })

            fogGraphics = sc.add.graphics().setDepth(500)
            targetingGraphics = sc.add.graphics().setDepth(700)
            paintFog()
            applyVision()
            drawTargeting()
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
            } else if(e.type==='boss_charge'){
              const boss = displays[e.payload?.id]
              if(boss){
                boss.setTint(0xff3333)
                sc.tweens.add({targets:boss, scale:1.25, duration:120, yoyo:true, repeat:1, onComplete:()=>boss.setTint(0xff8a66)})
              }
            } else if(e.type==='boss_slam'){
              try{ sc.cameras.main.shake(140, 0.005) }catch{}
            } else if(e.type==='bomb_blast'){
              fxBurstAt(e.payload?.at || {x:0,y:0}, 0xffb84d)
              try{ sc.cameras.main.shake(120, 0.004) }catch{}
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

      const waitForScene = (tries=0)=>{
        const s = g.scene.scenes[0]
        if(s && s.add && s.sys){
          setupScene(s)
          return
        }
        if(tries < 40) setTimeout(()=>waitForScene(tries+1), 100)
      }
      waitForScene()

      return ()=>{ try{ unsub() }catch{}; g.destroy(true) }
    }
  },[])
  return <div ref={ref} id="phaser-root"></div>
}
