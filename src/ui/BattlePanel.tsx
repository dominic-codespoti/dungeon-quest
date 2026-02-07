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
    // apply and then auto-resolve enemy turns until awaitingAction or finished
    let s = applyAction(state, action)
    s = step(s)
    // now auto-run until opponent awaits action or finished
    for(let i=0;i<20;i++){
      if(s.phase==='finished' || (s.phase==='awaitingAction' && isPlayersTurn(s))) break
      // if awaitingAction and it's enemy's turn, build simple AI action
      if(s.phase==='awaitingAction' && !isPlayersTurn(s)){
        const aiActor = s.currentActorId
        const playerTargets = Object.values(s.entities).filter(e=>e.kind==='player' && e.alive).map(e=>e.id)
        if(playerTargets.length>0 && aiActor){
          const aiAction: BattleAction = { kind:'basicAttack', actorId: aiActor, targets:[playerTargets[0]], targetingMode:'single', effect:{damage: undefined} }
          s = applyAction(s, aiAction)
          s = step(s)
          continue
        }
      }
      s = step(s)
    }
    setState(s)
    if(s.phase==='finished' && onFinished){
      onFinished(s)
    }
  }

  function continueTurn(){
    // deprecated by auto-resolve; keep for safety
    if(!state) return
    let s = state
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
          <div style={{color:'#aaa'}}>Resolving...</div>
        )}
      </div>
    </div>
  )
}
