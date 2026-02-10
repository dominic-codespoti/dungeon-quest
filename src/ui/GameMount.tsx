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
type VisualPreset = 'normal'|'readable'|'crisp'
function getVisualPresetFromUrl(): VisualPreset {
  const p = new URLSearchParams(window.location.search)
  const vis = p.get('vis')
  if(vis==='normal' || vis==='readable' || vis==='crisp') return vis
  return p.get('contrast') === '0' ? 'normal' : 'readable'
}
// visual preset drives contrast; kept URL-compatible via vis param
function getVisionDebugFromUrl(){
  return new URLSearchParams(window.location.search).get('debugvis') === '1'
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
    let cancelled = false
    if(ref.current){
      const g = createGame(ref.current)

      const seed = getSeedFromUrl()
      const klass = getClassFromUrl()
      const race = getRaceFromUrl()
      const showDamageNumbers = getFloatNumbersFromUrl()
      const visualPreset = getVisualPresetFromUrl()
      const visionDebug = getVisionDebugFromUrl()
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
        subscribe: (fn:(e:any)=>void)=>{ return eventBus.subscribe(fn) },
        equipInventoryIndex: (index:number)=> eng.equipInventoryIndex(index),
        unequipInventoryIndex: (index:number)=> eng.unequipInventoryIndex(index),
        autoEquipBest: ()=> eng.autoEquipBest(),
        unequipAll: ()=> eng.unequipAll(),
        sortInventory: ()=> eng.sortInventory(),
        equipSpiritCore: (index:number)=> eng.equipSpiritCore(index),
        unequipSpiritCore: (index:number)=> eng.unequipSpiritCore(index),
        buyShopOffer: (index:number)=> eng.buyShopOffer(index),
        rerollShopOffers: ()=> eng.rerollShopOffers(),
        closeShop: ()=> eng.closeShop('manual')
      }

      const scene = g.scene.scenes[0]
      function setupScene(sc:any){
        try{
          const tileW = Math.floor(sc.scale.width / eng.width)
          const tileH = Math.floor(sc.scale.height / eng.height)
          const rawTile = Math.max(8, Math.min(tileW, tileH))
          const tileSize = rawTile % 2 === 0 ? rawTile : Math.max(8, rawTile - 1)

          const displays: Record<string, any> = {}
          const wallDisplays: Record<string, any> = {}
          const floorDisplays: Record<string, any> = {}
          const hpBars: Record<string, {bg:any, fg:any, lastHp?:number}> = {}
          const enemyNameTags: Record<string, any> = {}
          let hoveredEnemyId: string | null = null
          let selectedEnemyId: string | null = null
          let enemyInfoWrap: any
          let enemyInfoBg: any
          let enemyInfoText: any
          let bossBarWrap: any
          let bossBarBg: any
          let bossBarFill: any
          let bossBarText: any
          let activeBossIdForUi: string | null = null
          let fogGraphics: any
          let flashOverlay: any
          let targetingGraphics: any
          let visionDebugText: any
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
            if(ent.kind==='essence') return TEX_KEYS.potion
            if(ent.kind==='spirit-implant') return TEX_KEYS.idol
            if(ent.kind==='merchant') return TEX_KEYS.relic
            if(ent.kind==='cursed-idol') return TEX_KEYS.idol
            if(ent.kind==='gear') return TEX_KEYS.gear
            return TEX_KEYS.relic
          }

          const entityDepth = (ent:any)=>{
            const row = Number(ent?.pos?.y || 0)
            if(ent?.type==='item') return 300 + row
            if(ent?.type==='monster') return 330 + row
            return 360 + row
          }

          const pruneMissingEntityDisplays = (state:any)=>{
            const alive = new Set((state?.entities || []).map((x:any)=>String(x.id)))
            Object.keys(displays).forEach(id=>{
              if(alive.has(String(id))) return
              try{ displays[id].destroy() }catch{}
              delete displays[id]
            })
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

          function enemyArchetypeLabel(kind:string){
            if(kind==='boss') return 'Boss'
            if(kind==='brute') return 'Brute'
            if(kind==='spitter') return 'Spitter'
            if(kind==='sentinel') return 'Sentinel'
            if(kind==='skitter') return 'Skitter'
            return 'Chaser'
          }

          function enemyRoleHint(kind:string){
            if(kind==='spitter') return 'Ranged: spits at distance, kites when pressured'
            if(kind==='sentinel') return 'Control: holds lanes, short-range zap'
            if(kind==='brute') return 'Melee: heavy hits, can lunge in straight lanes'
            if(kind==='skitter') return 'Flanker: erratic pathing and tempo'
            if(kind==='boss') return 'Boss: phases + charge slam'
            return 'Melee pressure unit'
          }

          function enemyLevel(ent:any, state:any){
            return Math.max(1, Math.floor((state?.floor || 1) + ((ent?.kind==='boss' ? 3 : ent?.kind==='brute' || ent?.kind==='sentinel' ? 1 : 0))))
          }

          function ensureEnemyInfo(){
            if(enemyInfoWrap) return
            const w = Math.min(360, sc.scale.width * 0.44)
            const h = 58
            const x = 12
            const y = 12
            enemyInfoWrap = sc.add.container(0,0).setDepth(910)
            enemyInfoBg = sc.add.rectangle(x + w/2, y + h/2, w, h, 0x121826, 0.9)
            enemyInfoBg.setStrokeStyle(1, 0x4e5f8f, 0.95)
            enemyInfoText = sc.add.text(x+8, y+7, '', {
              fontFamily:'monospace', fontSize:'11px', color:'#d7e2ff'
            }).setOrigin(0,0)
            enemyInfoWrap.add([enemyInfoBg, enemyInfoText])
            enemyInfoWrap.setVisible(false)
          }

          function renderEnemyInfo(state:any){
            ensureEnemyInfo()
            if(!enemyInfoWrap || !enemyInfoText) return
            if(!selectedEnemyId){ enemyInfoWrap.setVisible(false); return }
            const ent = (state?.entities||[]).find((x:any)=>x.id===selectedEnemyId && x.type==='monster')
            if(!ent){ selectedEnemyId = null; enemyInfoWrap.setVisible(false); return }
            const name = enemyArchetypeLabel(String(ent.kind||'chaser'))
            const hp = Number.isFinite(ent.hp) ? ent.hp : '?'
            const maxHp = Number.isFinite(ent.maxHp) ? ent.maxHp : '?'
            const level = enemyLevel(ent, state)
            enemyInfoText.setText(`${name} · Lv ${level}\nHP ${hp}/${maxHp} · ${enemyRoleHint(String(ent.kind||'chaser'))}`)
            enemyInfoWrap.setVisible(true)
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
            bossBarBg.setInteractive({cursor:'pointer'})
            bossBarBg.on('pointerdown', ()=>{
              if(!activeBossIdForUi) return
              selectedEnemyId = selectedEnemyId===activeBossIdForUi ? null : activeBossIdForUi
              const st = (window as any).game?.getState?.()
              renderEnemyInfo(st)
            })
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
            // Keep a subtle vignette only; tile visibility is controlled by applyVision alpha.
            const fogAlpha = visualPreset==='crisp' ? 0.08 : visualPreset==='readable' ? 0.1 : 0.14
            fogGraphics.fillStyle(0x000000, fogAlpha)
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
            try{
              const vis = new Set((state.visible||[]).map((v:any)=>`${v.x},${v.y}`))
              const seen = new Set((state.discovered||[]).map((v:any)=>`${v.x},${v.y}`))

            // Defensive render fallback: if visibility payload collapses OR does not map to known tiles,
            // reveal a local radius so board contrast never hard-drops to black.
            const player = (state.entities||[]).find((e:any)=>e.id==='p')?.pos || playerPos
            const hasMappedVis = [...vis].some((k)=> {
              const key = String(k)
              return Boolean(floorDisplays[key] || wallDisplays[key])
            })
            if(player && (!vis.size || !hasMappedVis)){
              for(let y=Math.max(0, player.y-3); y<=Math.min(eng.height-1, player.y+3); y++){
                for(let x=Math.max(0, player.x-3); x<=Math.min(eng.width-1, player.x+3); x++){
                  const d = Math.abs(x-player.x)+Math.abs(y-player.y)
                  if(d<=3) vis.add(`${x},${y}`)
                  if(d<=6) seen.add(`${x},${y}`)
                }
              }
            }

            const floorSeenAlpha = visualPreset==='crisp' ? 0.78 : visualPreset==='readable' ? 0.72 : 0.66
            const floorHiddenAlpha = 0
            const wallSeenAlpha = visualPreset==='crisp' ? 0.84 : visualPreset==='readable' ? 0.78 : 0.72
            const wallHiddenAlpha = 0
            const floorVisibleTint = visualPreset==='crisp' ? 0xffffff : visualPreset==='readable' ? 0xf8fbff : 0xf4f8ff
            const floorSeenTint = visualPreset==='crisp' ? 0xe7efff : visualPreset==='readable' ? 0xd9e5ff : 0xc2d0f4
            const wallVisibleTint = visualPreset==='crisp' ? 0xffffff : visualPreset==='readable' ? 0xebf2ff : 0xe0eaff
            const wallSeenTint = visualPreset==='crisp' ? 0xecf2ff : visualPreset==='readable' ? 0xdee9ff : 0xcad7f8

            Object.keys(floorDisplays).forEach(k=>{
              const d = floorDisplays[k]
              if(vis.has(k)){
                d.setAlpha(1)
                d.setTint(floorVisibleTint)
              }
              else if(seen.has(k)){
                d.setAlpha(floorSeenAlpha)
                d.setTint(floorSeenTint)
              }
              else d.setAlpha(floorHiddenAlpha)
            })

            Object.keys(wallDisplays).forEach(k=>{
              const d = wallDisplays[k]
              if(vis.has(k)){
                d.setAlpha(1)
                d.setTint(wallVisibleTint)
              }
              else if(seen.has(k)){
                d.setAlpha(wallSeenAlpha)
                d.setTint(wallSeenTint)
              }
              else wallDisplays[k].setAlpha(wallHiddenAlpha)
            })

            // Last-line visual safety net: if almost everything is near-black while state is live,
            // force a readable baseline once and keep going.
            let activeBoss:any = null
            const p = (state.entities||[]).find((e:any)=>e.id==='p')?.pos || playerPos
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
              if(ent.kind==='essence') d.setTint(0x9de6ff)
              if(ent.kind==='spirit-implant') d.setTint(0xd5a3ff)
              if(ent.kind==='merchant') d.setTint(0xffd36b)

              const isEnemy = ent.type==='monster'
              const hasHp = Number.isFinite(ent.hp) && Number.isFinite(ent.maxHp) && ent.maxHp>0
              const shouldShowBar = isEnemy && hasHp && ent.kind!=='boss' && isVisible && ent.hp < ent.maxHp
              const distToPlayer = Math.abs((ent.pos?.x||0)-p.x) + Math.abs((ent.pos?.y||0)-p.y)
              const showNameTag = isEnemy && isVisible && (hoveredEnemyId===ent.id || selectedEnemyId===ent.id || distToPlayer<=4)
              if(showNameTag){
                if(!enemyNameTags[ent.id]){
                  enemyNameTags[ent.id] = sc.add.text(d.x, d.y - tileSize*0.76, enemyArchetypeLabel(String(ent.kind||'chaser')), {
                    fontFamily:'monospace',
                    fontSize:'10px',
                    color:'#dce8ff',
                    stroke:'#0f1320',
                    strokeThickness:2
                  }).setOrigin(0.5,1).setDepth(365)
                }
                const short = enemyArchetypeLabel(String(ent.kind||'chaser'))
                const lvl = enemyLevel(ent, state)
                enemyNameTags[ent.id].setText(`${short} L${lvl}`)
                enemyNameTags[ent.id].setPosition(d.x, d.y - tileSize*0.72)
                enemyNameTags[ent.id].setAlpha(selectedEnemyId===ent.id ? 0.98 : hoveredEnemyId===ent.id ? 0.9 : 0.58)
              } else if(enemyNameTags[ent.id]){
                try{ enemyNameTags[ent.id].destroy() }catch{}
                delete enemyNameTags[ent.id]
              }

              if(shouldShowBar){
                if(!hpBars[ent.id]){
                  const entId = ent.id
                  const bg = sc.add.rectangle(d.x, d.y + tileSize*0.56, tileSize*0.74, 4, 0x1a1a1a, 0.86).setDepth(360)
                  const fg = sc.add.rectangle(d.x - (tileSize*0.74)/2 + 1, d.y + tileSize*0.56, tileSize*0.74 - 2, 2, 0x87e08a, 0.95).setOrigin(0,0.5).setDepth(361)
                  bg.setInteractive({cursor:'pointer'})
                  fg.setInteractive({cursor:'pointer'})
                  const selectFromBar = ()=>{
                    selectedEnemyId = selectedEnemyId===entId ? null : entId
                    const st = (window as any).game?.getState?.()
                    renderEnemyInfo(st)
                  }
                  bg.on('pointerdown', selectFromBar)
                  fg.on('pointerdown', selectFromBar)
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
            Object.keys(enemyNameTags).forEach(id=>{
              if(!(state.entities||[]).some((e:any)=>e.id===id)){
                try{ enemyNameTags[id].destroy() }catch{}
                delete enemyNameTags[id]
              }
            })

            if(activeBoss && Number.isFinite(activeBoss.hp) && Number.isFinite(activeBoss.maxHp) && activeBoss.maxHp>0){
              activeBossIdForUi = String(activeBoss.id)
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
              activeBossIdForUi = null
              bossIntroForId = null
              clearBossBar()
            }

            if(visionDebug){
              if(!visionDebugText){
                visionDebugText = sc.add.text(10, sc.scale.height-16, '', {fontFamily:'monospace', fontSize:'10px', color:'#9fb2e8'}).setDepth(980)
              }
              visionDebugText.setText(`vis:${vis.size} seen:${seen.size} tick:${state.tick ?? 0}`)
            }
            drawTargeting()
            renderEnemyInfo(state)
            }catch(err){
              console.error('[GameMount] applyVision failed; forcing safe reveal', err)
              Object.keys(floorDisplays).forEach(k=>{ try{ floorDisplays[k].setAlpha(0.3) }catch{} })
              Object.keys(wallDisplays).forEach(k=>{ try{ wallDisplays[k].setAlpha(0.25) }catch{} })
              try{ drawTargeting(); renderEnemyInfo(state) }catch{}
            }
          }

          function rebuildMapAndEntities(payload:any){
            hoveredEnemyId = null
            selectedEnemyId = null
            Object.keys(displays).forEach(id=>{ try{ displays[id].destroy() }catch{}; delete displays[id] })
            Object.keys(hpBars).forEach(id=>{ const bar = hpBars[id]; if(bar){ try{ bar.bg.destroy(); bar.fg.destroy() }catch{}; delete hpBars[id] } })
            Object.keys(enemyNameTags).forEach(id=>{ try{ enemyNameTags[id].destroy() }catch{}; delete enemyNameTags[id] })
            clearBossBar()
            Object.keys(wallDisplays).forEach(k=>{ try{ wallDisplays[k].destroy() }catch{}; delete wallDisplays[k] })
            Object.keys(floorDisplays).forEach(k=>{ try{ floorDisplays[k].destroy() }catch{}; delete floorDisplays[k] })
            if(fogGraphics){ try{ fogGraphics.destroy() }catch{}; fogGraphics = undefined }
            if(targetingGraphics){ try{ targetingGraphics.destroy() }catch{}; targetingGraphics = undefined }
            if(visionDebugText){ try{ visionDebugText.destroy() }catch{}; visionDebugText = undefined }

            const wallSet = new Set((payload.walls||[]).map((w:any)=>`${w.x},${w.y}`))
            for(let y=0;y<eng.height;y++){
              for(let x=0;x<eng.width;x++){
                const k = `${x},${y}`
                const p = toScreen({x,y})
                if(wallSet.has(k)){
                  const wall = sc.add.image(p.x, p.y, TEX_KEYS.wall).setOrigin(0.5)
                  wall.setDisplaySize(tileSize, tileSize)
                  wall.setTint(visualPreset==='crisp' ? 0xf1f6ff : visualPreset==='readable' ? 0xe6eeff : 0xc8d3f0)
                  wall.setInteractive()
                  wall.on('pointerdown', ()=>{
                    selectedEnemyId = null
                    const st = (window as any).game?.getState?.()
                    renderEnemyInfo(st)
                  })
                  wallDisplays[k] = wall
                } else {
                  const floor = sc.add.image(p.x, p.y, TEX_KEYS.floor).setOrigin(0.5)
                  floor.setDisplaySize(tileSize, tileSize)
                  floor.setTint(visualPreset==='crisp' ? 0xfcfdff : visualPreset==='readable' ? 0xf2f6ff : 0xd7e2ff)
                  floor.setInteractive({cursor:'pointer'})
                  floor.on('pointerdown', ()=>{
                    selectedEnemyId = null
                    const st = (window as any).game?.getState?.()
                    renderEnemyInfo(st)
                    const p = st?.entities?.find((x:any)=>x.id==='p')?.pos
                    if(!p) return
                    const dx = x - p.x
                    const dy = y - p.y
                    const sx = Math.sign(dx)
                    const sy = Math.sign(dy)
                    let dir:any = null
                    if(sx===0 && sy===-1) dir='up'
                    else if(sx===0 && sy===1) dir='down'
                    else if(sx===-1 && sy===0) dir='left'
                    else if(sx===1 && sy===0) dir='right'
                    else if(sx===-1 && sy===-1) dir='up-left'
                    else if(sx===1 && sy===-1) dir='up-right'
                    else if(sx===-1 && sy===1) dir='down-left'
                    else if(sx===1 && sy===1) dir='down-right'
                    if(dir) (window as any).game?.step?.({type:'move', dir})
                  })
                  floorDisplays[k] = floor
                }
              }
            }

            ;(payload.entities||[]).forEach((ent:any)=>{
              const p = toScreen(ent.pos)
              const s = sc.add.image(p.x,p.y,textureForEntity(ent)).setOrigin(0.5)
              s.setDisplaySize(tileSize-2, tileSize-2)
              s.setDepth(entityDepth(ent))
              if(ent.kind==='boss') s.setTint(0xff8a66)
              if(ent.kind==='spitter') s.setTint(0x7dff9a)
              if(ent.kind==='sentinel') s.setTint(0xffdf7d)
              if(ent.kind==='chest') s.setTint(0xffd36b)
              if(ent.kind==='shrine') s.setTint(0x9a77ff)
              if(ent.kind==='fountain') s.setTint(0x63d6ff)
              if(ent.kind==='rift-orb') s.setTint(0xc27dff)
              if(ent.kind==='essence') s.setTint(0x9de6ff)
              if(ent.kind==='spirit-implant') s.setTint(0xd5a3ff)
              if(ent.kind==='merchant') s.setTint(0xffd36b)
              if(ent.type==='monster'){
                s.setInteractive({cursor:'pointer'})
                s.on('pointerover', ()=>{
                  hoveredEnemyId = ent.id
                  const st = (window as any).game?.getState?.()
                  renderEnemyInfo(st)
                })
                s.on('pointerout', ()=>{
                  if(hoveredEnemyId===ent.id) hoveredEnemyId = null
                  const st = (window as any).game?.getState?.()
                  renderEnemyInfo(st)
                })
                s.on('pointerdown', (pointer:any)=>{
                  selectedEnemyId = selectedEnemyId===ent.id ? null : ent.id
                  const st = (window as any).game?.getState?.()
                  renderEnemyInfo(st)

                  // Right-click inspect only; left-click inspect + intent step/attack.
                  if(pointer?.rightButtonDown?.()) return

                  const p = st?.entities?.find((x:any)=>x.id==='p')?.pos
                  if(!p || !ent.pos) return
                  const dx = ent.pos.x - p.x
                  const dy = ent.pos.y - p.y
                  const sx = Math.sign(dx)
                  const sy = Math.sign(dy)
                  let dir:any = null
                  if(sx===0 && sy===-1) dir='up'
                  else if(sx===0 && sy===1) dir='down'
                  else if(sx===-1 && sy===0) dir='left'
                  else if(sx===1 && sy===0) dir='right'
                  else if(sx===-1 && sy===-1) dir='up-left'
                  else if(sx===1 && sy===-1) dir='up-right'
                  else if(sx===-1 && sy===1) dir='down-left'
                  else if(sx===1 && sy===1) dir='down-right'
                  if(dir) (window as any).game?.step?.({type:'move', dir})
                })
              }
              if(ent.type==='item'){
                s.setInteractive({cursor:'pointer'})
                s.on('pointerdown', ()=>{
                  const st = (window as any).game?.getState?.()
                  const p = st?.entities?.find((x:any)=>x.id==='p')?.pos
                  if(!p || !ent.pos) return
                  const dx = ent.pos.x - p.x
                  const dy = ent.pos.y - p.y
                  const md = Math.abs(dx)+Math.abs(dy)
                  if(md<=1){
                    ;(window as any).game?.step?.({type:'interact'})
                    return
                  }
                  const sx = Math.sign(dx)
                  const sy = Math.sign(dy)
                  let dir:any = null
                  if(sx===0 && sy===-1) dir='up'
                  else if(sx===0 && sy===1) dir='down'
                  else if(sx===-1 && sy===0) dir='left'
                  else if(sx===1 && sy===0) dir='right'
                  else if(sx===-1 && sy===-1) dir='up-left'
                  else if(sx===1 && sy===-1) dir='up-right'
                  else if(sx===-1 && sy===1) dir='down-left'
                  else if(sx===1 && sy===1) dir='down-right'
                  if(dir) (window as any).game?.step?.({type:'move', dir})
                })
              }
              displays[ent.id] = s
              if(ent.id==='p') playerPos = ent.pos
            })

            fogGraphics = sc.add.graphics().setDepth(500)
            targetingGraphics = sc.add.graphics().setDepth(700)
            // player halo removed per UX request
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
                const st = (window as any).game?.getState?.()
                const ent = st?.entities?.find((x:any)=>x.id===id)
                const nextDepth = ent ? entityDepth(ent) : d.depth
                sc.tweens.add({targets:d,x:p.x,y:p.y,depth:nextDepth,duration:100,ease:'Quad.Out'})
              }
              if(id==='p'){ playerPos = to; paintFog() }
              applyVision()
            } else if(e.type==='die'){
              const id = e.payload.id
              if(selectedEnemyId===id) selectedEnemyId = null
              if(hoveredEnemyId===id) hoveredEnemyId = null
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
              if(attacker && target){
                const from = {x: Math.floor(attacker.x/tileSize), y: Math.floor(attacker.y/tileSize)}
                const to = {x: Math.floor(target.x/tileSize), y: Math.floor(target.y/tileSize)}
                if(e.payload?.via==='spit') fxLine(from, to, 0x7dff9a)
                if(e.payload?.via==='zap') fxLine(from, to, 0x86b7ff)
                if(e.payload?.via==='lunge') fxLine(from, to, 0xffb07a)
              }
              if(e.payload.target==='p') flashDamage()
            } else if(e.type==='boss_charge'){
              const boss = displays[e.payload?.id]
              if(boss){
                boss.setTint(0xff3333)
                sc.tweens.add({targets:boss, scale:1.25, duration:120, yoyo:true, repeat:1, onComplete:()=>boss.setTint(0xff8a66)})
                const ring = sc.add.circle(boss.x, boss.y, tileSize*0.45, 0xff6a6a, 0.14).setDepth(372)
                ring.setStrokeStyle(2, 0xff9a9a, 0.82)
                sc.tweens.add({targets:ring, scale:2.1, alpha:0, duration:320, onComplete:()=>{ try{ ring.destroy() }catch{} }})
              }
            } else if(e.type==='boss_slam'){
              try{ sc.cameras.main.shake(140, 0.005) }catch{}
              const boss = displays[e.payload?.id]
              if(boss){
                const impact = sc.add.circle(boss.x, boss.y, tileSize*0.35, 0xffb07a, 0.22).setDepth(371)
                impact.setStrokeStyle(2, 0xffd2a1, 0.9)
                sc.tweens.add({targets:impact, scale:2.8, alpha:0, duration:260, onComplete:()=>{ try{ impact.destroy() }catch{} }})
              }
            } else if(e.type==='spit_used'){
              const attacker = displays[e.payload?.id]
              if(attacker) sc.tweens.add({targets:attacker, scale:1.12, duration:70, yoyo:true})
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
              if(st) pruneMissingEntityDisplays(st)
              if(p) fxBurstAt(p, 0x88ffcc)
            } else if(e.type==='essence_pickup' || e.type==='spirit_core_pickup' || e.type==='shop_purchase'){
              const st = (window as any).game?.getState?.()
              if(st) pruneMissingEntityDisplays(st)
            } else if(e.type==='stairs_spawned'){
              const st = (window as any).game?.getState?.()
              const s = st?.entities?.find((x:any)=>x.type==='item' && x.kind==='stairs')
              if(s){
                const d = displays[s.id]
                if(d){ sc.tweens.add({targets:d,alpha:0.35,duration:240,yoyo:true,repeat:3}) }
              }
            } else if(e.type==='floor'){
              // Keep floor transitions deterministic: rebuild once from fresh state.
              const st = (window as any).game?.getState?.()
              if(st) rebuildMapAndEntities(st)
            }
          }

          unsub = eventBus.subscribe(handler)
          eventBus.getLines().forEach(l=>{ try{ handler(JSON.parse(l)) }catch(_){ } })

          // Simple deterministic bootstrap: render directly from live state once.
          // Keeps startup robust without watchdog complexity.
          try{
            const st = (window as any).game?.getState?.()
            if(st) rebuildMapAndEntities(st)
          }catch(err){
            console.error('[GameMount] state bootstrap rebuild failed', err)
          }

          const visionPoll = setInterval(applyVision, 140)
          const oldUnsub = unsub
          unsub = ()=>{ clearInterval(visionPoll); oldUnsub() }
        }catch(err){ console.error('renderer setup failed',err) }
      }

      let sceneReady = false
      const waitForScene = (tries=0)=>{
        if(cancelled || sceneReady) return
        const s = g.scene.scenes[0]
        if(s && s.add && s.sys){
          sceneReady = true
          setupScene(s)
          return
        }
        if(tries===40) console.warn('[GameMount] scene bootstrap still pending after 4s; continuing retries')
        if(tries===100) console.warn('[GameMount] scene bootstrap still pending after 10s; continuing retries')
        setTimeout(()=>waitForScene(tries+1), 100)
      }
      waitForScene()

      return ()=>{ cancelled = true; try{ unsub() }catch{}; g.destroy(true) }
    }
  },[])
  return <div ref={ref} id="phaser-root"></div>
}
