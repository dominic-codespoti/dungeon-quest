import React, {useEffect, useRef} from 'react'
import { createGame } from '../game'
import Engine from '../game/engine'

export default function GameMount(){
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(()=>{
    if(ref.current){
      const g = createGame(ref.current)
      // attach engine to window for automation/debugging
      const eng = new Engine(30,30,1)
      ;(window as any).game = {
        getState: ()=> eng.getState(),
        step: (a:any)=> eng.step(a),
        subscribe: (fn:Function)=>{ return eventBus.subscribe(fn) }
      }
      return ()=> g.destroy(true)
    }
  },[])
  return <div ref={ref} id="phaser-root"></div>
}
