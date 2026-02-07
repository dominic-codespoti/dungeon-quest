import React, {useEffect, useState} from 'react'
import type {CombatEntity, BattleState, BattleAction} from '../game/types'
import { createInitialBattleState, step, isPlayersTurn, applyAction } from '../game/battleEngine'

export default function BattlePanel({
  entities,
  onExit,
  onFinished,
}:{
  entities: CombatEntity[]
  onExit?: ()=>void
  onFinished?: (state: BattleState)=>void
}){
  const [state, setState] = useState<BattleState | null>(null)

  // initialise or reset battle when entities change
  useEffect(()=>{
    if(entities && entities.length > 0){
      const initial = createInitialBattleState(entities, Date.now() & 0xffff)
      // auto-step to first meaningful phase
      let s: BattleState = initial
      for(let i=0;i<10;i++){
        s = step(s)
        if(s.phase==='awaitingAction' || s.phase==='finished') break
      }
      setState(s)
    }
  },[JSON.stringify(entities)])

  if(!state) return (
    <div style={{padding:8}}>
      <p>No active battle</p>
    </div>
  )

  function doPlayerAttack(){
    if(!state) return
    if(state.phase!=='awaitingAction' || !isPlayersTurn(state)) return
    const actorId = state.currentActorId
    if(!actorId) return
    // pick first enemy target
    const targets = Object.values(state.entities).filter(e=>e.kind==='enemy' && e.alive).map(e=>e.id)
    if(targets.length===0) return
    const action: BattleAction = {
      kind: 'basicAttack',
      actorId,
      targets: [targets[0]],
      targetingMode: 'single',
      effect: { damage: undefined }
    }
    const next = applyAction(state, action)
    const resolved = step(next)
    setState(resolved)
  }

  function continueTurn(){
    if(!state) return
    let s = state
    // advance until awaitingAction or finished
    for(let i=0;i<10;i++){
      s = step(s)
      if(s.phase==='awaitingAction' || s.phase==='finished') break
    }
    setState(s)
    if(s.phase==='finished' && onFinished){
      onFinished(s)
    }
  }

  return (
    <div style={{padding:8,border:'1px solid #333',background:'#222',color:'#fff'}}>
      <div style={{display:'flex',justifyContent:'space-between'}}>
        <div>
          <strong>Battle</strong>
          <div>Round {state.round} • Turn {state.turnNumber}</div>
          <div>Actor: {state.currentActorId}</div>
        </div>
        <div>
          <button onClick={()=>{ setState(null); onExit && onExit() }}>Exit</button>
        </div>
      </div>

      <div style={{marginTop:8}}>
        <div style={{display:'flex',gap:12}}>
          {Object.values(state.entities).map(e=> (
            <div key={e.id} style={{padding:6,background:'#111',border:'1px solid #444'}}>
              <div>{e.name} ({e.kind})</div>
              <div>HP: {e.hp}/{e.maxHp}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{marginTop:8}}>
        <div style={{height:120,overflow:'auto',background:'#000',padding:6}}>
          {state.log.map(l=> (
            <div key={l.id} style={{fontFamily:'monospace',fontSize:12}}>{l.message}</div>
          ))}
        </div>
      </div>

      <div style={{marginTop:8}}>
        {state.phase==='awaitingAction' && isPlayersTurn(state) ? (
          <button onClick={doPlayerAttack}>Basic Attack</button>
        ) : (
          <button onClick={continueTurn}>Advance</button>
        )}
      </div>
    </div>
  )
}
