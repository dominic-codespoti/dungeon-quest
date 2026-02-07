import React, {useState} from 'react'
import AdminPage from "./admin/AdminPage"
import GameMount from './GameMount'
import BattlePanel from './BattlePanel'
import type {CombatEntity} from '../game/types'

export default function App(){
  const [testEntities, setTestEntities] = useState<CombatEntity[] | null>(null)

  function startTestBattle(){
    const player = { id: 'p', kind: 'player', name: 'Hero', hp: 10, maxHp:10, armor:0, attack:3, speed:10, tags: [], statuses: [], alive:true, actionsRemaining:1 }
    const monster = { id: 'm_debug', kind: 'enemy', name: 'Debug Goblin', hp:6, maxHp:6, armor:0, attack:1, speed:5, tags: [], statuses: [], alive:true, actionsRemaining:1 }
    setTestEntities([player, monster])
  }

  return (
    <div style={{fontFamily: 'system-ui, sans-serif',padding:12}}>
      <h1>Dungeon Quest — WIP</h1>
      <p>Phaser canvas and game will mount below.</p>

      <div style={{marginBottom:8}}>
        <button onClick={startTestBattle}>
          Start test battle
        </button>
      </div>

      <div style={{border:'1px solid #ccc',padding:8,background:'#fafafa'}}>
        <GameMount />
      </div>
      <pre id="event-log" style={{height:120,overflow:'auto',background:'#111',color:'#0f0',padding:10,marginTop:12}}></pre>

      {testEntities ? (
        <div style={{position:'absolute',right:12,top:60,width:360}}>
          <BattlePanel entities={testEntities} onFinished={()=>setTestEntities(null)} onExit={()=>setTestEntities(null)} />
        </div>
      ) : null}

      <hr/>
      <AdminPage/>
    </div>
  )
}
