import React, {useEffect, useMemo, useState} from 'react'
import AdminPage from "./admin/AdminPage"
import GameMount from './GameMount'
import type {PlayerClass} from '../game/types'

type Snapshot = {
  tick:number
  floor:number
  floorModifier?: string
  playerClass: PlayerClass
  score:number
  attackBonus:number
  defenseBonus:number
  dashCooldown:number
  guardCooldown:number
  guardActive:boolean
  gameOver:boolean
  outcome?:'victory'|'defeat'
  entities: Array<{id:string,type:string,kind?:string,hp?:number}>
}

export default function App(){
  const [snapshot,setSnapshot] = useState<Snapshot | null>(null)
  const [status,setStatus] = useState('Clear each floor, then descend the stairs')
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
      if(e.type==='victory') setStatus('🏆 Victory! All monsters defeated.')
      if(e.type==='defeat') setStatus('☠️ Defeat! You were overwhelmed.')
      if(e.type==='pickup' && e.payload?.kind==='potion') setStatus('🧪 Potion grabbed. HP restored.')
      if(e.type==='pickup' && e.payload?.kind==='relic') setStatus('💎 Relic secured. Score boosted.')
      if(e.type==='pickup' && e.payload?.kind==='elixir') setStatus('🍃 Elixir: +2 HP and cooldowns reduced.')
      if(e.type==='pickup' && e.payload?.kind==='cursed-idol') setStatus('🗿 Cursed Idol: big score, painful cost.')
      if(e.type==='pickup' && e.payload?.kind==='gear') setStatus(`🧰 ${e.payload?.gear?.name || 'Gear'} equipped.`)
      if(e.type==='stairs_spawned') setStatus('🪜 Stairs appeared. Descend to next floor!')
      if(e.type==='stairs_used') setStatus('⬇️ Descending... deeper into the dungeon.')
      if(e.type==='floor') setStatus(`⚔️ Floor ${e.payload?.floor} (${e.payload?.modifier || 'none'})`)
      if(e.type==='dash_used') setStatus('💨 Rogue dash.')
      if(e.type==='dash_blocked') setStatus(`⏳ Dash cooldown: ${e.payload?.cooldown}`)
      if(e.type==='dash_refresh') setStatus('⚡ Dash refreshed on kill.')
      if(e.type==='guard_used') setStatus('🛡️ Guard up (Knight).')
      if(e.type==='guard_triggered') setStatus('🛡️ Guard absorbed damage.')
      if(e.type==='guard_blocked') setStatus(`⏳ Guard cooldown: ${e.payload?.cooldown}`)
      if(e.type==='bash_miss') setStatus('⚔️ Shield bash missed.')
      if(e.type==='skill_blocked') setStatus(`Class cannot use ${e.payload?.skill}.`)
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
      if(ev.key===' ') g.step({type:'wait'})
      if(ev.shiftKey && (ev.key==='ArrowUp' || ev.key==='w' || ev.key==='W')) g.step({type:'dash',dir:'up'})
      if(ev.shiftKey && (ev.key==='ArrowDown' || ev.key==='s' || ev.key==='S')) g.step({type:'dash',dir:'down'})
      if(ev.shiftKey && (ev.key==='ArrowLeft' || ev.key==='a' || ev.key==='A')) g.step({type:'dash',dir:'left'})
      if(ev.shiftKey && (ev.key==='ArrowRight' || ev.key==='d' || ev.key==='D')) g.step({type:'dash',dir:'right'})
      if(ev.key==='g' || ev.key==='G') g.step({type:'guard'})
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[])

  const playerHp = useMemo(()=> snapshot?.entities.find(e=>e.id==='p')?.hp ?? '-', [snapshot])
  const monstersLeft = useMemo(()=> snapshot?.entities.filter(e=>e.type==='monster').length ?? '-', [snapshot])

  const move = (dir:'up'|'down'|'left'|'right')=> (window as any).game?.step?.({type:'move',dir})
  const dash = (dir:'up'|'down'|'left'|'right')=> (window as any).game?.step?.({type:'dash',dir})
  const bash = (dir:'up'|'down'|'left'|'right')=> (window as any).game?.step?.({type:'bash',dir})
  const guard = ()=> (window as any).game?.step?.({type:'guard'})
  const wait = ()=> (window as any).game?.step?.({type:'wait'})
  const sameSeed = ()=> (window as any).game?.resetSameSeed?.()
  const newSeed = ()=> (window as any).game?.resetNewSeed?.()
  const setClass = (c:PlayerClass)=> (window as any).game?.setClass?.(c)

  return (
    <div style={{fontFamily: 'system-ui, sans-serif',padding:12, position:'relative'}}>
      <h1>Dungeon Quest — WIP</h1>
      <p>{status}</p>
      <div style={{display:'flex',gap:12,marginBottom:8,flexWrap:'wrap'}}>
        <strong>Class: {klass}</strong>
        <strong>Seed: {seed ?? '-'}</strong>
        <strong>Floor: {snapshot?.floor ?? '-'}</strong>
        <strong>Modifier: {snapshot?.floorModifier ?? 'none'}</strong>
        <strong>HP: {String(playerHp)}</strong>
        <strong>Monsters: {String(monstersLeft)}</strong>
        <strong>Score: {snapshot?.score ?? '-'}</strong>
        <strong>ATK+: {snapshot?.attackBonus ?? 0}</strong>
        <strong>DEF+: {snapshot?.defenseBonus ?? 0}</strong>
        <strong>Dash: {snapshot?.dashCooldown ? `CD ${snapshot.dashCooldown}` : 'Ready'}</strong>
        <strong>Guard: {snapshot?.guardCooldown ? `CD ${snapshot.guardCooldown}` : (snapshot?.guardActive ? 'Active' : 'Ready')}</strong>
      </div>

      <div style={{marginBottom:10, display:'flex', gap:6, flexWrap:'wrap'}}>
        <button onClick={()=>setClass('knight')}>Knight</button>
        <button onClick={()=>setClass('rogue')}>Rogue</button>
        <button onClick={()=>move('up')} disabled={snapshot?.gameOver}>↑</button>
        <button onClick={()=>move('left')} disabled={snapshot?.gameOver}>←</button>
        <button onClick={()=>move('down')} disabled={snapshot?.gameOver}>↓</button>
        <button onClick={()=>move('right')} disabled={snapshot?.gameOver}>→</button>
        <button onClick={wait} disabled={snapshot?.gameOver}>Wait</button>

        {klass==='rogue' && (
          <>
            <button onClick={()=>dash('up')} disabled={snapshot?.gameOver || (snapshot?.dashCooldown ?? 0) > 0}>Dash ↑</button>
            <button onClick={()=>dash('left')} disabled={snapshot?.gameOver || (snapshot?.dashCooldown ?? 0) > 0}>Dash ←</button>
            <button onClick={()=>dash('down')} disabled={snapshot?.gameOver || (snapshot?.dashCooldown ?? 0) > 0}>Dash ↓</button>
            <button onClick={()=>dash('right')} disabled={snapshot?.gameOver || (snapshot?.dashCooldown ?? 0) > 0}>Dash →</button>
          </>
        )}

        {klass==='knight' && (
          <>
            <button onClick={guard} disabled={snapshot?.gameOver || (snapshot?.guardCooldown ?? 0) > 0}>Guard</button>
            <button onClick={()=>bash('up')} disabled={snapshot?.gameOver}>Bash ↑</button>
            <button onClick={()=>bash('left')} disabled={snapshot?.gameOver}>Bash ←</button>
            <button onClick={()=>bash('down')} disabled={snapshot?.gameOver}>Bash ↓</button>
            <button onClick={()=>bash('right')} disabled={snapshot?.gameOver}>Bash →</button>
          </>
        )}

        <button onClick={newSeed}>New Run</button>
        <span style={{opacity:0.75}}>Items: blue potion, cyan relic, lime elixir, purple idol, gold gear, violet stairs</span>
      </div>

      <div style={{border:'1px solid #ccc',padding:8,background:'#fafafa'}}>
        <GameMount />
      </div>

      {snapshot?.gameOver && (
        <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{background:'#1e1e1e', color:'#fff', border:'1px solid #555', padding:18, width:360, borderRadius:8}}>
            <h2 style={{marginTop:0}}>{snapshot.outcome==='defeat' ? 'Run Over' : 'Run Complete'}</h2>
            <p>Class: <strong>{klass}</strong></p>
            <p>Floor: <strong>{snapshot.floor}</strong></p>
            <p>Score: <strong>{snapshot.score}</strong></p>
            <p>HP: <strong>{String(playerHp)}</strong></p>
            <p>Seed: <strong>{seed ?? '-'}</strong></p>
            <div style={{display:'flex', gap:8, marginTop:12}}>
              <button onClick={sameSeed}>Restart same seed</button>
              <button onClick={newSeed}>New seed</button>
            </div>
          </div>
        </div>
      )}

      <pre id="event-log" style={{height:120,overflow:'auto',background:'#111',color:'#0f0',padding:10,marginTop:12}}></pre>
      <hr/>
      <AdminPage/>
    </div>
  )
}
