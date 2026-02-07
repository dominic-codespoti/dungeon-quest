import {GameEvent} from './types'

type Subscriber = (e:GameEvent)=>void

class EventBus{
  subs: Subscriber[] = []
  ndjsonLines: string[] = []
  publish(e:GameEvent){
    this.ndjsonLines.push(JSON.stringify(e))
    this.subs.forEach(s=>s(e))
  }
  subscribe(s:Subscriber){ this.subs.push(s); return ()=>{ this.subs = this.subs.filter(x=>x!==s) } }
  getLines(){ return this.ndjsonLines.slice() }
}

export default new EventBus()
