import React, {useEffect, useState} from 'react'
import eventBus from '../../game/eventBus'

export default function AdminPage(){
  const [log,setLog] = useState<string[]>([])

  useEffect(()=>{
    // populate existing lines from eventBus
    setLog(eventBus.getLines().slice().reverse())
    const unsub = eventBus.subscribe((e)=>{
      setLog(prev=>[JSON.stringify(e),...prev].slice(0,500))
    })
    return ()=> unsub()
  },[])

  const download = ()=>{
    const blob = new Blob([log.slice().reverse().join('
')],{type:'application/x-ndjson'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'events.ndjson'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{padding:12,fontFamily:'system-ui'}}>
      <h2>Admin — Game State</h2>
      <div style={{display:'flex',gap:12}}>
        <div style={{flex:1}}>
          <h3>NDJSON Event Log</h3>
          <button onClick={download}>Download log</button>
          <div style={{height:400,overflow:'auto',background:'#111',color:'#0f0',padding:10}}>
            {log.map((l,i)=>(<pre key={i} style={{whiteSpace:'pre-wrap'}}>{l}</pre>))}
          </div>
        </div>
        <div style={{width:300}}>
          <h3>Controls</h3>
          <p>Use console: window.game.step({type:'move',dir:'left'})</p>
        </div>
      </div>
    </div>
  )
}
