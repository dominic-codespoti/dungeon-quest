import React, {useEffect, useMemo, useState} from 'react'
import AdminPage from './admin/AdminPage'
import GameMount from './GameMount'
import type {Dir, PlayerClass, PlayerRace} from '../game/types'
import './app.css'

import swordIcon from './assets/icons/sword.svg'
import shieldIcon from './assets/icons/shield.svg'
import treasureIcon from './assets/icons/treasure.svg'
import bootsIcon from './assets/icons/boots.svg'

type Gear = {name:string,itemClass:string,rarity:string,atkBonus:number,defBonus:number,hpBonus:number,enchantments:string[],equipped?:boolean}

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
// Dir imported from game/types
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
function getFloatNumbersFromUrl(){
  return getParams().get('float') !== '0'
}
function getHighContrastFromUrl(){
  return getParams().get('contrast') === '1'
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

function randomSeed(){
  return Math.floor(Math.random()*1_000_000)+1
}

function randomClassRace(){
  const classes: PlayerClass[] = ['knight','rogue']
  const races: PlayerRace[] = ['human','elf','dwarf']
  return {
    klass: classes[Math.floor(Math.random()*classes.length)] || 'knight',
    race: races[Math.floor(Math.random()*races.length)] || 'human'
  }
}

function resolveChosenSeed(seedInput:string){
  const chosenSeed = Number(seedInput)
  return Number.isFinite(chosenSeed) && chosenSeed>0 ? chosenSeed : randomSeed()
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

function getDailyResetEta(){
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()+1, 0, 0, 0))
  const ms = Math.max(0, next.getTime() - now.getTime())
  const h = Math.floor(ms / (1000*60*60))
  const m = Math.floor((ms % (1000*60*60)) / (1000*60))
  return `${h}h ${m}m`
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
  const [showAdvancedHud,setShowAdvancedHud] = useState(false)
  const [showInventoryPanel,setShowInventoryPanel] = useState(false)
  const [showThreatIntel,setShowThreatIntel] = useState(false)
  const [showRendererFallback,setShowRendererFallback] = useState(false)

  const closeMenuModals = ()=>{
    setShowPatchNotes(false)
    setShowRunPrimer(false)
    setShowLegend(false)
    setShowMeta(false)
  }
  const toggleMenuModal = (name:'patch'|'primer'|'legend'|'meta')=>{
    const current = name==='patch' ? showPatchNotes : name==='primer' ? showRunPrimer : name==='legend' ? showLegend : showMeta
    closeMenuModals()
    if(!current){
      if(name==='patch') setShowPatchNotes(true)
      if(name==='primer') setShowRunPrimer(true)
      if(name==='legend') setShowLegend(true)
      if(name==='meta') setShowMeta(true)
    }
  }
  const [confirmReset,setConfirmReset] = useState(false)
  const [customSeed,setCustomSeed] = useState(()=> (getParams().get('seed') || '').replace(/[^0-9]/g,''))
  const [bestScore,setBestScore] = useState<number>(0)
  const [bestFloor,setBestFloor] = useState<number>(0)
  const [lastRun,setLastRun] = useState<{score:number,floor:number,seed:string,klass:PlayerClass,race:PlayerRace,efficiency?:number}|null>(null)
  const [newRecord,setNewRecord] = useState<string | null>(null)
  const floatingNumbers = getFloatNumbersFromUrl()
  const highContrast = getHighContrastFromUrl()

  useEffect(()=>{
    try{
      const bs = Number(localStorage.getItem('dq_best_score') || '0')
      const bf = Number(localStorage.getItem('dq_best_floor') || '0')
      setBestScore(Number.isFinite(bs) && bs >= 0 ? bs : 0)
      setBestFloor(Number.isFinite(bf) && bf >= 0 ? bf : 0)
      const raw = localStorage.getItem('dq_last_run')
      if(raw){
        const parsed = JSON.parse(raw)
        if(parsed && typeof parsed==='object'){
          setLastRun({
            score: Number(parsed.score || 0),
            floor: Number(parsed.floor || 0),
            seed: String(parsed.seed || '-'),
            klass: (parsed.klass==='rogue' ? 'rogue' : 'knight') as PlayerClass,
            race: (parsed.race==='elf' || parsed.race==='dwarf' ? parsed.race : 'human') as PlayerRace,
            efficiency: Number(parsed.efficiency || 0)
          })
        }
      }
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
      if(e.type==='gear_equipped') setStatus(`Equipped: ${e.payload?.name || 'item'}.`)
      if(e.type==='gear_replaced') setStatus(`Swapped out ${e.payload?.removed?.name || 'gear'}.`)
      if(e.type==='gear_autoequip') setStatus('Auto-equipped best weapon/armor.')
      if(e.type==='gear_unequipped') setStatus(`Unequipped: ${e.payload?.name || 'item'}.`)
      if(e.type==='gear_unequipped_all') setStatus(`Unequipped all gear (${e.payload?.count || 0}).`)
      if(e.type==='inventory_sorted') setStatus('Inventory sorted: equipped → slot → rarity.')
      if(e.type==='stairs_spawned'){
        const nextFloor = e.payload?.nextFloor
        const nextMod = e.payload?.nextModifier || 'none'
        const nextBoss = e.payload?.nextBoss ? 'boss' : 'no boss'
        setStatus(`Stairs found. Next: floor ${nextFloor ?? '?'}, ${nextMod}, ${nextBoss}.`)
      }
      if(e.type==='floor_brief'){
        const mod = String(e.payload?.modifier || 'none')
        const modLabel = mod==='ambush' ? 'ambush' : mod==='brute-heavy' ? 'brute-heavy' : mod==='scarce-potions' ? 'scarce-potions' : mod==='swarm' ? 'swarm' : 'none'
        setStatus(`Floor ${e.payload?.floor}: ${e.payload?.monsters ?? '?'} monsters (${e.payload?.ranged ?? '?'} ranged, ${e.payload?.elites ?? '?'} elites), ${e.payload?.items ?? '?'} items (${modLabel}).`)
      }
      if(e.type==='modifier_hint' && e.payload?.text) setStatus(String(e.payload.text))
      if(e.type==='stairs_blocked_boss') setStatus('Stairs sealed: defeat the boss first.')
      if(e.type==='clear_reward') setStatus(
        e.payload?.reward==='chest+potion'
          ? 'Floor cleared: reward chest + recovery potion spawned.'
          : e.payload?.reward==='chest+gear'
          ? 'Floor cleared: reward chest + bonus gear spawned.'
          : e.payload?.reward==='chest+elixir'
          ? 'Floor cleared: reward chest + elixir spawned.'
          : e.payload?.reward==='chest+bomb'
          ? 'Floor cleared: reward chest + bomb spawned.'
          : 'Floor cleared: reward chest spawned.'
      )
      if(e.type==='boss_spawned') setStatus('A boss lurks on this floor.')
      if(e.type==='vault_spawned') setStatus('Vault chest detected on this boss floor.')
      if(e.type==='boss_charge') setStatus('Boss is charging a slam — keep distance or guard.')
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
      if(e.type==='class_scaling' && (e.payload?.attack || e.payload?.defense || e.payload?.dash || e.payload?.backstep)) setStatus(`${e.payload?.playerClass} scaling: +${e.payload?.attack||0} ATK, +${e.payload?.defense||0} DEF`)
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
        if(key==='Home' || key==='7') return 'up-left'
        if(key==='PageUp' || key==='9') return 'up-right'
        if(key==='End' || key==='1') return 'down-left'
        if(key==='PageDown' || key==='3') return 'down-right'
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
      if(ev.key==='e' || ev.key==='E') g.step({type:'interact'})
      if(ev.key===' ') g.step({type:'wait'})
      if(ev.key==='r' || ev.key==='R') newSeed()
      if(ev.key==='t' || ev.key==='T') sameSeed()
      if(ev.key==='c' || ev.key==='C') copySeed()
      if(ev.key==='v' || ev.key==='V') copyRunLink()
      if(ev.key==='x' || ev.key==='X') (window as any).game?.autoEquipBest?.()
      if(ev.key==='z' || ev.key==='Z') (window as any).game?.sortInventory?.()
      if(ev.key==='u' || ev.key==='U') (window as any).game?.unequipAll?.()
      if(ev.key==='p' || ev.key==='P') openCreateForCurrent()
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
      if(ev.key==='a' || ev.key==='A'){
        const rr = randomClassRace()
        launchGamePreset({klass:rr.klass, race:rr.race, seed:randomSeed()})
      }
      if(ev.key==='p' || ev.key==='P') toggleMenuModal('primer')
      if(ev.key==='h' || ev.key==='H') toggleMenuModal('primer')
      if(ev.key==='?' || ev.key==='/') toggleMenuModal('primer')
      if(ev.key==='n' || ev.key==='N') toggleMenuModal('patch')
      if(ev.key==='l' || ev.key==='L') toggleMenuModal('legend')
      if(ev.key==='o' || ev.key==='O') toggleMenuModal('meta')
      if(ev.key==='r' || ev.key==='R') toggleMenuModal('primer')
      if((ev.key==='y' || ev.key==='Y') && lastRun) launchGamePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})
      if((ev.key==='g' || ev.key==='G') && lastRun) openCreatePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})
      if((ev.key==='u' || ev.key==='U') && lastRun) copyLastRunSeed()
      if(ev.key==='z' || ev.key==='Z') openCreatePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})
      if(ev.key==='d' || ev.key==='D') launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})
      if(ev.key==='i' || ev.key==='I') copyBundleLinks()
      if(ev.key==='j' || ev.key==='J') copyDailyLink()
      if(ev.key==='k' || ev.key==='K') copyProfileSummary()
      if(ev.key==='v' || ev.key==='V') copyDailyPreset()
      if(ev.key==='f' || ev.key==='F') toggleFloatingNumbers()
      if(ev.key==='Escape') closeMenuModals()
    }
    window.addEventListener('keydown', onMenuKey)
    return ()=> window.removeEventListener('keydown', onMenuKey)
  },[screen,lastRun,floatingNumbers])

  useEffect(()=>{
    if(screen!=='create') return
    const onCreateKey = (ev:KeyboardEvent)=>{
      if(ev.key==='1') setKlass('knight')
      if(ev.key==='2') setKlass('rogue')
      if(ev.key==='q' || ev.key==='Q') setRace('human')
      if(ev.key==='w' || ev.key==='W') setRace('elf')
      if(ev.key==='e' || ev.key==='E') setRace('dwarf')
      if(ev.key==='s' || ev.key==='S'){
        applyRandomClassRaceToCreate(false)
        setStatus('Surprise class/race applied.')
      }
      if(ev.key==='r' || ev.key==='R'){
        applyRandomClassRaceToCreate(true)
        setStatus('Rerolled class, race, and seed.')
      }
      if(ev.key==='z' || ev.key==='Z') applyDailyPresetToCreate()
      if((ev.key==='y' || ev.key==='Y') && lastRun) applyLastRunPresetToCreate()
      if((ev.key==='l' || ev.key==='L') && lastRun) launchGamePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})
      if(ev.key==='d' || ev.key==='D') launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})
      if(ev.key==='x' || ev.key==='X') setCustomSeed(String(randomSeed()))
      if(ev.key==='c' || ev.key==='C') setCustomSeed('')
      if(ev.key==='a' || ev.key==='A'){
        const rr = randomClassRace()
        launchGamePreset({klass:rr.klass, race:rr.race, seed:randomSeed()})
      }
      if(ev.key==='j' || ev.key==='J') copyCreateLaunchLink()
      if(ev.key==='Enter') launchGamePreset({klass, race, seed:resolveChosenSeed(customSeed)})
      if(ev.key==='Escape' || ev.key==='b' || ev.key==='B') navigate({screen:'menu'})
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

    const lr = {score, floor, seed:String(seed ?? '-'), klass, race, efficiency: (snapshot.tick>0 ? Number((score/Math.max(1,snapshot.tick)).toFixed(2)) : 0)}
    setLastRun(lr)
    try{ localStorage.setItem('dq_last_run', JSON.stringify(lr)) }catch{}

  },[snapshot?.gameOver, snapshot?.score, snapshot?.floor, bestScore, bestFloor, seed, klass, race])

  useEffect(()=>{
    if(snapshot?.gameOver) return
    if(newRecord) setNewRecord(null)
  },[snapshot?.gameOver, newRecord])

  useEffect(()=>{
    if(snapshot){
      setShowRendererFallback(false)
      return
    }
    const t = window.setTimeout(()=>setShowRendererFallback(true), 1600)
    return ()=> window.clearTimeout(t)
  },[snapshot])

  const playerHp = useMemo(()=> snapshot?.entities.find(e=>e.id==='p')?.hp ?? '-', [snapshot])
  const monstersLeft = useMemo(()=>{
    if(!snapshot) return '-'
    const vis = new Set((snapshot.visible||[]).map(v=>`${v.x},${v.y}`))
    return snapshot.entities.filter(e=>e.type==='monster' && e.pos && vis.has(`${e.pos.x},${e.pos.y}`)).length
  }, [snapshot])
  const rangedVisible = useMemo(()=>{
    if(!snapshot) return '-'
    const vis = new Set((snapshot.visible||[]).map(v=>`${v.x},${v.y}`))
    return snapshot.entities.filter(e=>e.type==='monster' && (e.kind==='spitter' || e.kind==='sentinel') && e.pos && vis.has(`${e.pos.x},${e.pos.y}`)).length
  }, [snapshot])
  const elitesVisible = useMemo(()=>{
    if(!snapshot) return '-'
    const vis = new Set((snapshot.visible||[]).map(v=>`${v.x},${v.y}`))
    return snapshot.entities.filter(e=>e.type==='monster' && (e.kind==='brute' || e.kind==='sentinel' || e.kind==='boss') && e.pos && vis.has(`${e.pos.x},${e.pos.y}`)).length
  }, [snapshot])
  const rangedInRange = useMemo(()=>{
    if(!snapshot) return '-'
    const p = snapshot.entities.find(e=>e.id==='p')?.pos
    if(!p) return '-'
    const vis = new Set((snapshot.visible||[]).map(v=>`${v.x},${v.y}`))
    return snapshot.entities.filter(e=>{
      if(e.type!=='monster' || !e.pos || !vis.has(`${e.pos.x},${e.pos.y}`)) return false
      const d = Math.abs(e.pos.x-p.x)+Math.abs(e.pos.y-p.y)
      if(e.kind==='spitter') return d<=5 && d>1
      if(e.kind==='sentinel') return d<=2 && d>1
      return false
    }).length
  }, [snapshot])
  const visibleBossHp = useMemo(()=>{
    if(!snapshot) return '-'
    const vis = new Set((snapshot.visible||[]).map(v=>`${v.x},${v.y}`))
    const boss = snapshot.entities.find(e=>e.type==='monster' && e.kind==='boss' && e.pos && vis.has(`${e.pos.x},${e.pos.y}`))
    return boss?.hp != null ? String(boss.hp) : '-'
  }, [snapshot])
  const danger = useMemo(()=>{
    if(!snapshot) return 0
    const p = snapshot.entities.find(e=>e.id==='p')?.pos
    if(!p) return 0
    const vis = new Set((snapshot.visible||[]).map(v=>`${v.x},${v.y}`))
    return snapshot.entities.filter(e=>e.type==='monster' && e.pos).reduce((acc,e)=>{
      const d = Math.abs((e.pos?.x||0)-p.x)+Math.abs((e.pos?.y||0)-p.y)
      const inVis = vis.has(`${e.pos?.x},${e.pos?.y}`)
      if(!inVis) return acc

      let next = acc
      if(d<=1) next += 3
      else if(d<=3) next += 2
      else next += 1

      const kind = String(e.kind || '')
      const rangedInRange = (kind==='spitter' && d>1 && d<=5) || (kind==='sentinel' && d>1 && d<=2)
      if(rangedInRange) next += 2
      if(kind==='boss' && d<=3) next += 2
      return next
    },0)
  },[snapshot])

  const dangerLabel = danger >= 9 ? 'CRITICAL' : danger >= 6 ? 'HIGH' : danger >= 3 ? 'MED' : 'LOW'
  const scoreMult = (snapshot?.floorModifier==='ambush' ? 1.2 : snapshot?.floorModifier==='brute-heavy' ? 1.1 : 1).toFixed(1)
  const clearRewardPreview = snapshot?.floorModifier==='ambush'
    ? 'chest+potion'
    : snapshot?.floorModifier==='brute-heavy'
    ? 'chest+gear'
    : snapshot?.floorModifier==='scarce-potions'
    ? 'chest+elixir'
    : snapshot?.floorModifier==='swarm'
    ? 'chest+bomb'
    : 'chest'
  const equippedByClass = useMemo(()=>{
    const m: Record<string,Gear|undefined> = {}
    for(const it of (snapshot?.inventory || [])) if(it.equipped) m[it.itemClass] = it
    return m
  }, [snapshot?.inventory])
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
    ? (isBossFloor && bossAlive
      ? 'Defeat the boss to unseal stairs.'
      : 'Clear threats, collect power, and keep descending.')
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
    const dirs: Record<Dir,{x:number,y:number}> = {
      up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0},
      'up-left':{x:-1,y:-1},'up-right':{x:1,y:-1},'down-left':{x:-1,y:1},'down-right':{x:1,y:1}
    }
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
  const toggleFloatingNumbers = ()=> navigate({float: floatingNumbers ? 0 : 1})
  const toggleHighContrast = ()=> navigate({contrast: highContrast ? 0 : 1})
  const retryRenderer = ()=> window.location.reload()
  const resetRecords = ()=>{
    setBestScore(0)
    setBestFloor(0)
    setLastRun(null)
    try{
      localStorage.removeItem('dq_best_score')
      localStorage.removeItem('dq_best_floor')
      localStorage.removeItem('dq_last_run')
    }catch{}
    setStatus('Records reset.')
    setConfirmReset(false)
  }
  const clearLastRun = ()=>{
    setLastRun(null)
    try{ localStorage.removeItem('dq_last_run') }catch{}
    setStatus('Last run cleared.')
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
  const copyCreateLaunchLink = async ()=>{
    const u = new URL(window.location.href)
    u.searchParams.set('screen','game')
    u.searchParams.set('seed', String(resolveChosenSeed(customSeed)))
    u.searchParams.set('class', klass)
    u.searchParams.set('race', race)
    try{ await navigator.clipboard.writeText(u.toString()); setStatus('Create launch link copied.') }catch{}
  }
  const openCreateForCurrent = ()=>{
    navigate({screen:'create', class:klass, race, seed:seed ?? undefined})
  }
  const openCreatePreset = (preset:{klass:PlayerClass,race:PlayerRace,seed:number|string})=>{
    navigate({screen:'create', class:preset.klass, race:preset.race, seed:preset.seed})
  }
  const launchGamePreset = (preset:{klass:PlayerClass,race:PlayerRace,seed:number|string})=>{
    navigate({screen:'game', class:preset.klass, race:preset.race, seed:preset.seed})
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
  const copyLastRunSeed = async ()=>{
    if(!lastRun) return
    try{ await navigator.clipboard.writeText(String(lastRun.seed)); setStatus('Last run seed copied.') }catch{}
  }
  const copyProfileSummary = async ()=>{
    const parts = [
      `best_score=${bestScore}`,
      `best_floor=${bestFloor}`,
      `daily=${dailyPreset.seed}:${dailyPreset.klass}/${dailyPreset.race}`,
      lastRun ? `last=${lastRun.score}@${lastRun.floor}:${lastRun.klass}/${lastRun.race}:${lastRun.seed}` : 'last=none'
    ]
    try{ await navigator.clipboard.writeText(parts.join(' ')); setStatus('Profile summary copied.') }catch{}
  }
  const copyDailyPreset = async ()=>{
    try{ await navigator.clipboard.writeText(`${dailyPreset.seed} ${dailyPreset.klass}/${dailyPreset.race}`); setStatus('Daily preset copied.') }catch{}
  }
  const applyPresetToCreate = (preset:{klass:PlayerClass,race:PlayerRace,seed:number|string}, label:'Daily'|'Last-run')=>{
    setKlass(preset.klass)
    setRace(preset.race)
    setCustomSeed(String(preset.seed))
    setStatus(`${label} preset loaded into creation.`)
  }
  const applyDailyPresetToCreate = ()=>{
    applyPresetToCreate({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed}, 'Daily')
  }
  const applyLastRunPresetToCreate = ()=>{
    if(!lastRun) return
    applyPresetToCreate({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed}, 'Last-run')
  }
  const applyRandomClassRaceToCreate = (withSeed=false)=>{
    const rr = randomClassRace()
    setKlass(rr.klass)
    setRace(rr.race)
    if(withSeed) setCustomSeed(String(randomSeed()))
  }
  const copyDailyLink = async ()=>{
    const u = new URL(window.location.href)
    u.searchParams.set('screen','game')
    u.searchParams.set('seed', String(dailyPreset.seed))
    u.searchParams.set('class',dailyPreset.klass)
    u.searchParams.set('race',dailyPreset.race)
    try{ await navigator.clipboard.writeText(u.toString()); setStatus('Daily challenge link copied.') }catch{}
  }
  const copyBundleLinks = async ()=>{
    const u = new URL(window.location.href)
    const links: string[] = []

    const daily = new URL(u.toString())
    daily.searchParams.set('screen','game')
    daily.searchParams.set('seed', String(dailyPreset.seed))
    daily.searchParams.set('class',dailyPreset.klass)
    daily.searchParams.set('race',dailyPreset.race)
    links.push(`daily=${daily.toString()}`)

    if(lastRun){
      const last = new URL(u.toString())
      last.searchParams.set('screen','game')
      last.searchParams.set('seed', String(lastRun.seed))
      last.searchParams.set('class', lastRun.klass)
      last.searchParams.set('race', lastRun.race)
      links.push(`last=${last.toString()}`)
    }

    try{ await navigator.clipboard.writeText(links.join('\n')); setStatus('Link bundle copied.') }catch{}
  }
  const setClass = (c:PlayerClass)=> navigate({class:c})

  if(adminView) return <AdminPage />

  if(screen==='menu'){
    return (
      <div className='dq-menu'>
        <div className='dq-menu-card'>
          <h1>Dungeon Quest</h1>
          <p>A tactical dungeon crawler roguelike.</p>
          <p style={{fontSize:12,opacity:0.8}}>Run goal: descend as deep as possible.</p>
          <div style={{fontSize:11,opacity:0.75, margin:'6px 0 10px'}}>
            Latest: boss charge/slam telegraphs, spitter/sentinel enemies, shrine/fountain/rift orb items.
          </div>
          {lastRun && <div style={{fontSize:11,opacity:0.8, marginBottom:8}}>Last run: floor {lastRun.floor}, score {lastRun.score}, {lastRun.klass}/{lastRun.race}</div>}
          <div style={{fontSize:11,opacity:0.7, marginBottom:4}}>Hotkeys: Enter Play · A Quick Start · Y Resume Last · G Open Last Build · U Copy Last Seed · Z Daily Build · D Daily Challenge · V Copy Daily Preset · I Copy Links · J Copy Daily Link · K Copy Profile · F Toggle Damage Numbers · P/R/H/? Primer · N Notes · L Legend · O Records</div>
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,opacity:0.65, marginBottom:8,flexWrap:'wrap'}}>
            <span>Daily seed: {dailyPreset.seed} ({dailyPreset.klass}/{dailyPreset.race}) · resets in {getDailyResetEta()} (UTC)</span>
            <button style={{fontSize:10}} title='copies seed only' onClick={async()=>{ try{ await navigator.clipboard.writeText(String(dailyPreset.seed)); setStatus('Daily seed copied.') }catch{} }}>Copy Seed</button>
            <button style={{fontSize:10}} title='V · copies seed + class/race' onClick={copyDailyPreset}>Copy Preset</button>
            <button style={{fontSize:10}} title='Z · open daily build in create' onClick={()=>openCreatePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})}>Open Build</button>
            <button style={{fontSize:10}} title='J' onClick={copyDailyLink}>Copy Link</button>
            <button style={{fontSize:10}} title='I' onClick={copyBundleLinks}>Copy Bundle</button>
          </div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button onClick={()=>navigate({screen:'create'})} title='Enter'>Play</button>
            <button onClick={()=>{
              const rr = randomClassRace()
              launchGamePreset({klass:rr.klass, race:rr.race, seed:randomSeed()})
            }} title='A · random class/race/seed'>Quick Start</button>
            {lastRun && <button onClick={()=>launchGamePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})} title='Y · relaunch last snapshot'>Resume Last Run</button>}
            {lastRun && <button onClick={()=>openCreatePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})} title='G · prefill create from last run'>Last Build</button>}
            <button onClick={()=>openCreatePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})} title='Z · prefill create from daily preset'>Daily Build</button>
            <button onClick={()=>launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})} title='D · launch daily challenge now'>Daily Challenge ({dailyPreset.klass}/{dailyPreset.race})</button>
            <button onClick={toggleFloatingNumbers} title='F'>Damage Numbers: {floatingNumbers ? 'On' : 'Off'}</button>
            <button onClick={()=>toggleMenuModal('patch')} title='N'>Patch Notes</button>
            <button onClick={()=>toggleMenuModal('primer')} title='P / R / H / ?'>Run Primer</button>
            <button onClick={()=>toggleMenuModal('legend')} title='L'>Legend</button>
            <button onClick={()=>toggleMenuModal('meta')} title='O'>Records</button>
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
                <li>Run goal: descend deeper and survive escalating threats</li>
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
                <li>Depth and survival over mindless score greed.</li>
                <li>Daily preset today: <b>{dailyPreset.seed}</b> · <b>{dailyPreset.klass}/{dailyPreset.race}</b>.</li>
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
              <p>Daily Seed: <b>{dailyPreset.seed}</b> ({dailyPreset.klass}/{dailyPreset.race}) · resets in {getDailyResetEta()} (UTC)</p>
              <p style={{fontSize:11,opacity:0.7,marginTop:-4}}>Quick keys: {lastRun ? 'Y resume last · G open last build · U copy last seed · ' : ''}Z open daily build · D play daily · V daily preset · J daily link · I link bundle · K profile · Esc close</p>
              {lastRun && <p style={{fontSize:12,opacity:0.9}}>Last Run: score {lastRun.score}, floor {lastRun.floor}, eff {lastRun.efficiency ?? 0}/turn, {lastRun.klass}/{lastRun.race}, seed {lastRun.seed}</p>}
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <button title='best_score + best_floor' onClick={async()=>{ try{ await navigator.clipboard.writeText(`best_score=${bestScore} best_floor=${bestFloor}`); setStatus('Best stats copied.') }catch{} }}>Copy Best Stats</button>
                <button title='Z · prefill create with daily loadout' onClick={()=>openCreatePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})}>Open Daily in Create</button>
                <button title='D · launch daily challenge immediately from records' onClick={()=>launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})}>Play Daily Challenge</button>
                <button title='K' onClick={copyProfileSummary}>Copy Profile Summary</button>
                <button title='structured JSON' onClick={async()=>{ try{ await navigator.clipboard.writeText(JSON.stringify({bestScore,bestFloor,dailyPreset,lastRun}, null, 2)); setStatus('Profile JSON copied.') }catch{} }}>Copy Profile JSON</button>
                <button title='daily seed only' onClick={async()=>{ try{ await navigator.clipboard.writeText(String(dailyPreset.seed)); setStatus('Daily seed copied.') }catch{} }}>Copy Daily Seed</button>
                <button title='V · daily seed + class/race' onClick={copyDailyPreset}>Copy Daily Preset</button>
                <button title='J' onClick={copyDailyLink}>Copy Daily Link</button>
                <button title='I' onClick={copyBundleLinks}>Copy Link Bundle</button>
                {lastRun && <button title='Y' onClick={()=>launchGamePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})}>Resume Last Run</button>}
                {lastRun && <button title='G · prefill create with last-run loadout' onClick={()=>openCreatePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})}>Open Last in Create</button>}
                {lastRun && <button title='U' onClick={copyLastRunSeed}>Copy Last Run Seed</button>}
                {lastRun && <button title='copy last-run launch URL' onClick={copyLastRunLink}>Copy Last Run Link</button>}
                {lastRun && <button title='remove stored last-run snapshot' onClick={clearLastRun}>Clear Last Run</button>}
                {!confirmReset && <button title='start reset confirmation' onClick={()=>setConfirmReset(true)}>Reset</button>}
                {confirmReset && <button title='permanently clear best + last-run records' onClick={resetRecords} style={{color:'#ffb3b3'}}>Confirm Reset</button>}
                {confirmReset && <button title='abort reset' onClick={()=>setConfirmReset(false)}>Cancel</button>}
                <button title='Esc' onClick={()=>{ setConfirmReset(false); setShowMeta(false) }}>Close</button>
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
          <p style={{fontSize:12,opacity:0.8}}>Objective: survive and keep descending.</p>
          <p style={{fontSize:11,opacity:0.7}}>Hotkeys: 1 Knight · 2 Rogue · Q/W/E race · S surprise · R reroll build+seed · Z daily preset · Y last-run preset · L start last-run · D start daily · X random seed · C clear seed · A quickstart · J copy launch link · Enter start · B/Esc back</p>

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
            {lastRun && <div style={{fontSize:12,opacity:0.85,marginTop:4}}>Last run loadout: <b>{lastRun.klass}/{lastRun.race}</b> · seed <b>{lastRun.seed}</b></div>}
            <div style={{fontSize:12,opacity:0.85,marginTop:2}}>Daily loadout: <b>{dailyPreset.klass}/{dailyPreset.race}</b> · seed <b>{dailyPreset.seed}</b></div>
          </div>

          <div style={{marginTop:10}}>
            <div style={{fontSize:12,marginBottom:4}}>Seed (optional)</div>
            <div style={{display:'flex',gap:8}}>
              <input value={customSeed} onChange={e=>setCustomSeed(e.target.value.replace(/[^0-9]/g,''))} placeholder='Random if empty' style={{width:'100%',padding:'8px',borderRadius:8,border:'1px solid #33456f',background:'#0d1429',color:'#d9e6ff'}} />
              <button onClick={()=>setCustomSeed(String(randomSeed()))} title='X'>Random</button>
              <button onClick={()=>setCustomSeed('')} title='C'>Clear</button>
            </div>
          </div>

          <div style={{display:'flex', gap:8, marginTop:14, flexWrap:'wrap'}}>
            <button onClick={()=>navigate({screen:'menu'})} title='B / Esc'>Back</button>
            <button onClick={()=>{
              applyRandomClassRaceToCreate(false)
              setStatus('Surprise class/race applied.')
            }} title='S · randomize class/race only'>Surprise Me</button>
            <button onClick={()=>{
              applyRandomClassRaceToCreate(true)
              setStatus('Rerolled class, race, and seed.')
            }} title='R'>Reroll Build+Seed</button>
            <button onClick={applyDailyPresetToCreate} title='Z'>Use Daily Preset</button>
            {lastRun && <button onClick={applyLastRunPresetToCreate} title='Y'>Use Last Run Preset</button>}
            {lastRun && <button onClick={()=>launchGamePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})} title='L · launch last-run preset now'>Start Last Run Preset</button>}
            <button onClick={()=>launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})} title='D · launch daily preset now'>Start Daily Preset</button>
            <button onClick={()=>{
              const rr = randomClassRace()
              launchGamePreset({klass:rr.klass, race:rr.race, seed:randomSeed()})
            }} title='A · random build + seed and launch'>Quick Start</button>
            <button onClick={copyCreateLaunchLink} title='J · copy run link for current create setup'>Copy Launch Link</button>
            <button onClick={()=>launchGamePreset({klass, race, seed:resolveChosenSeed(customSeed)})} title='Enter'>Start Adventure</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='dq-shell'>
      <div className='dq-arena'>
        <div className='dq-center'>
          <div className='dq-center-head'>WASD/Arrows move (+ diagonals: numpad 7/9/1/3) · Shift+Dir dash · Skills from Skills panel · E interact · Space wait · X auto-equip · Z sort inv · U unequip all · R new run · T retry seed · C copy seed · V copy link · P pregame · M menu · ?/H help</div>
          <div className='dq-canvas-wrap'>
            {showRendererFallback && (
              <div style={{position:'absolute', left:16, top:40, zIndex:20, background:'rgba(8,12,20,0.88)', border:'1px solid rgba(124,156,255,0.5)', borderRadius:8, padding:'8px 10px', fontSize:12, color:'#dce8ff'}}>
                Renderer still initializing… <button onClick={retryRenderer} style={{marginLeft:8}}>Retry</button>
              </div>
            )}
            <GameMount />
          </div>
        </div>

        <aside className='dq-side'>
          <div className='dq-stats'>
            <div className='dq-stat'>Floor<b>{snapshot?.floor ?? '-'}</b></div>
            <div className='dq-stat'>HP<b>{String(playerHp)} / {snapshot?.maxHp ?? '-'}</b></div>
            <div className='dq-stat'>Visible Enemies<b>{String(monstersLeft)}</b></div>
            <div className='dq-stat'>Visible Ranged<b>{String(rangedVisible)}</b></div>
            <div className='dq-stat'>Ranged In Range<b>{String(rangedInRange)}</b></div>
            <div className='dq-stat'>Visible Elites<b>{String(elitesVisible)}</b></div>
            <div className='dq-stat'>Boss HP<b>{visibleBossHp}</b></div>
            <div className='dq-stat'>Boss Charge<b>{(snapshot?.bossCharging ?? 0) > 0 ? 'READY' : '—'}</b></div>
            <div className='dq-stat'>Score<b>{snapshot?.score ?? '-'}</b></div>
            <div className='dq-stat'>ATK+<b>{snapshot?.attackBonus ?? 0}</b></div>
            <div className='dq-stat'>DEF+<b>{snapshot?.defenseBonus ?? 0}</b></div>
            <div className='dq-stat'>Mod<b>{snapshot?.floorModifier ?? 'none'}</b></div>
            <div className='dq-stat'>Boss Floor<b>{isBossFloor ? 'Yes' : 'No'}</b></div>
            <div className='dq-stat'>Boss Alive<b>{bossAlive ? 'Yes' : 'No'}</b></div>
            <div className='dq-stat'>Next Mod<b>{snapshot?.nextFloorModifier ?? 'none'}</b></div>
            <div className='dq-stat'>Next Boss<b>{nextIsBossFloor ? 'Yes' : 'No'}</b></div>
            <div className='dq-stat'>Danger<b style={{color:dangerColor}}>{dangerLabel}</b></div>
            <div className='dq-stat'>Pace<b style={{color:paceColor}}>{paceLabel}</b></div>
            <div className='dq-stat'>Streak→Loot<b>{streakToReward}</b></div>
            <div className='dq-stat'>Score x<b>{scoreMult}</b></div>
            <div className='dq-stat'>Clear Reward<b>{clearRewardPreview}</b></div>
          </div>

          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',margin:'10px 0 6px'}}>
            <h3 style={{margin:0}}><I src={bootsIcon}/>Skills</h3>
          </div>
          <div className='dq-skillrow'>
            {klass==='rogue' && <button onClick={dash}><I src={bootsIcon}/>{targetSkill==='dash' ? `Confirm Dash (${targetDir})` : `Dash (${snapshot?.dashCooldown ?? 0})`}</button>}
            {klass==='rogue' && <button onClick={backstep}><I src={bootsIcon}/>{targetSkill==='backstep' ? `Confirm Backstep (${targetDir})` : `Backstep (${snapshot?.backstepCooldown ?? 0})`}</button>}
            {klass==='knight' && <button onClick={guard}><I src={shieldIcon}/>Guard ({snapshot?.guardCooldown ?? 0})</button>}
            {klass==='knight' && <button onClick={bash}><I src={swordIcon}/>{targetSkill==='bash' ? `Confirm Bash (${targetDir})` : 'Bash'}</button>}
            {targetSkill && <button onClick={()=>setTargetSkill(null)}>Cancel</button>}
          </div>

          <div className='dq-controls'>
            <button onClick={()=> targetSkill ? setTargetDir('up-left') : move('up-left')}>↖</button>
            <button onClick={()=> targetSkill ? setTargetDir('up') : move('up')}>↑</button>
            <button onClick={()=> targetSkill ? setTargetDir('up-right') : move('up-right')}>↗</button>
            <button onClick={()=> targetSkill ? setTargetDir('left') : move('left')}>←</button>
            <button onClick={wait}>Wait</button>
            <button onClick={()=> targetSkill ? setTargetDir('right') : move('right')}>→</button>
            <button onClick={()=> targetSkill ? setTargetDir('down-left') : move('down-left')}>↙</button>
            <button onClick={()=> targetSkill ? setTargetDir('down') : move('down')}>↓</button>
            <button onClick={()=> targetSkill ? setTargetDir('down-right') : move('down-right')}>↘</button>
            <button onClick={()=>(window as any).game?.step?.({type:'interact'})}>Interact</button>
            <button onClick={newSeed}>New Run</button>
            <button onClick={openCreateForCurrent}>Pregame</button>
          </div>

          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',margin:'8px 0 0'}}>
            <h3 style={{margin:0}}><I src={treasureIcon}/>Inventory</h3>
            <div style={{display:'flex',gap:6}}>
              <button onClick={()=> (window as any).game?.autoEquipBest?.()} style={{fontSize:11}}>Auto Equip</button>
              <button onClick={()=> (window as any).game?.unequipAll?.()} style={{fontSize:11}}>Unequip All</button>
              <button onClick={()=> (window as any).game?.sortInventory?.()} style={{fontSize:11}}>Sort</button>
              <button onClick={()=>setShowInventoryPanel(v=>!v)} style={{fontSize:11}}>{showInventoryPanel ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          {showInventoryPanel && (
            <div className='dq-equip-list'>
              {(snapshot?.inventory || []).length===0 && <div style={{opacity:0.7}}>No gear collected yet.</div>}
              {(snapshot?.inventory || []).map((it,idx)=>{
                const eq = equippedByClass[it.itemClass]
                const dAtk = (it.atkBonus||0) - (eq?.atkBonus||0)
                const dDef = (it.defBonus||0) - (eq?.defBonus||0)
                const dHp = (it.hpBonus||0) - (eq?.hpBonus||0)
                const deltaLabel = it.equipped
                  ? 'Δ vs equipped: current'
                  : `Δ vs equipped: ATK ${dAtk>=0?'+':''}${dAtk} · DEF ${dDef>=0?'+':''}${dDef} · HP ${dHp>=0?'+':''}${dHp}`
                return (
                <div className='dq-item' key={idx} style={{outline: it.equipped ? '1px solid #7cd2a6' : 'none', background: it.equipped ? 'rgba(124,210,166,0.08)' : undefined}}>
                  <div className='name'>{it.name} {it.equipped ? '• Equipped' : ''}</div>
                  <div className='meta'>{it.itemClass} · {it.rarity}</div>
                  <div>ATK+{it.atkBonus} DEF+{it.defBonus} HP+{it.hpBonus}</div>
                  <div className='meta'>{deltaLabel}</div>
                  {it.enchantments?.length>0 && <div className='meta'>✦ {it.enchantments.join(', ')}</div>}
                  {!it.equipped && <button style={{marginTop:4,fontSize:11}} onClick={()=> (window as any).game?.equipInventoryIndex?.(idx)}>Equip</button>}
                  {it.equipped && <button style={{marginTop:4,fontSize:11}} onClick={()=> (window as any).game?.unequipInventoryIndex?.(idx)}>Unequip</button>}
                </div>
                )
              })}
            </div>
          )}

          <div style={{marginTop:10, display:'flex', gap:8, flexWrap:'wrap'}}>
            <button onClick={()=>setShowAdvancedHud(v=>!v)} style={{fontSize:11}}>{showAdvancedHud ? 'Simple HUD' : 'Advanced HUD'}</button>
            <button onClick={toggleHighContrast} style={{fontSize:11}}>Contrast: {highContrast ? 'High' : 'Normal'}</button>
            <button onClick={copySeed} style={{fontSize:11}}>Copy Seed</button>
            <button onClick={copyRunLink} style={{fontSize:11}}>Copy Run Link</button>
          </div>
        </aside>
      </div>

      {showHelp && (
        <div className='dq-overlay'>
          <div className='box'>
            <h2 style={{marginTop:0}}>Controls & Goal</h2>
            <p>Goal: descend as deep as you can.</p>
            <p>Move: WASD/Arrows (+ diagonal via numpad 7/9/1/3 or on-screen ↖↗↙↘)</p>
            <p>Dash: Shift + direction</p>
            <p>Class skills: use the Skills panel</p>
            <p>Interact: E · Wait: Space · New run: R · Retry seed: T · Copy seed: C · Copy link: V · Pregame: P · Main menu: M</p>
            <p>Tips: Danger meter tracks nearby threat, boss charge warning means slam incoming, and you can click enemies to inspect role/HP details.</p>
            <p>Use chests/shrines/fountains/rift orbs to spike power and keep pushing deeper.</p>
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
