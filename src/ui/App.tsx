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
  floor:number
  floorModifier?: string
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
  gameOver:boolean
  outcome?:'victory'|'defeat'
  walls?: Array<{x:number,y:number}>
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

  useEffect(()=>{
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
      if(e.type==='clear_reward') setStatus('Floor cleared: reward chest spawned.')
      if(e.type==='boss_spawned') setStatus('A boss lurks on this floor.')
      if(e.type==='boss_charge') setStatus('Boss is charging a slam!')
      if(e.type==='boss_slam') setStatus(`Boss slam hits for ${e.payload?.damage ?? '?'}!`)
      if(e.type==='spit_used') setStatus(`Spitter spits for ${e.payload?.damage ?? 0}.`)
      if(e.type==='boss_loot') setStatus(`Boss dropped ${e.payload?.drop === 'blink-shard' ? 'a Blink Shard' : 'a Bomb'}!`)
      if(e.type==='chest_opened') setStatus(`Chest opened: spawned ${e.payload?.drop}.`)
      if(e.type==='shrine_boon') setStatus(`Shrine grants ${e.payload?.boon}.`)
      if(e.type==='fountain_used') setStatus('Fountain restores full HP and refreshes skill cooldowns.')
      if(e.type==='streak_bonus') setStatus(`Kill streak x${e.payload?.streak}: +${e.payload?.bonus} bonus score.`)
      if(e.type==='streak_reward') setStatus(`Streak reward! Spawned ${e.payload?.reward}.`)
      if(e.type==='bomb_blast') setStatus(`Bomb detonated: ${e.payload?.hits ?? 0} hit(s).`)
      if(e.type==='blink_used') setStatus('Blink shard warps you to safer ground.')
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
      if(ev.key==='Escape') setTargetSkill(null)
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[screen,targetSkill,targetDir])

  const playerHp = useMemo(()=> snapshot?.entities.find(e=>e.id==='p')?.hp ?? '-', [snapshot])
  const monstersLeft = useMemo(()=> snapshot?.entities.filter(e=>e.type==='monster').length ?? '-', [snapshot])

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
  const setClass = (c:PlayerClass)=> navigate({class:c})

  if(adminView) return <AdminPage />

  if(screen==='menu'){
    return (
      <div className='dq-menu'>
        <div className='dq-menu-card'>
          <h1>Dungeon Quest</h1>
          <p>A tactical dungeon crawler roguelike.</p>
          <button onClick={()=>navigate({screen:'create'})}>Play</button>
        </div>
      </div>
    )
  }

  if(screen==='create'){
    return (
      <div className='dq-menu'>
        <div className='dq-menu-card'>
          <h2>Character Creation</h2>
          <p>Pick class and race.</p>

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

          <div style={{display:'flex', gap:8, marginTop:14}}>
            <button onClick={()=>navigate({screen:'menu'})}>Back</button>
            <button onClick={()=>navigate({screen:'game', class:klass, race, seed:Math.floor(Math.random()*1_000_000)+1})}>Start Adventure</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='dq-shell'>
      <div className='dq-arena'>
        <div className='dq-center'>
          <div className='dq-center-head'>WASD/Arrows move · Shift+Dir dash · G guard · Q backstep · B bash · E interact · Space wait</div>
          <div className='dq-canvas-wrap'><GameMount /></div>
        </div>

        <aside className='dq-side'>
          <h1 className='dq-title'>Dungeon Quest</h1>
          <p className='dq-sub'>{status}</p>

          <div className='dq-stats'>
            <div className='dq-stat'>Class<b>{klass}</b></div>
            <div className='dq-stat'>Race<b>{race}</b></div>
            <div className='dq-stat'>Floor<b>{snapshot?.floor ?? '-'}</b></div>
            <div className='dq-stat'>HP<b>{String(playerHp)} / {snapshot?.maxHp ?? '-'}</b></div>
            <div className='dq-stat'>Monsters<b>{String(monstersLeft)}</b></div>
            <div className='dq-stat'>Score<b>{snapshot?.score ?? '-'}</b></div>
            <div className='dq-stat'>Streak<b>{snapshot?.killStreak ?? 0}</b></div>
            <div className='dq-stat'>Seed<b>{seed ?? '-'}</b></div>
          </div>

          <div style={{fontSize:12,color:'#9aa9d4'}}>Mod: {snapshot?.floorModifier ?? 'none'}</div>
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

      {snapshot?.gameOver && (
        <div className='dq-overlay'>
          <div className='box'>
            <h2 style={{marginTop:0}}>{snapshot.outcome==='defeat' ? 'Run Over' : 'Run Complete'}</h2>
            <p>Class: <b>{klass}</b></p><p>Race: <b>{race}</b></p><p>Floor: <b>{snapshot.floor}</b></p><p>Score: <b>{snapshot.score}</b></p>
            <div style={{display:'flex', gap:8}}><button onClick={sameSeed}>Restart same seed</button><button onClick={newSeed}>New seed</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
