import React, {useEffect, useMemo, useState} from 'react'
import AdminPage from './admin/AdminPage'
import GameMount from './GameMount'
import type {PlayerClass, PlayerRace} from '../game/types'
import './app.css'

import swordIcon from './assets/icons/sword.svg'
import shieldIcon from './assets/icons/shield.svg'
import treasureIcon from './assets/icons/treasure.svg'
import bootsIcon from './assets/icons/boots.svg'

type Gear = {name:string,itemClass:string,rarity:string,atkBonus:number,defBonus:number,hpBonus:number,enchantments:string[]}
type Snapshot = {
  tick:number
  floor:number
  floorModifier?: string
  nextFloorModifier?: string
  playerClass: PlayerClass
  playerRace: PlayerRace
  score:number
  killStreak:number
  attackBonus:number
  defenseBonus:number
  maxHp:number
  inventory?: Gear[]
  dashCooldown:number
  backstepCooldown:number
  guardCooldown:number
  bossCharging:number
  gameOver:boolean
  outcome?:'victory'|'defeat'
  walls?: Array<{x:number,y:number}>
  visible?: Array<{x:number,y:number}>
  entities: Array<{id:string,type:string,kind?:string,hp?:number,pos?:{x:number,y:number}}>
}

type Screen = 'menu'|'create'|'game'
type Race = PlayerRace
type Dir = 'up'|'down'|'left'|'right'
type TargetSkill = 'dash'|'backstep'|'bash'

const I = ({src}:{src:string}) => <img className='dq-icon' src={src} alt='' />

const CLASS_INFO: Record<PlayerClass,{name:string,skills:string,bonus:string}> = {
  knight: {name:'Knight', skills:'Guard, Bash', bonus:'Defensive control, steady brawler'},
  rogue: {name:'Rogue', skills:'Dash, dash-refresh on kill', bonus:'High mobility, burst tempo'}
}

const RACE_INFO: Record<PlayerRace,{name:string,bonus:string}> = {
  human: {name:'Human', bonus:'+1 ATK, +1 DEF (balanced)'},
  elf: {name:'Elf', bonus:'Dash cooldown reduced (mobile) but -1 max HP'},
  dwarf: {name:'Dwarf', bonus:'+2 max HP, +1 DEF (tanky)'}
}

function buildPreview(klass: PlayerClass, race: PlayerRace){
  let hp = 12, atk = 0, def = 0
  let dashCd = 3
  if(race==='human'){ atk += 1; def += 1 }
  if(race==='elf'){ hp = 11; dashCd = 2 }
  if(race==='dwarf'){ hp = 14; def += 1 }
  const skills = klass==='rogue' ? 'Dash + Backstep' : 'Guard + Bash'
  return {hp, atk, def, dashCd, skills}
}

function getParams(){ return new URLSearchParams(window.location.search) }
function getScreen(): Screen {
  const s = getParams().get('screen')
  if(s==='create' || s==='game') return s
  return 'menu'
}
function getClassFromUrl(): PlayerClass {
  return getParams().get('class')==='rogue' ? 'rogue' : 'knight'
}
function getRaceFromUrl(): Race {
  const r = getParams().get('race')
  if(r==='elf' || r==='dwarf') return r
  return 'human'
}
function navigate(patch: Record<string,string|number|undefined>){
  const u = new URL(window.location.href)
  Object.entries(patch).forEach(([k,v])=>{ if(v===undefined) u.searchParams.delete(k); else u.searchParams.set(k, String(v)) })
  window.location.href = u.toString()
}

function getDailySeed(){
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()+1
  const day = d.getUTCDate()
  return y*10000 + m*100 + day
}

function getDailyPreset(){
  const seed = getDailySeed()
  const classes: PlayerClass[] = ['knight','rogue']
  const races: PlayerRace[] = ['human','elf','dwarf']
  return {
    seed,
    klass: classes[seed % classes.length] || 'knight',
    race: races[seed % races.length] || 'human'
  }
}

