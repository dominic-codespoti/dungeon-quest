import React from 'react'

export default function App(){
  return (
    <div style={{fontFamily: 'system-ui, sans-serif'}}>
      <h1>Dungeon Quest — WIP</h1>
      <p>Phaser canvas and game will mount below.</p>
      <div id="game-container"></div>
      <pre id="event-log" style={{height:300,overflow:'auto',background:'#111',color:'#0f0',padding:10}}></pre>
    </div>
  )
}
