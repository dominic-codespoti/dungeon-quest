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

function getFloatNumbersFromUrl(){
  return new URLSearchParams(window.location.search).get('float') !== '0'
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
      const showDamageNumbers = getFloatNumbersFromUrl()
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
          const hpBars: Record<string, {bg:any, fg:any, lastHp?:number}> = {}
          let bossBarWrap: any
          let bossBarBg: any
          let bossBarFill: any
          let bossBarText: any
          let fogGraphics: any
          let flashOverlay: any
          let targetingGraphics: any
          let bossIntroForId: string | null = null
          let playerPos: Coord = {x: Math.floor(eng.width/2), y: Math.floor(eng.height/2)}

          function toScreen(pos:{x:number,y:number}){ return {x: pos.x * tileSize + tileSize/2, y: pos.y * tileSize + tileSize/2} }

          function textureForEntity(ent:any){
            if(ent.type==='player') return klass==='rogue' ? TEX_KEYS.rogue : TEX_KEYS.knight
            if(ent.type==='monster'){
              if(ent.kind==='boss') return TEX_KEYS.brute
              if(ent.kind==='brute') return TEX_KEYS.brute
              if(ent.kind==='skitter') return TEX_KEYS.skitter
              if(ent.kind==='spitter') return TEX_KEYS.skitter
              if(ent.kind==='sentinel') return TEX_KEYS.brute
              return TEX_KEYS.chaser
            }
            if(ent.kind==='stairs') return TEX_KEYS.stairs
            if(ent.kind==='relic') return TEX_KEYS.relic
            if(ent.kind==='potion' || ent.kind==='elixir') return TEX_KEYS.potion
            if(ent.kind==='bomb') return TEX_KEYS.relic
            if(ent.kind==='blink-shard') return TEX_KEYS.gear
            if(ent.kind==='chest') return TEX_KEYS.relic
            if(ent.kind==='shrine') return TEX_KEYS.idol
            if(ent.kind==='fountain') return TEX_KEYS.potion
            if(ent.kind==='rift-orb') return TEX_KEYS.relic
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

          function fxLine(from:Coord, to:Coord, color=0xffffff){
            const a = toScreen(from)
            const b = toScreen(to)
            const g = sc.add.graphics().setDepth(250)
            g.lineStyle(2, color, 0.95)
            g.beginPath()
            g.moveTo(a.x, a.y)
            g.lineTo(b.x, b.y)
            g.strokePath()
            sc.tweens.add({targets:g, alpha:0, duration:130, onComplete:()=>g.destroy()})
          }

          function fxDamageNumber(pos:Coord, damage:number, isPlayerTarget=false){
            const p = toScreen(pos)
            const t = sc.add.text(p.x, p.y - tileSize*0.6, `-${Math.max(0, Math.floor(damage||0))}`, {
              fontFamily:'monospace',
              fontSize: String(Math.max(10, Math.floor(tileSize*0.42))),
              color: isPlayerTarget ? '#ff8080' : '#ffd37a',
              stroke:'#120f0f',
              strokeThickness:2
            }).setOrigin(0.5).setDepth(320)
            sc.tweens.add({targets:t, y:t.y - tileSize*0.7, alpha:0, duration:360, ease:'Cubic.Out', onComplete:()=>t.destroy()})
          }

          function ensureBossBar(){
            if(bossBarWrap) return
            const w = Math.min(sc.scale.width*0.62, 520)
            const h = 16
            const x = (sc.scale.width - w)/2
            const y = 14
            bossBarWrap = sc.add.container(0,0).setDepth(900)
            bossBarBg = sc.add.rectangle(x + w/2, y + h/2, w, h, 0x1a1414, 0.92)
            bossBarBg.setStrokeStyle(2, 0x6b3a3a, 1)
            bossBarFill = sc.add.rectangle(x + 2, y + h/2, w-4, h-4, 0xb23a3a, 0.95).setOrigin(0,0.5)
            bossBarText = sc.add.text(sc.scale.width/2, y - 11, 'BOSS', {
              fontFamily:'monospace', fontSize:'12px', color:'#ffd9d9', stroke:'#120f0f', strokeThickness:2
            }).setOrigin(0.5,0)
            bossBarWrap.add([bossBarBg, bossBarFill, bossBarText])
          }

          function clearBossBar(){
            if(!bossBarWrap) return
            try{ bossBarWrap.destroy(true) }catch{}
            bossBarWrap = undefined
            bossBarBg = undefined
            bossBarFill = undefined
            bossBarText = undefined
          }

          function showBossIntro(title:string){
            const t = sc.add.text(sc.scale.width/2, 48, title, {
              fontFamily:'monospace',
              fontSize:'20px',
              color:'#ffd9d9',
              stroke:'#120f0f',
              strokeThickness:4
            }).setOrigin(0.5).setDepth(930)
            t.setAlpha(0)
            sc.tweens.add({targets:t, alpha:1, y:t.y+4, duration:180, yoyo:true, hold:520, onComplete:()=>t.destroy()})
            try{ sc.cameras.main.shake(90, 0.0025) }catch{}
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

            let activeBoss:any = null
            ;(state.entities||[]).forEach((ent:any)=>{
              const d = displays[ent.id]
              if(!d) return
              const k = `${ent.pos.x},${ent.pos.y}`
              const isVisible = ent.id==='p' ? true : vis.has(k)
              if(ent.id==='p') d.setAlpha(1)
              else d.setAlpha(isVisible ? 1 : 0)
              d.clearTint()
              if(ent.kind==='boss') d.setTint(0xff8a66)
              if(ent.kind==='spitter') d.setTint(0x7dff9a)
              if(ent.kind==='sentinel') d.setTint(0xffdf7d)
              if(ent.kind==='chest') d.setTint(0xffd36b)
              if(ent.kind==='shrine') d.setTint(0x9a77ff)
              if(ent.kind==='fountain') d.setTint(0x63d6ff)
              if(ent.kind==='rift-orb') d.setTint(0xc27dff)

              const isEnemy = ent.type==='monster'
              const hasHp = Number.isFinite(ent.hp) && Number.isFinite(ent.maxHp) && ent.maxHp>0
              const shouldShowBar = isEnemy && hasHp && ent.kind!=='boss' && isVisible
              if(shouldShowBar){
                if(!hpBars[ent.id]){
                  const bg = sc.add.rectangle(d.x, d.y + tileSize*0.56, tileSize*0.74, 4, 0x1a1a1a, 0.86).setDepth(360)
                  const fg = sc.add.rectangle(d.x - (tileSize*0.74)/2 + 1, d.y + tileSize*0.56, tileSize*0.74 - 2, 2, 0x87e08a, 0.95).setOrigin(0,0.5).setDepth(361)
                  hpBars[ent.id] = {bg, fg, lastHp: Number(ent.hp)}
                }
                const bar = hpBars[ent.id]
                if(bar){
                  const ratio = Math.max(0, Math.min(1, ent.hp / Math.max(1, ent.maxHp)))
                  bar.bg.setPosition(d.x, d.y + tileSize*0.56).setAlpha(0.92)
                  bar.fg.setPosition(d.x - (tileSize*0.74)/2 + 1, d.y + tileSize*0.56)
                  bar.fg.width = Math.max(1, (tileSize*0.74 - 2) * ratio)
                  bar.fg.fillColor = ratio < 0.34 ? 0xff7a7a : ratio < 0.67 ? 0xffcc66 : 0x87e08a
                  bar.fg.setAlpha(0.98)
                  const hpNow = Number(ent.hp)
                  if(Number.isFinite(bar.lastHp) && hpNow < Number(bar.lastHp)){
                    bar.bg.setFillStyle(0x562222, 0.98)
                    sc.tweens.add({targets:bar.bg, alpha:0.78, duration:90, yoyo:true, onComplete:()=>bar.bg.setFillStyle(0x1a1a1a, 0.86)})
                  }
                  bar.lastHp = hpNow
                }
              } else {
                const bar = hpBars[ent.id]
                if(bar){
                  try{ bar.bg.destroy(); bar.fg.destroy() }catch{}
                  delete hpBars[ent.id]
                }
              }

              if(ent.kind==='boss') activeBoss = ent
            })

            Object.keys(hpBars).forEach(id=>{
              if(!(state.entities||[]).some((e:any)=>e.id===id)){
                const bar = hpBars[id]
                if(bar){
                  try{ bar.bg.destroy(); bar.fg.destroy() }catch{}
                  delete hpBars[id]
                }
              }
            })

            if(activeBoss && Number.isFinite(activeBoss.hp) && Number.isFinite(activeBoss.maxHp) && activeBoss.maxHp>0){
              if(bossIntroForId !== String(activeBoss.id)){
                bossIntroForId = String(activeBoss.id)
                showBossIntro('BOSS ENCOUNTER')
              }
              ensureBossBar()
              if(bossBarBg && bossBarFill && bossBarText){
                const w = bossBarBg.width
                const ratio = Math.max(0, Math.min(1, activeBoss.hp / Math.max(1, activeBoss.maxHp)))
                const phase = ratio > 0.66 ? 'PHASE I' : ratio > 0.33 ? 'PHASE II' : 'PHASE III'
                bossBarFill.width = Math.max(2, (w-4) * ratio)
                bossBarFill.fillColor = ratio > 0.66 ? 0xb23a3a : ratio > 0.33 ? 0xcf6c2f : 0xe0b03d
                bossBarText.setText(`${String(activeBoss.kind || 'Boss').toUpperCase()} · ${phase}  ${activeBoss.hp}/${activeBoss.maxHp}`)
              }
            } else {
              bossIntroForId = null
              clearBossBar()
            }

            drawTargeting()
          }

          function rebuildMapAndEntities(payload:any){
            Object.keys(displays).forEach(id=>{ try{ displays[id].destroy() }catch{}; delete displays[id] })
            Object.keys(hpBars).forEach(id=>{ const bar = hpBars[id]; if(bar){ try{ bar.bg.destroy(); bar.fg.destroy() }catch{}; delete hpBars[id] } })
            clearBossBar()
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
              if(ent.kind==='spitter') s.setTint(0x7dff9a)
              if(ent.kind==='sentinel') s.setTint(0xffdf7d)
              if(ent.kind==='chest') s.setTint(0xffd36b)
              if(ent.kind==='shrine') s.setTint(0x9a77ff)
              if(ent.kind==='fountain') s.setTint(0x63d6ff)
              if(ent.kind==='rift-orb') s.setTint(0xc27dff)
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
              if(hpBars[id]){
                try{ hpBars[id].bg.destroy(); hpBars[id].fg.destroy() }catch{}
                delete hpBars[id]
              }
              if(d?.x!=null && d?.y!=null) fxBurstAt({x:Math.floor(d.x/tileSize),y:Math.floor(d.y/tileSize)}, 0xff5566)
            } else if(e.type==='combat'){
              const attacker = displays[e.payload.attacker]
              const target = displays[e.payload.target]
              if(attacker){ sc.tweens.add({targets:attacker,alpha:0.25,duration:70,yoyo:true}) }
              if(target){
                sc.tweens.add({targets:target,scale:1.22,duration:70,yoyo:true})
                const to = {x: Math.floor(target.x/tileSize), y: Math.floor(target.y/tileSize)}
                if(showDamageNumbers && Number.isFinite(e.payload?.damage) && e.payload.damage>0) fxDamageNumber(to, e.payload.damage, e.payload.target==='p')
              }
              if(e.payload.target==='p') flashDamage()
            } else if(e.type==='boss_charge'){
              const boss = displays[e.payload?.id]
              if(boss){
                boss.setTint(0xff3333)
                sc.tweens.add({targets:boss, scale:1.25, duration:120, yoyo:true, repeat:1, onComplete:()=>boss.setTint(0xff8a66)})
              }
            } else if(e.type==='boss_slam'){
              try{ sc.cameras.main.shake(140, 0.005) }catch{}
            } else if(e.type==='spit_used'){
              const attacker = displays[e.payload?.id]
              const player = displays['p']
              if(attacker && player){
                const from = {x: Math.floor(attacker.x/tileSize), y: Math.floor(attacker.y/tileSize)}
                const to = {x: Math.floor(player.x/tileSize), y: Math.floor(player.y/tileSize)}
                fxLine(from, to, 0x7dff9a)
              }
            } else if(e.type==='bomb_blast'){
              fxBurstAt(e.payload?.at || {x:0,y:0}, 0xffb84d)
              try{ sc.cameras.main.shake(120, 0.004) }catch{}
            } else if(e.type==='blink_used'){
              const p = displays['p']
              const to = e.payload?.to
              if(p && to){
                const sp = toScreen(to)
                fxBurstAt(e.payload?.from || to, 0x88aaff)
                p.setAlpha(0.35)
                p.setPosition(sp.x, sp.y)
                sc.tweens.add({targets:p, alpha:1, duration:120})
                fxBurstAt(to, 0xbad0ff)
              }
            } else if(e.type==='rift_used'){
              const st = (window as any).game?.getState?.()
              const p = st?.entities?.find((x:any)=>x.id==='p')?.pos
              if(p) fxBurstAt(p, 0xc27dff)
              try{ sc.cameras.main.shake(90, 0.003) }catch{}
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
