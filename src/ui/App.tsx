import React, {useEffect, useMemo, useState} from 'react'
import AdminPage from './admin/AdminPage'
import GameMount from './GameMount'
import type {PlayerClass} from '../game/types'
import './app.css'

import swordIcon from './assets/icons/sword.svg'
import shieldIcon from './assets/icons/shield.svg'
import treasureIcon from './assets/icons/treasure.svg'
import bootsIcon from './assets/icons/boots.svg'

type Gear = {name:string,itemClass:string,rarity:string,atkBonus:number,defBonus:number,hpBonus:number,enchantments:string[]}
type Snapshot = {
  floor:number
  floorModifier?: string
  score:number
  attackBonus:number
  defenseBonus:number
  inventory?: Gear[]
  dashCooldown:number
  guardCooldown:number
  gameOver:boolean
  outcome?:'victory'|'defeat'
  entities: Array<{id:string,type:string,hp?:number}>
}

const I = ({src}:{src:string}) => <img className='dq-icon' src={src} alt='' />

export default function App(){
  const adminView = new URLSearchParams(window.location.search).get('view')==='admin'
  const [snapshot,setSnapshot] = useState<Snapshot | null>(null)
  const [status,setStatus] = useState('Explore, loot, survive.')
  const [seed,setSeed] = useState<number | null>(null)
  const [klass,setKlass] = useState<PlayerClass>('knight')

  useEffect(()=>{
    const poll = setInterval(()=>{
      const g = (window as any).game
      if(g?.getState){
        const s = g.getState()
        setSnapshot(s)
        if(g.getSeed) setSeed(g.getSeed())
        if(g.getClass) setKlass(g.getClass())
      }
    }, 120)
    const g = (window as any).game
    const unsub = g?.subscribe?.((e:any)=>{
      if(e.type==='pickup' && e.payload?.kind==='gear') setStatus(`Equipped: ${e.payload?.gear?.name || 'gear'}`)
      if(e.type==='stairs_spawned') setStatus('Stairs found.')
      if(e.type==='defeat') setStatus('Defeat.')
    })
    return ()=>{ clearInterval(poll); if(typeof unsub==='function') unsub() }
  },[])

  useEffect(()=>{
    const onKey = (ev:KeyboardEvent)=>{
      const g = (window as any).game
      if(!g?.step) return
      if(ev.key==='ArrowUp' || ev.key==='w' || ev.key==='W') g.step({type:'move',dir:'up'})
      if(ev.key==='ArrowDown' || ev.key==='s' || ev.key==='S') g.step({type:'move',dir:'down'})
      if(ev.key==='ArrowLeft' || ev.key==='a' || ev.key==='A') g.step({type:'move',dir:'left'})
      if(ev.key==='ArrowRight' || ev.key==='d' || ev.key==='D') g.step({type:'move',dir:'right'})
      if(ev.shiftKey && (ev.key==='ArrowUp' || ev.key==='w' || ev.key==='W')) g.step({type:'dash',dir:'up'})
      if(ev.shiftKey && (ev.key==='ArrowDown' || ev.key==='s' || ev.key==='S')) g.step({type:'dash',dir:'down'})
      if(ev.shiftKey && (ev.key==='ArrowLeft' || ev.key==='a' || ev.key==='A')) g.step({type:'dash',dir:'left'})
      if(ev.shiftKey && (ev.key==='ArrowRight' || ev.key==='d' || ev.key==='D')) g.step({type:'dash',dir:'right'})
      if(ev.key==='g' || ev.key==='G') g.step({type:'guard'})
      if(ev.key==='e' || ev.key==='E') g.step({type:'interact'})
      if(ev.key===' ') g.step({type:'wait'})
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[])

  const playerHp = useMemo(()=> snapshot?.entities.find(e=>e.id==='p')?.hp ?? '-', [snapshot])
  const monstersLeft = useMemo(()=> snapshot?.entities.filter(e=>e.type==='monster').length ?? '-', [snapshot])

  const move = (dir:'up'|'down'|'left'|'right')=> (window as any).game?.step?.({type:'move',dir})
  const dash = ()=> (window as any).game?.step?.({type:'dash',dir:'up'})
  const bash = ()=> (window as any).game?.step?.({type:'bash',dir:'up'})
  const guard = ()=> (window as any).game?.step?.({type:'guard'})
  const wait = ()=> (window as any).game?.step?.({type:'wait'})
  const sameSeed = ()=> (window as any).game?.resetSameSeed?.()
  const newSeed = ()=> (window as any).game?.resetNewSeed?.()
  const setClass = (c:PlayerClass)=> (window as any).game?.setClass?.(c)

  if(adminView) return <AdminPage />

  return (
    <div className='dq-shell'>
      <div className='dq-arena'>
        <div className='dq-center'>
          <div className='dq-center-head'>WASD/Arrows move · Shift dash · G guard · Space wait</div>
          <div className='dq-canvas-wrap'><GameMount /></div>
        </div>

        <aside className='dq-side'>
          <h1 className='dq-title'>Dungeon Quest</h1>
          <p className='dq-sub'>{status}</p>

          <div className='dq-stats'>
            <div className='dq-stat'>Class<b>{klass}</b></div>
            <div className='dq-stat'>Floor<b>{snapshot?.floor ?? '-'}</b></div>
            <div className='dq-stat'>HP<b>{String(playerHp)}</b></div>
            <div className='dq-stat'>Monsters<b>{String(monstersLeft)}</b></div>
            <div className='dq-stat'>Score<b>{snapshot?.score ?? '-'}</b></div>
            <div className='dq-stat'>Seed<b>{seed ?? '-'}</b></div>
          </div>

          <div style={{fontSize:12,color:'#9aa9d4'}}>Mod: {snapshot?.floorModifier ?? 'none'}</div>
          <div style={{fontSize:12}}><I src={swordIcon}/>ATK+ {snapshot?.attackBonus ?? 0}</div>
          <div style={{fontSize:12}}><I src={shieldIcon}/>DEF+ {snapshot?.defenseBonus ?? 0}</div>
          <div style={{fontSize:12}}><I src={bootsIcon}/>Dash CD: {snapshot?.dashCooldown ?? 0}</div>
          <div style={{fontSize:12, marginBottom:4}}><I src={shieldIcon}/>Guard CD: {snapshot?.guardCooldown ?? 0}</div>

          <div className='dq-class'>
            <button onClick={()=>setClass('knight')}>Knight</button>
            <button onClick={()=>setClass('rogue')}>Rogue</button>
          </div>

          <div className='dq-controls'>
            <button onClick={()=>move('up')}>↑</button><button onClick={()=>move('left')}>←</button>
            <button onClick={()=>move('down')}>↓</button><button onClick={()=>move('right')}>→</button>
            <button onClick={wait}>Wait</button><button onClick={()=>(window as any).game?.step?.({type:'interact'})}>Interact (E)</button><button onClick={newSeed}>New Run</button>
          </div>

          <div className='dq-skillrow'>
            {klass==='rogue' && <button onClick={dash}><I src={bootsIcon}/>Dash</button>}
            {klass==='knight' && <button onClick={guard}><I src={shieldIcon}/>Guard</button>}
            {klass==='knight' && <button onClick={bash}><I src={swordIcon}/>Bash</button>}
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
            <p>Class: <b>{klass}</b></p><p>Floor: <b>{snapshot.floor}</b></p><p>Score: <b>{snapshot.score}</b></p>
            <div style={{display:'flex', gap:8}}><button onClick={sameSeed}>Restart same seed</button><button onClick={newSeed}>New seed</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