export default function App(){
  const adminView = getParams().get('view')==='admin'
  const [snapshot,setSnapshot] = useState<Snapshot | null>(null)
  const [status,setStatus] = useState('Explore, loot, survive.')
  const [seed,setSeed] = useState<number | null>(null)
  const [klass,setKlass] = useState<PlayerClass>(getClassFromUrl())
  const [race,setRace] = useState<Race>(getRaceFromUrl())
  const [screen,setScreen] = useState<Screen>(getScreen())
  const [targetSkill,setTargetSkill] = useState<TargetSkill | null>(null)
  const [targetDir,setTargetDir] = useState<Dir>('up')
  const [showHelp,setShowHelp] = useState(false)
  const [showPatchNotes,setShowPatchNotes] = useState(false)
  const [showRunPrimer,setShowRunPrimer] = useState(false)
  const [showLegend,setShowLegend] = useState(false)
  const [showMeta,setShowMeta] = useState(false)
  const [customSeed,setCustomSeed] = useState(()=> (getParams().get('seed') || '').replace(/[^0-9]/g,''))
  const [bestScore,setBestScore] = useState<number>(0)
  const [bestFloor,setBestFloor] = useState<number>(0)
  const [lastRun,setLastRun] = useState<{score:number,floor:number,seed:string,klass:PlayerClass,race:PlayerRace}|null>(null)
  const [newRecord,setNewRecord] = useState<string | null>(null)

  useEffect(()=>{
    try{
      setBestScore(Number(localStorage.getItem('dq_best_score') || '0'))
      setBestFloor(Number(localStorage.getItem('dq_best_floor') || '0'))
      const raw = localStorage.getItem('dq_last_run')
      if(raw) setLastRun(JSON.parse(raw))
    }catch{}
    const poll = setInterval(()=>{
      const g = (window as any).game
      if(g?.getState){
        const s = g.getState()
        setSnapshot(s)
        if(g.getSeed) setSeed(g.getSeed())
        if(g.getClass) setKlass(g.getClass())
        if(g.getRace) setRace(g.getRace())
      }
      setScreen(getScreen())
    }, 120)
    const g = (window as any).game
    const unsub = g?.subscribe?.((e:any)=>{
      if(e.type==='pickup' && e.payload?.kind==='gear') setStatus(`Equipped: ${e.payload?.gear?.name || 'gear'}`)
      if(e.type==='stairs_spawned') setStatus('Stairs found.')
      if(e.type==='floor_brief') setStatus(`Floor ${e.payload?.floor}: ${e.payload?.monsters ?? '?'} monsters, ${e.payload?.items ?? '?'} items (${e.payload?.modifier ?? 'none'}).`)
      if(e.type==='stairs_blocked_boss') setStatus('Stairs sealed: defeat the boss first.')
      if(e.type==='clear_reward') setStatus('Floor cleared: reward chest spawned.')
      if(e.type==='boss_spawned') setStatus('A boss lurks on this floor.')
      if(e.type==='vault_spawned') setStatus('Vault chest detected on this boss floor.')
      if(e.type==='boss_charge') setStatus('Boss is charging a slam!')
      if(e.type==='boss_slam') setStatus(`Boss slam hits for ${e.payload?.damage ?? '?'}!`)
      if(e.type==='spit_used') setStatus(`Spitter spits for ${e.payload?.damage ?? 0}.`)
      if(e.type==='boss_loot') setStatus(`Boss dropped ${e.payload?.drop === 'blink-shard' ? 'a Blink Shard' : 'a Bomb'}!`)
      if(e.type==='floor_brief' && e.payload?.floor===1) setStatus(`Run start: seed ${seed ?? '-'} · class ${klass} · race ${race}.`)
      if(e.type==='boss_defeated_unlock') setStatus('Boss defeated: stairs unsealed.')
      if(e.type==='chest_opened') setStatus(`Chest opened: spawned ${e.payload?.drop}.`)
      if(e.type==='shrine_boon') setStatus(`Shrine grants ${e.payload?.boon}.`)
      if(e.type==='relic_boon') setStatus(`Relic resonates with ${e.payload?.boon}.`)
      if(e.type==='fountain_used') setStatus('Fountain restores full HP and refreshes skill cooldowns.')
      if(e.type==='rift_used') setStatus(`Rift Orb pulled ${e.payload?.pulled ?? 0} enemies close.`)
      if(e.type==='streak_bonus') setStatus(`Kill streak x${e.payload?.streak}: +${e.payload?.bonus} bonus score.`)
      if(e.type==='streak_reward') setStatus(`Streak reward! Spawned ${e.payload?.reward}.`)
      if(e.type==='bomb_blast') setStatus(`Bomb detonated: ${e.payload?.hits ?? 0} hit(s).`)
      if(e.type==='blink_used') setStatus('Blink shard warps you to safer ground.')
      if(e.type==='victory') setStatus('Victory! You conquered the dungeon run.')
      if(e.type==='defeat') setStatus('Defeat.')
    })
    return ()=>{ clearInterval(poll); if(typeof unsub==='function') unsub() }
  },[])

  useEffect(()=>{
    if(screen!=='game') return
    const onKey = (ev:KeyboardEvent)=>{
      const g = (window as any).game
      if(!g?.step) return

      const dirFromKey = (key:string): Dir | null => {
        if(key==='ArrowUp' || key==='w' || key==='W') return 'up'
        if(key==='ArrowDown' || key==='s' || key==='S') return 'down'
        if(key==='ArrowLeft' || key==='a' || key==='A') return 'left'
        if(key==='ArrowRight' || key==='d' || key==='D') return 'right'
        return null
      }

      const dir = dirFromKey(ev.key)
      if(targetSkill && dir){ setTargetDir(dir); return }
      if(targetSkill && (ev.key==='Enter' || ev.key==='f' || ev.key==='F')){
        g.step({type:targetSkill, dir:targetDir})
        setTargetSkill(null)
        return
      }

      if(dir && ev.shiftKey){ g.step({type:'dash',dir}); return }
      if(dir){ g.step({type:'move',dir}); return }
      if(ev.key==='g' || ev.key==='G') g.step({type:'guard'})
      if(ev.key==='q' || ev.key==='Q') castOrArm('backstep')
      if(ev.key==='b' || ev.key==='B') castOrArm('bash')
      if(ev.key==='e' || ev.key==='E') g.step({type:'interact'})
      if(ev.key===' ') g.step({type:'wait'})
      if(ev.key==='r' || ev.key==='R') newSeed()
      if(ev.key==='t' || ev.key==='T') sameSeed()
      if(ev.key==='c' || ev.key==='C') copySeed()
      if(ev.key==='v' || ev.key==='V') copyRunLink()
      if(ev.key==='m' || ev.key==='M') backToMenu()
      if(ev.key==='Escape'){
        setTargetSkill(null)
        setShowHelp(false)
      }
      if(ev.key==='/' || ev.key==='?' || ev.key==='h' || ev.key==='H') setShowHelp(v=>!v)
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[screen,targetSkill,targetDir])

  useEffect(()=>{
    if(screen!=='menu') return
    const onMenuKey = (ev:KeyboardEvent)=>{
      if(ev.key==='Enter') navigate({screen:'create'})
      if(ev.key==='a' || ev.key==='A') navigate({screen:'game', class:['knight','rogue'][Math.floor(Math.random()*2)] || 'knight', race:['human','elf','dwarf'][Math.floor(Math.random()*3)] || 'human', seed:Math.floor(Math.random()*1_000_000)+1})
      if(ev.key==='p' || ev.key==='P') setShowRunPrimer(true)
      if(ev.key==='n' || ev.key==='N') setShowPatchNotes(true)
      if(ev.key==='l' || ev.key==='L') setShowLegend(true)
      if(ev.key==='o' || ev.key==='O') setShowMeta(true)
      if(ev.key==='r' || ev.key==='R') setShowRunPrimer(true)
      if((ev.key==='y' || ev.key==='Y') && lastRun) navigate({screen:'game', class:lastRun.klass, race:lastRun.race, seed:lastRun.seed})
      if(ev.key==='d' || ev.key==='D') navigate({screen:'game', class:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})
      if(ev.key==='Escape'){
        setShowRunPrimer(false)
        setShowPatchNotes(false)
        setShowLegend(false)
        setShowMeta(false)
      }
    }
    window.addEventListener('keydown', onMenuKey)
    return ()=> window.removeEventListener('keydown', onMenuKey)
  },[screen,lastRun])

  useEffect(()=>{
    if(screen!=='create') return
    const onCreateKey = (ev:KeyboardEvent)=>{
      if(ev.key==='1') setKlass('knight')
      if(ev.key==='2') setKlass('rogue')
      if(ev.key==='q' || ev.key==='Q') setRace('human')
      if(ev.key==='w' || ev.key==='W') setRace('elf')
      if(ev.key==='e' || ev.key==='E') setRace('dwarf')
      if(ev.key==='s' || ev.key==='S'){
        const classes: PlayerClass[] = ['knight','rogue']
        const races: PlayerRace[] = ['human','elf','dwarf']
        setKlass(classes[Math.floor(Math.random()*classes.length)] || 'knight')
        setRace(races[Math.floor(Math.random()*races.length)] || 'human')
      }
      if(ev.key==='x' || ev.key==='X') setCustomSeed(String(Math.floor(Math.random()*1_000_000)+1))
      if(ev.key==='c' || ev.key==='C') setCustomSeed('')
      if(ev.key==='a' || ev.key==='A'){
        const classes: PlayerClass[] = ['knight','rogue']
        const races: PlayerRace[] = ['human','elf','dwarf']
        const c = classes[Math.floor(Math.random()*classes.length)] || 'knight'
        const r = races[Math.floor(Math.random()*races.length)] || 'human'
        navigate({screen:'game', class:c, race:r, seed:Math.floor(Math.random()*1_000_000)+1})
      }
      if(ev.key==='Enter'){
        const chosenSeed = Number(customSeed)
        navigate({screen:'game', class:klass, race, seed:Number.isFinite(chosenSeed) && chosenSeed>0 ? chosenSeed : Math.floor(Math.random()*1_000_000)+1})
      }
      if(ev.key==='Escape') navigate({screen:'menu'})
    }
    window.addEventListener('keydown', onCreateKey)
    return ()=> window.removeEventListener('keydown', onCreateKey)
  },[screen,klass,race,customSeed])

  useEffect(()=>{
    if(!snapshot?.gameOver) return
    const score = snapshot.score ?? 0
    const floor = snapshot.floor ?? 0
    let recordMsg: string[] = []
    if(score > bestScore){
      setBestScore(score)
      recordMsg.push('Best Score')
      try{ localStorage.setItem('dq_best_score', String(score)) }catch{}
    }
    if(floor > bestFloor){
      setBestFloor(floor)
      recordMsg.push('Best Floor')
      try{ localStorage.setItem('dq_best_floor', String(floor)) }catch{}
    }
    setNewRecord(recordMsg.length ? `New record: ${recordMsg.join(' + ')}` : null)

    const lr = {score, floor, seed:String(seed ?? '-'), klass, race}
    setLastRun(lr)
    try{ localStorage.setItem('dq_last_run', JSON.stringify(lr)) }catch{}
  },[snapshot?.gameOver, snapshot?.score, snapshot?.floor, bestScore, bestFloor, seed, klass, race])

  useEffect(()=>{
    if(snapshot?.gameOver) return
    if(newRecord) setNewRecord(null)
  },[snapshot?.gameOver, newRecord])

  const playerHp = useMemo(()=> snapshot?.entities.find(e=>e.id==='p')?.hp ?? '-', [snapshot])
  const monstersLeft = useMemo(()=> snapshot?.entities.filter(e=>e.type==='monster').length ?? '-', [snapshot])
  const danger = useMemo(()=>{
    if(!snapshot) return 0
    const p = snapshot.entities.find(e=>e.id==='p')?.pos
    if(!p) return 0
    const vis = new Set((snapshot.visible||[]).map(v=>`${v.x},${v.y}`))
    return snapshot.entities.filter(e=>e.type==='monster' && e.pos).reduce((acc,e)=>{
      const d = Math.abs((e.pos?.x||0)-p.x)+Math.abs((e.pos?.y||0)-p.y)
      const inVis = vis.has(`${e.pos?.x},${e.pos?.y}`)
      if(d<=1) return acc+3
      if(inVis && d<=3) return acc+2
      if(inVis) return acc+1
      return acc
    },0)
  },[snapshot])

  const dangerLabel = danger >= 9 ? 'CRITICAL' : danger >= 6 ? 'HIGH' : danger >= 3 ? 'MED' : 'LOW'
  const dailyPreset = getDailyPreset()
  const dangerColor = danger >= 9 ? '#ff5f5f' : danger >= 6 ? '#ff9c7a' : danger >= 3 ? '#ffd27a' : '#8fd8a8'
  const streakToReward = Math.max(0, 4 - (snapshot?.killStreak ?? 0))
  const pace = snapshot ? ((snapshot.floor || 1) / Math.max(1, snapshot.tick || 1)) * 100 : 0
  const paceLabel = pace >= 3 ? 'FAST' : pace >= 1.8 ? 'STEADY' : 'SLOW'
  const paceColor = paceLabel==='FAST' ? '#9dffb8' : paceLabel==='STEADY' ? '#ffd27a' : '#ff9c7a'
  const isBossFloor = ((snapshot?.floor ?? 1) >= 3) && ((snapshot?.floor ?? 1) % 3 === 0)
  const nextIsBossFloor = (((snapshot?.floor ?? 1) + 1) >= 3) && (((snapshot?.floor ?? 1) + 1) % 3 === 0)
  const bossCount = (snapshot?.entities || []).filter(e=>e.type==='monster' && e.kind==='boss').length
  const bossAlive = bossCount > 0
  const objectiveText = snapshot
    ? (snapshot.floor >= 10
      ? 'Use stairs to complete the run.'
      : (isBossFloor && bossAlive
        ? 'Defeat the boss to unseal stairs.'
        : 'Clear threats, collect power, and push to floor 10.'))
    : 'Initialize run...'

  const visibleThreats = useMemo(()=>{
    if(!snapshot) return {total:0,boss:0,spitter:0,sentinel:0,other:0}
    const vis = new Set((snapshot.visible||[]).map(v=>`${v.x},${v.y}`))
    const mons = snapshot.entities.filter(e=>e.type==='monster' && e.pos && vis.has(`${e.pos.x},${e.pos.y}`))
    const boss = mons.filter(m=>m.kind==='boss').length
    const spitter = mons.filter(m=>m.kind==='spitter').length
    const sentinel = mons.filter(m=>m.kind==='sentinel').length
    const other = Math.max(0, mons.length - boss - spitter - sentinel)
    return {total:mons.length,boss,spitter,sentinel,other}
  },[snapshot])

  const nearby = useMemo(()=>{
    if(!snapshot) return {items:0,monsters:0}
    const p = snapshot.entities.find(e=>e.id==='p')?.pos
    if(!p) return {items:0,monsters:0}
    const dist = (x:number,y:number)=>Math.abs(x-p.x)+Math.abs(y-p.y)
    const items = snapshot.entities.filter(e=>e.type==='item' && e.pos && dist(e.pos.x,e.pos.y)<=1).length
    const monsters = snapshot.entities.filter(e=>e.type==='monster' && e.pos && dist(e.pos.x,e.pos.y)<=1).length
    return {items,monsters}
  },[snapshot])

  const move = (dir:Dir)=> (window as any).game?.step?.({type:'move',dir})

  const computeTargetTiles = (skill:TargetSkill, selectedDir:Dir)=>{
    const p = snapshot?.entities.find(e=>e.id==='p')?.pos
    if(!snapshot || !p) return [] as Array<{x:number,y:number,kind:string,selected?:boolean}>
    const dirs: Record<Dir,{x:number,y:number}> = {up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}
    const walls = new Set((snapshot.walls||[]).map(w=>`${w.x},${w.y}`))
    const occupied = new Set((snapshot.entities||[]).filter(e=>e.id!=='p').map(e=>`${e.pos?.x},${e.pos?.y}`))
    const monsterAt = new Set((snapshot.entities||[]).filter(e=>e.type==='monster').map(e=>`${e.pos?.x},${e.pos?.y}`))

    return (Object.entries(dirs) as Array<[Dir,{x:number,y:number}]>).flatMap(([dir,delta])=>{
      if(skill==='dash'){
        const a = {x:p.x+delta.x,y:p.y+delta.y}
        const b = {x:p.x+delta.x*2,y:p.y+delta.y*2}
        const kindA = walls.has(`${a.x},${a.y}`) ? 'blocked' : (monsterAt.has(`${a.x},${a.y}`) ? 'enemy' : (occupied.has(`${a.x},${a.y}`) ? 'blocked' : 'valid'))
        const kindB = walls.has(`${b.x},${b.y}`) ? 'blocked' : (monsterAt.has(`${b.x},${b.y}`) ? 'enemy' : (occupied.has(`${b.x},${b.y}`) ? 'blocked' : 'valid'))
        return [{...a,kind:kindA,selected:dir===selectedDir},{...b,kind:kindB,selected:false}]
      }
      if(skill==='backstep'){
        const t = {x:p.x-delta.x,y:p.y-delta.y}
        const kind = walls.has(`${t.x},${t.y}`) || occupied.has(`${t.x},${t.y}`) ? 'blocked' : 'valid'
        return [{...t,kind,selected:dir===selectedDir}]
      }
      const t = {x:p.x+delta.x,y:p.y+delta.y}
      const kind = monsterAt.has(`${t.x},${t.y}`) ? 'enemy' : 'blocked'
      return [{...t,kind,selected:dir===selectedDir}]
    })
  }

  useEffect(()=>{
    ;(window as any).gameTargeting = targetSkill ? {active:true, skill:targetSkill, dir:targetDir, tiles:computeTargetTiles(targetSkill,targetDir)} : {active:false}
  },[targetSkill,targetDir,snapshot])

  const castOrArm = (skill:TargetSkill)=>{
    const g = (window as any).game
    if(!g?.step) return
    if(targetSkill===skill){
      g.step({type:skill, dir:targetDir})
      setTargetSkill(null)
      setStatus(`${skill} used.`)
      return
    }
    setTargetSkill(skill)
    setTargetDir('up')
    setStatus(`${skill.toUpperCase()} targeting: choose direction, press again to confirm.`)
  }

  const dash = ()=> castOrArm('dash')
  const backstep = ()=> castOrArm('backstep')
  const bash = ()=> castOrArm('bash')
  const guard = ()=> (window as any).game?.step?.({type:'guard'})
  const wait = ()=> (window as any).game?.step?.({type:'wait'})
  const sameSeed = ()=> (window as any).game?.resetSameSeed?.()
  const newSeed = ()=> (window as any).game?.resetNewSeed?.()
  const backToMenu = ()=> navigate({screen:'menu'})
  const resetRecords = ()=>{
    setBestScore(0)
    setBestFloor(0)
    try{ localStorage.removeItem('dq_best_score'); localStorage.removeItem('dq_best_floor') }catch{}
    setStatus('Records reset.')
  }
  const copySeed = async ()=>{
    if(seed==null) return
    try{ await navigator.clipboard.writeText(String(seed)); setStatus(`Seed ${seed} copied.`) }catch{}
  }
  const copyRunLink = async ()=>{
    if(seed==null) return
    const u = new URL(window.location.href)
    u.searchParams.set('screen','game')
    u.searchParams.set('seed', String(seed))
    u.searchParams.set('class', klass)
    u.searchParams.set('race', race)
    try{ await navigator.clipboard.writeText(u.toString()); setStatus('Run link copied.') }catch{}
  }
  const copyLastRunLink = async ()=>{
    if(!lastRun) return
    const u = new URL(window.location.href)
    u.searchParams.set('screen','game')
    u.searchParams.set('seed', String(lastRun.seed))
    u.searchParams.set('class', lastRun.klass)
    u.searchParams.set('race', lastRun.race)
    try{ await navigator.clipboard.writeText(u.toString()); setStatus('Last run link copied.') }catch{}
  }
  const setClass = (c:PlayerClass)=> navigate({class:c})

  if(adminView) return <AdminPage />

  if(screen==='menu'){
    return (
      <div className='dq-menu'>
        <div className='dq-menu-card'>
          <h1>Dungeon Quest</h1>
          <p>A tactical dungeon crawler roguelike.</p>
          <p style={{fontSize:12,opacity:0.8}}>Run goal: clear floor 10 to win.</p>
          <div style={{fontSize:11,opacity:0.75, margin:'6px 0 10px'}}>
            Latest: boss charge/slam telegraphs, spitter/sentinel enemies, shrine/fountain/rift orb items.
          </div>
          {lastRun && <div style={{fontSize:11,opacity:0.8, marginBottom:8}}>Last run: floor {lastRun.floor}, score {lastRun.score}, {lastRun.klass}/{lastRun.race}</div>}
          <div style={{fontSize:11,opacity:0.7, marginBottom:4}}>Hotkeys: Enter Play · A Quick Start · Y Resume Last · D Daily Challenge · P/R Primer · N Notes · L Legend · O Records</div>
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,opacity:0.65, marginBottom:8,flexWrap:'wrap'}}>
            <span>Daily seed: {dailyPreset.seed} ({dailyPreset.klass}/{dailyPreset.race})</span>
            <button style={{fontSize:10}} onClick={async()=>{ try{ await navigator.clipboard.writeText(String(dailyPreset.seed)); setStatus('Daily seed copied.') }catch{} }}>Copy Seed</button>
            <button style={{fontSize:10}} onClick={async()=>{
              const u = new URL(window.location.href)
              u.searchParams.set('screen','game')
              u.searchParams.set('seed', String(dailyPreset.seed))
              u.searchParams.set('class',dailyPreset.klass)
              u.searchParams.set('race',dailyPreset.race)
              try{ await navigator.clipboard.writeText(u.toString()); setStatus('Daily challenge link copied.') }catch{}
            }}>Copy Link</button>
          </div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button onClick={()=>navigate({screen:'create'})}>Play</button>
            <button onClick={()=>navigate({screen:'game', class:['knight','rogue'][Math.floor(Math.random()*2)] || 'knight', race:['human','elf','dwarf'][Math.floor(Math.random()*3)] || 'human', seed:Math.floor(Math.random()*1_000_000)+1})}>Quick Start</button>
            {lastRun && <button onClick={()=>navigate({screen:'game', class:lastRun.klass, race:lastRun.race, seed:lastRun.seed})}>Resume Last Run Seed</button>}
            <button onClick={()=>navigate({screen:'game', class:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})}>Daily Challenge</button>
            <button onClick={()=>setShowPatchNotes(true)}>Patch Notes</button>
            <button onClick={()=>setShowRunPrimer(true)}>Run Primer</button>
            <button onClick={()=>setShowLegend(true)}>Legend</button>
            <button onClick={()=>setShowMeta(true)}>Records</button>
          </div>
        </div>

        {showPatchNotes && (
          <div className='dq-overlay'>
            <div className='box'>
              <h2 style={{marginTop:0}}>Patch Notes (Recent)</h2>
              <ul style={{marginTop:0,paddingLeft:18}}>
                <li>Main menu → character creation flow</li>
                <li>Class/race setup with race bonuses</li>
                <li>Skill targeting + confirm mode</li>
                <li>Bosses with charge/slam telegraphs + rewards</li>
                <li>New enemies: Spitter, Sentinel</li>
                <li>New items: Bomb, Blink Shard, Chest, Shrine, Fountain, Rift Orb</li>
                <li>Run goal: clear floor 10 to win</li>
              </ul>
              <button onClick={()=>setShowPatchNotes(false)}>Close</button>
            </div>
          </div>
        )}

        {showRunPrimer && (
          <div className='dq-overlay'>
            <div className='box'>
              <h2 style={{marginTop:0}}>Run Primer</h2>
              <ul style={{marginTop:0,paddingLeft:18}}>
                <li>Early floors: farm safe streaks and gear.</li>
                <li>Boss floors (every 3): stairs sealed until boss dies.</li>
                <li>Use danger/threat HUD before committing to melee.</li>
                <li>Save mobility items (Blink/Rift) for spike turns.</li>
                <li>Target floor 10 clear, not endless score greed.</li>
              </ul>
              <button onClick={()=>setShowRunPrimer(false)}>Close</button>
            </div>
          </div>
        )}

        {showLegend && (
          <div className='dq-overlay'>
            <div className='box'>
              <h2 style={{marginTop:0}}>Legend</h2>
              <ul style={{marginTop:0,paddingLeft:18}}>
                <li>Orange brute/boss hues: heavy melee pressure.</li>
                <li>Green enemies: ranged spitters.</li>
                <li>Purple objects: shrine / rift-orb utility.</li>
                <li>Cyan object: fountain reset node.</li>
                <li>Gold object: chest/vault reward source.</li>
              </ul>
              <button onClick={()=>setShowLegend(false)}>Close</button>
            </div>
          </div>
        )}

        {showMeta && (
          <div className='dq-overlay'>
            <div className='box'>
              <h2 style={{marginTop:0}}>Records</h2>
              <p>Best Score: <b>{bestScore}</b></p>
              <p>Best Floor: <b>{bestFloor}</b></p>
              <p>Daily Seed: <b>{dailyPreset.seed}</b> ({dailyPreset.klass}/{dailyPreset.race})</p>
              {lastRun && <p style={{fontSize:12,opacity:0.9}}>Last Run: score {lastRun.score}, floor {lastRun.floor}, {lastRun.klass}/{lastRun.race}, seed {lastRun.seed}</p>}
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <button onClick={async()=>{ try{ await navigator.clipboard.writeText(String(dailyPreset.seed)); setStatus('Daily seed copied.') }catch{} }}>Copy Daily Seed</button>
                <button onClick={async()=>{
                  const u = new URL(window.location.href)
                  u.searchParams.set('screen','game')
                  u.searchParams.set('seed', String(dailyPreset.seed))
                  u.searchParams.set('class',dailyPreset.klass)
                  u.searchParams.set('race',dailyPreset.race)
                  try{ await navigator.clipboard.writeText(u.toString()); setStatus('Daily challenge link copied.') }catch{}
                }}>Copy Daily Link</button>
                {lastRun && <button onClick={copyLastRunLink}>Copy Last Run Link</button>}
                <button onClick={resetRecords}>Reset</button>
                <button onClick={()=>setShowMeta(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if(screen==='create'){
    const preview = buildPreview(klass, race)
    return (
      <div className='dq-menu'>
        <div className='dq-menu-card'>
          <h2>Character Creation</h2>
          <p>Pick class and race.</p>
          <p style={{fontSize:12,opacity:0.8}}>Objective: survive and clear floor 10.</p>
          <p style={{fontSize:11,opacity:0.7}}>Hotkeys: 1 Knight · 2 Rogue · Q/W/E race · S surprise · X random seed · C clear seed · A quickstart · Enter start · Esc back</p>

          <div style={{marginBottom:8,fontWeight:700}}>Class</div>
          <div style={{display:'grid',gap:8,marginBottom:10}}>
            {(Object.keys(CLASS_INFO) as PlayerClass[]).map(c=>(
              <button key={c} onClick={()=>setKlass(c)} style={{textAlign:'left',outline: klass===c ? '2px solid #7c9cff' : 'none'}}>
                <div><strong>{CLASS_INFO[c].name}</strong></div>
                <div style={{fontSize:12,opacity:0.9}}>Skills: {CLASS_INFO[c].skills}</div>
                <div style={{fontSize:12,opacity:0.75}}>{CLASS_INFO[c].bonus}</div>
              </button>
            ))}
          </div>

          <div style={{margin:'10px 0 8px',fontWeight:700}}>Race</div>
          <div style={{display:'grid',gap:8}}>
            {(Object.keys(RACE_INFO) as PlayerRace[]).map(r=>(
              <button key={r} onClick={()=>setRace(r)} style={{textAlign:'left',outline: race===r ? '2px solid #7c9cff' : 'none'}}>
                <div><strong>{RACE_INFO[r].name}</strong></div>
                <div style={{fontSize:12,opacity:0.75}}>{RACE_INFO[r].bonus}</div>
              </button>
            ))}
          </div>

          <div style={{marginTop:12,padding:10,border:'1px solid #33456f',borderRadius:10,background:'#111a31'}}>
            <div style={{fontWeight:700,marginBottom:6}}>Build Preview</div>
            <div style={{fontSize:12}}>HP: <b>{preview.hp}</b> · ATK: <b>{preview.atk}</b> · DEF: <b>{preview.def}</b></div>
            <div style={{fontSize:12}}>Dash CD: <b>{preview.dashCd}</b> · Skills: <b>{preview.skills}</b></div>
          </div>

          <div style={{marginTop:10}}>
            <div style={{fontSize:12,marginBottom:4}}>Seed (optional)</div>
            <div style={{display:'flex',gap:8}}>
              <input value={customSeed} onChange={e=>setCustomSeed(e.target.value.replace(/[^0-9]/g,''))} placeholder='Random if empty' style={{width:'100%',padding:'8px',borderRadius:8,border:'1px solid #33456f',background:'#0d1429',color:'#d9e6ff'}} />
              <button onClick={()=>setCustomSeed(String(Math.floor(Math.random()*1_000_000)+1))}>Random</button>
              <button onClick={()=>setCustomSeed('')}>Clear</button>
            </div>
          </div>

          <div style={{display:'flex', gap:8, marginTop:14, flexWrap:'wrap'}}>
            <button onClick={()=>navigate({screen:'menu'})}>Back</button>
            <button onClick={()=>{
              const classes: PlayerClass[] = ['knight','rogue']
              const races: PlayerRace[] = ['human','elf','dwarf']
              const c = classes[Math.floor(Math.random()*classes.length)] || 'knight'
              const r = races[Math.floor(Math.random()*races.length)] || 'human'
              setKlass(c)
              setRace(r)
            }}>Surprise Me</button>
            <button onClick={()=>{
              const classes: PlayerClass[] = ['knight','rogue']
              const races: PlayerRace[] = ['human','elf','dwarf']
              const c = classes[Math.floor(Math.random()*classes.length)] || 'knight'
              const r = races[Math.floor(Math.random()*races.length)] || 'human'
              navigate({screen:'game', class:c, race:r, seed:Math.floor(Math.random()*1_000_000)+1})
            }}>Quick Start</button>
            <button onClick={()=>{
              const chosenSeed = Number(customSeed)
              navigate({screen:'game', class:klass, race, seed:Number.isFinite(chosenSeed) && chosenSeed>0 ? chosenSeed : Math.floor(Math.random()*1_000_000)+1})
            }}>Start Adventure</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='dq-shell'>
      <div className='dq-arena'>
        <div className='dq-center'>
          <div className='dq-center-head'>WASD/Arrows move · Shift+Dir dash · G guard · Q backstep · B bash · E interact · Space wait · R new run · T retry seed · C copy seed · V copy link · M menu · ?/H help</div>
          <div className='dq-canvas-wrap'><GameMount /></div>
        </div>

        <aside className='dq-side'>
          <h1 className='dq-title'>Dungeon Quest</h1>
          <p className='dq-sub'>{status}</p>
          <div style={{fontSize:12,color:'#a9c8ff',marginBottom:6}}>Objective: {objectiveText}</div>

          <div className='dq-stats'>
            <div className='dq-stat'>Class<b>{klass}</b></div>
            <div className='dq-stat'>Race<b>{race}</b></div>
            <div className='dq-stat'>Floor<b>{snapshot?.floor ?? '-'} / 10</b></div>
            <div className='dq-stat'>HP<b>{String(playerHp)} / {snapshot?.maxHp ?? '-'}</b></div>
            <div className='dq-stat'>Monsters<b>{String(monstersLeft)}</b></div>
            <div className='dq-stat'>Score<b>{snapshot?.score ?? '-'}</b></div>
            <div className='dq-stat'>Best<b>{bestScore}</b></div>
            <div className='dq-stat'>Best Floor<b>{bestFloor}</b></div>
            <div className='dq-stat'>Turns<b>{snapshot?.tick ?? '-'}</b></div>
            <div className='dq-stat'>Pace<b style={{color:paceColor}}>{paceLabel}</b></div>
            <div className='dq-stat'>Streak<b>{snapshot?.killStreak ?? 0}</b></div>
            <div className='dq-stat'>Streak Reward<b style={{color: streakToReward===0 ? '#9dffb8' : '#c6d3ff'}}>{streakToReward===0 ? 'READY' : `${streakToReward} to go`}</b></div>
            <div className='dq-stat'>Seed<b>{seed ?? '-'}</b></div>
            <button onClick={copySeed} style={{fontSize:11}}>Copy Seed</button>
            <button onClick={copyRunLink} style={{fontSize:11}}>Copy Run Link</button>
            <div className='dq-stat'>Danger<b style={{color:dangerColor}}>{danger} ({dangerLabel})</b></div>
            <div className='dq-stat'>Boss Charge<b>{snapshot?.bossCharging ?? 0}</b></div>
            <div className='dq-stat'>Boss Floor<b>{isBossFloor ? 'YES' : 'NO'}</b></div>
            <div className='dq-stat'>Bosses<b>{bossCount}</b></div>
            <div className='dq-stat'>Stairs<b>{isBossFloor ? (bossAlive ? 'SEALED' : 'UNSEALED') : 'OPEN'}</b></div>
            <div className='dq-stat'>Nearby<b>{nearby.monsters} enemy · {nearby.items} item</b></div>
            {nearby.items > 0 && <div style={{fontSize:12,color:'#9dffb8'}}>Tip: item in reach — press E to interact.</div>}
            {nearby.monsters > 0 && <div style={{fontSize:12,color:'#ff9c7a'}}>Tip: adjacent threat — consider Guard/Backstep before trading hits.</div>}
          </div>

          <div style={{fontSize:12,color:'#9aa9d4'}}>Mod: {snapshot?.floorModifier ?? 'none'}</div>
          {(snapshot?.floorModifier ?? 'none')==='brute-heavy' && <div style={{fontSize:12,color:'#ffb08b'}}>Elite warning: brute-heavy floor.</div>}
          {(snapshot?.floorModifier ?? 'none')==='scarce-potions' && <div style={{fontSize:12,color:'#ffd27a'}}>Resource warning: scarce potions.</div>}
          {(snapshot?.floorModifier ?? 'none')==='swarm' && <div style={{fontSize:12,color:'#ffcf8b'}}>Swarm warning: high enemy count.</div>}
          <div style={{fontSize:12,color:'#8bc1ff'}}>Next floor: {snapshot?.nextFloorModifier ?? 'unknown'}</div>
          {nextIsBossFloor && <div style={{fontSize:12,color:'#ffb36b'}}>Next floor is a BOSS floor.</div>}
          {isBossFloor && <div style={{fontSize:12,color:'#ff9d6b'}}>Boss floor active: secure vault loot before taking stairs.</div>}
          {(snapshot?.floor ?? 1) >= 9 && <div style={{fontSize:12,color:'#9de7ff'}}>Final approach: one more floor after this to clear the run.</div>}
          <div style={{margin:'4px 0 6px'}}>
            <div style={{fontSize:11,opacity:0.8}}>Run Progress</div>
            <div style={{height:6, background:'#1b2340', border:'1px solid #2f3d66', borderRadius:999}}>
              <div style={{height:'100%', width:`${Math.min(100, ((snapshot?.floor ?? 1)/10)*100)}%`, background:'#6ca2ff', borderRadius:999}} />
            </div>
          </div>
          <div style={{marginTop:4}}>
            <div style={{height:6, background:'#1b2340', border:'1px solid #2f3d66', borderRadius:999}}>
              <div style={{height:'100%', width:`${Math.min(100, (danger/12)*100)}%`, background:dangerColor, borderRadius:999}} />
            </div>
          </div>
          <div style={{fontSize:12,color:'#9bb7e8'}}>
            Visible threats: {visibleThreats.total} (Boss {visibleThreats.boss} · Spitter {visibleThreats.spitter} · Sentinel {visibleThreats.sentinel} · Other {visibleThreats.other})
          </div>
          {danger >= 6 && <div style={{fontSize:12,color:'#ff9c7a'}}>Tip: pressure is high — consider Blink/Backstep/Guard before pushing.</div>}
          {(snapshot?.bossCharging ?? 0) > 0 && <div style={{fontSize:12,color:'#ff7b7b'}}>Warning: boss slam is charging.</div>}
          <div style={{fontSize:12}}><I src={swordIcon}/>ATK+ {snapshot?.attackBonus ?? 0}</div>
          <div style={{fontSize:12}}><I src={shieldIcon}/>DEF+ {snapshot?.defenseBonus ?? 0}</div>
          <div style={{fontSize:12}}><I src={bootsIcon}/>Dash CD: {snapshot?.dashCooldown ?? 0}</div>
          <div style={{fontSize:12}}><I src={bootsIcon}/>Backstep CD: {snapshot?.backstepCooldown ?? 0}</div>
          <div style={{fontSize:12, marginBottom:4}}><I src={shieldIcon}/>Guard CD: {snapshot?.guardCooldown ?? 0}</div>

          <div className='dq-class'>
            <button onClick={()=>setClass('knight')}>Knight</button>
            <button onClick={()=>setClass('rogue')}>Rogue</button>
          </div>

          <div className='dq-controls'>
            <button onClick={()=> targetSkill ? setTargetDir('up') : move('up')}>↑</button><button onClick={()=> targetSkill ? setTargetDir('left') : move('left')}>←</button>
            <button onClick={()=> targetSkill ? setTargetDir('down') : move('down')}>↓</button><button onClick={()=> targetSkill ? setTargetDir('right') : move('right')}>→</button>
            <button onClick={wait}>Wait</button><button onClick={()=>(window as any).game?.step?.({type:'interact'})}>Interact (E)</button><button onClick={newSeed}>New Run</button>
          </div>

          <div className='dq-skillrow'>
            {klass==='rogue' && <button onClick={dash}><I src={bootsIcon}/>{targetSkill==='dash' ? `Confirm Dash (${targetDir})` : 'Dash'}</button>}
            {klass==='rogue' && <button onClick={backstep}><I src={bootsIcon}/>{targetSkill==='backstep' ? `Confirm Backstep (${targetDir})` : 'Backstep (Q)'}</button>}
            {klass==='knight' && <button onClick={guard}><I src={shieldIcon}/>Guard</button>}
            {klass==='knight' && <button onClick={bash}><I src={swordIcon}/>{targetSkill==='bash' ? `Confirm Bash (${targetDir})` : 'Bash (B)'}</button>}
            {targetSkill && <button onClick={()=>setTargetSkill(null)}>Cancel Targeting</button>}
          </div>

          <h3 style={{margin:'8px 0 0'}}><I src={treasureIcon}/>Equipment</h3>
          <div className='dq-equip-list'>
            {(snapshot?.inventory || []).length===0 && <div style={{opacity:0.7}}>No gear equipped yet.</div>}
            {(snapshot?.inventory || []).map((it,idx)=>(
              <div className='dq-item' key={idx}>
                <div className='name'>{it.name}</div>
                <div className='meta'>{it.itemClass} · {it.rarity}</div>
                <div>ATK+{it.atkBonus} DEF+{it.defBonus} HP+{it.hpBonus}</div>
                {it.enchantments?.length>0 && <div className='meta'>✦ {it.enchantments.join(', ')}</div>}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {showHelp && (
        <div className='dq-overlay'>
          <div className='box'>
            <h2 style={{marginTop:0}}>Controls & Goal</h2>
            <p>Goal: clear floor 10.</p>
            <p>Move: WASD/Arrows</p>
            <p>Dash: Shift + direction</p>
            <p>Rogue: Q backstep</p>
            <p>Knight: B bash, G guard</p>
            <p>Interact: E · Wait: Space · New run: R · Retry seed: T · Copy seed: C · Copy link: V · Main menu: M</p>
            <p>Tips: Danger meter tracks nearby threat, boss charge warning means slam incoming.</p>
            <p>Run target: Floor 10. Use chests/shrines/fountains/rift orbs to spike power.</p>
            <div style={{display:'flex', gap:8}}><button onClick={()=>setShowHelp(false)}>Close</button></div>
          </div>
        </div>
      )}

      {snapshot?.gameOver && (
        <div className='dq-overlay'>
          <div className='box'>
            <h2 style={{marginTop:0}}>{snapshot.outcome==='defeat' ? 'Run Over' : 'Run Complete'}</h2>
            <p>Class: <b>{klass}</b></p><p>Race: <b>{race}</b></p><p>Floor: <b>{snapshot.floor}</b></p><p>Score: <b>{snapshot.score}</b></p><p>Seed: <b>{seed ?? '-'}</b></p><p>Efficiency: <b>{snapshot.tick>0 ? (snapshot.score/Math.max(1,snapshot.tick)).toFixed(1) : '0.0'} score/turn</b></p>
            {newRecord && <p style={{color:'#9dffb8'}}>{newRecord}</p>}
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <button onClick={copySeed}>Copy seed</button>
              <button onClick={copyRunLink}>Copy run link</button>
              <button onClick={sameSeed}>Restart same seed</button>
              <button onClick={newSeed}>New seed</button>
              <button onClick={backToMenu}>Main menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
