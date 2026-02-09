import React, {useEffect, useMemo, useState} from 'react'
import AdminPage from "./admin/AdminPage"
import GameMount from './GameMount'

type Snapshot = {
  tick:number
  score:number
  gameOver:boolean
  outcome?:'victory'|'defeat'
  entities: Array<{id:string,type:string,hp?:number}>
}

export default function App(){
  const [snapshot,setSnapshot] = useState<Snapshot | null>(null)
  const [status,setStatus] = useState('Survive and clear all monsters')

  useEffect(()=>{
    const poll = setInterval(()=>{
      const g = (window as any).game
      if(g?.getState){
        setSnapshot(g.getState())
      }
    }, 120)

    const g = (window as any).game
    const unsub = g?.subscribe?.((e:any)=>{
      if(e.type==='victory') setStatus('🏆 Victory! All monsters defeated.')
      if(e.type==='defeat') setStatus('☠️ Defeat! You were overwhelmed.')
      if(e.type==='pickup' && e.payload?.kind==='potion') setStatus('🧪 Potion grabbed. HP restored.')
      if(e.type==='pickup' && e.payload?.kind==='relic') setStatus('💎 Relic secured. Score boosted.')
    })

    return ()=>{ clearInterval(poll); if(typeof unsub==='function') unsub() }
  },[])

  useEffect(()=>{
    const onKey = (ev:KeyboardEvent)=>{
      const g = (window as any).game
      if(!g?.step) return
      if(ev.key==='ArrowUp' || ev.key==='w') g.step({type:'move',dir:'up'})
      if(ev.key==='ArrowDown' || ev.key==='s') g.step({type:'move',dir:'down'})
      if(ev.key==='ArrowLeft' || ev.key==='a') g.step({type:'move',dir:'left'})
      if(ev.key==='ArrowRight' || ev.key==='d') g.step({type:'move',dir:'right'})
      if(ev.key===' ') g.step({type:'wait'})
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[])

  const playerHp = useMemo(()=> snapshot?.entities.find(e=>e.id==='p')?.hp ?? '-', [snapshot])
  const monstersLeft = useMemo(()=> snapshot?.entities.filter(e=>e.type==='monster').length ?? '-', [snapshot])

  const move = (dir:'up'|'down'|'left'|'right')=> (window as any).game?.step?.({type:'move',dir})
  const wait = ()=> (window as any).game?.step?.({type:'wait'})

  return (
    <div style={{fontFamily: 'system-ui, sans-serif',padding:12}}>
      <h1>Dungeon Quest — WIP</h1>
      <p>{status}</p>
      <div style={{display:'flex',gap:12,marginBottom:8,flexWrap:'wrap'}}>
        <strong>HP: {String(playerHp)}</strong>
        <strong>Monsters: {String(monstersLeft)}</strong>
        <strong>Tick: {snapshot?.tick ?? '-'}</strong>
        <strong>Score: {snapshot?.score ?? '-'}</strong>
      </div>

      <div style={{marginBottom:10, display:'flex', gap:6, flexWrap:'wrap'}}>
        <button onClick={()=>move('up')} disabled={snapshot?.gameOver}>↑</button>
        <button onClick={()=>move('left')} disabled={snapshot?.gameOver}>←</button>
        <button onClick={()=>move('down')} disabled={snapshot?.gameOver}>↓</button>
        <button onClick={()=>move('right')} disabled={snapshot?.gameOver}>→</button>
        <button onClick={wait} disabled={snapshot?.gameOver}>Wait</button>
        <button onClick={()=>window.location.reload()}>New Run</button>
        <span style={{opacity:0.8}}>Controls: Arrow keys / WASD / Space</span>
        <span style={{opacity:0.8}}>Enemies: red=chaser, dark red=brute, orange=skitter; blue=potion, cyan=relic</span>
      </div>

      <div style={{border:'1px solid #ccc',padding:8,background:'#fafafa'}}>
        <GameMount />
      </div>

      <pre id="event-log" style={{height:120,overflow:'auto',background:'#111',color:'#0f0',padding:10,marginTop:12}}></pre>
      <hr/>
      <AdminPage/>
    </div>
  )
}
