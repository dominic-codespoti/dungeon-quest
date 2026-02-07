import React, {useEffect, useState} from 'react'

export default function AdminPage(){
  const [log,setLog] = useState<string[]>([])

  useEffect(()=>{
    // hook into window.game events if available
    const g = (window as any).game
    if(g && typeof g.getState==='function'){
      setLog([JSON.stringify(g.getState())])
    }
    // rudimentary poll for events (will be replaced by subscribe)
    const iv = setInterval(()=>{
      if((window as any).game && typeof (window as any).game.getState==='function'){
        setLog(prev=>[JSON.stringify((window as any).game.getState()),...prev].slice(0,200))
      }
    },500)
    return ()=> clearInterval(iv)
  },[])

  return (
    <div style={{padding:12,fontFamily:'system-ui'}}>
      <h2>Admin — Game State</h2>
      <div style={{display:'flex',gap:12}}>
        <div style={{flex:1}}>
          <h3>Latest Snapshots</h3>
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
