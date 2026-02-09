import React, {useEffect, useMemo, useState} from 'react'
import AdminPage from "./admin/AdminPage"
import GameMount from './GameMount'

type Snapshot = {
  tick:number
  floor:number
  floorModifier?: string
  score:number
  dashCooldown:number
  gameOver:boolean
  outcome?:'victory'|'defeat'
  entities: Array<{id:string,type:string,kind?:string,hp?:number}>
}

export default function App(){
  const [snapshot,setSnapshot] = useState<Snapshot | null>(null)
  const [status,setStatus] = useState('Clear each floor, then descend the stairs')
  const [seed,setSeed] = useState<number | null>(null)

  useEffect(()=>{
    const poll = setInterval(()=>{
      const g = (window as any).game
      if(g?.getState){
        setSnapshot(g.getState())
        if(g.getSeed) setSeed(g.getSeed())
      }
    }, 120)

    const g = (window as any).game
    const unsub = g?.subscribe?.((e:any)=>{
      if(e.type==='victory') setStatus('🏆 Victory! All monsters defeated.')
      if(e.type==='defeat') setStatus('☠️ Defeat! You were overwhelmed.')
      if(e.type==='pickup' && e.payload?.kind==='potion') setStatus('🧪 Potion grabbed. HP restored.')
      if(e.type==='pickup' && e.payload?.kind==='relic') setStatus('💎 Relic secured. Score boosted.')
      if(e.type==='stairs_spawned') setStatus('🪜 Stairs appeared. Descend to next floor!')
      if(e.type==='stairs_used') setStatus('⬇️ Descending... deeper into the dungeon.')
      if(e.type==='floor') setStatus(`⚔️ Floor ${e.payload?.floor} (${e.payload?.modifier || 'none'}) — enemies are getting tougher.`)
      if(e.type==='dash_used') setStatus('💨 Dash! Repositioning with momentum.')
      if(e.type==='dash_blocked') setStatus(`⏳ Dash recharging (${e.payload?.cooldown})`)
    })

    return ()=>{ clearInterval(poll); if(typeof unsub==='function') unsub() }
  },[])

  useEffect(()=>{
    const onKey = (ev:KeyboardEvent)=>{
      const g = (window as any).game
      if(!g?.step) return
      const t = ev.shiftKey ? 'dash' : 'move'
      if(ev.key==='ArrowUp' || ev.key==='w' || ev.key==='W') g.step({type:t,dir:'up'})
      if(ev.key==='ArrowDown' || ev.key==='s' || ev.key==='S') g.step({type:t,dir:'down'})
      if(ev.key==='ArrowLeft' || ev.key==='a' || ev.key==='A') g.step({type:t,dir:'left'})
      if(ev.key==='ArrowRight' || ev.key==='d' || ev.key==='D') g.step({type:t,dir:'right'})
      if(ev.key===' ') g.step({type:'wait'})
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[])

  const playerHp = useMemo(()=> snapshot?.entities.find(e=>e.id==='p')?.hp ?? '-', [snapshot])
  const monstersLeft = useMemo(()=> snapshot?.entities.filter(e=>e.type==='monster').length ?? '-', [snapshot])

  const move = (dir:'up'|'down'|'left'|'right')=> (window as any).game?.step?.({type:'move',dir})
  const dash = (dir:'up'|'down'|'left'|'right')=> (window as any).game?.step?.({type:'dash',dir})
  const wait = ()=> (window as any).game?.step?.({type:'wait'})
  const sameSeed = ()=> (window as any).game?.resetSameSeed?.()
  const newSeed = ()=> (window as any).game?.resetNewSeed?.()

  return (
    <div style={{fontFamily: 'system-ui, sans-serif',padding:12, position:'relative'}}>
      <h1>Dungeon Quest — WIP</h1>
      <p>{status}</p>
      <div style={{display:'flex',gap:12,marginBottom:8,flexWrap:'wrap'}}>
        <strong>Seed: {seed ?? '-'}</strong>
        <strong>Floor: {snapshot?.floor ?? '-'}</strong>
        <strong>Modifier: {snapshot?.floorModifier ?? 'none'}</strong>
        <strong>HP: {String(playerHp)}</strong>
        <strong>Monsters: {String(monstersLeft)}</strong>
        <strong>Tick: {snapshot?.tick ?? '-'}</strong>
        <strong>Score: {snapshot?.score ?? '-'}</strong>
        <strong>Dash: {snapshot?.dashCooldown ? `CD ${snapshot.dashCooldown}` : 'Ready'}</strong>
      </div>

      <div style={{marginBottom:10, display:'flex', gap:6, flexWrap:'wrap'}}>
        <button onClick={()=>move('up')} disabled={snapshot?.gameOver}>↑</button>
        <button onClick={()=>move('left')} disabled={snapshot?.gameOver}>←</button>
        <button onClick={()=>move('down')} disabled={snapshot?.gameOver}>↓</button>
        <button onClick={()=>move('right')} disabled={snapshot?.gameOver}>→</button>
        <button onClick={wait} disabled={snapshot?.gameOver}>Wait</button>
        <button onClick={()=>dash('up')} disabled={snapshot?.gameOver || (snapshot?.dashCooldown ?? 0) > 0}>Dash ↑</button>
        <button onClick={()=>dash('left')} disabled={snapshot?.gameOver || (snapshot?.dashCooldown ?? 0) > 0}>Dash ←</button>
        <button onClick={()=>dash('down')} disabled={snapshot?.gameOver || (snapshot?.dashCooldown ?? 0) > 0}>Dash ↓</button>
        <button onClick={()=>dash('right')} disabled={snapshot?.gameOver || (snapshot?.dashCooldown ?? 0) > 0}>Dash →</button>
        <button onClick={newSeed}>New Run</button>
        <span style={{opacity:0.8}}>Controls: Arrow keys / WASD / Space, Shift+Direction = Dash</span>
        <span style={{opacity:0.8}}>Enemies: red=chaser, dark red=brute, orange=skitter; blue=potion, cyan=relic, violet=stairs</span>
      </div>

      <div style={{border:'1px solid #ccc',padding:8,background:'#fafafa'}}>
        <GameMount />
      </div>

      {snapshot?.gameOver && (
        <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{background:'#1e1e1e', color:'#fff', border:'1px solid #555', padding:18, width:360, borderRadius:8}}>
            <h2 style={{marginTop:0}}>{snapshot.outcome==='defeat' ? 'Run Over' : 'Run Complete'}</h2>
            <p style={{margin:'6px 0'}}>Floor reached: <strong>{snapshot.floor}</strong></p>
            <p style={{margin:'6px 0'}}>Final score: <strong>{snapshot.score}</strong></p>
            <p style={{margin:'6px 0'}}>Final HP: <strong>{String(playerHp)}</strong></p>
            <p style={{margin:'6px 0'}}>Seed: <strong>{seed ?? '-'}</strong></p>
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
