import React from 'react'
import AdminPage from "./admin/AdminPage"
import GameMount from './GameMount'

export default function App(){
  return (
    <div style={{fontFamily: 'system-ui, sans-serif',padding:12}}>
      <h1>Dungeon Quest — WIP</h1>
      <p>Phaser canvas and game will mount below.</p>
      <div style={{border:'1px solid #ccc',padding:8,background:'#fafafa'}}>
        <GameMount />
      </div>
      <pre id="event-log" style={{height:120,overflow:'auto',background:'#111',color:'#0f0',padding:10,marginTop:12}}></pre>
      <hr/>
      <AdminPage/>
    </div>
  )
}
