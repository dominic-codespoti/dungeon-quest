import React, {useEffect, useRef} from 'react'
import { createGame } from '../game'

export default function GameMount(){
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(()=>{
    if(ref.current){
      const g = createGame(ref.current)
      return ()=> g.destroy(true)
    }
  },[])
  return <div ref={ref} id="phaser-root"></div>
}
