import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const srcDir = path.join(root, 'src/game')
const outDir = path.join(root, '.playtest-tmp')
fs.mkdirSync(outDir, {recursive:true})

for (const file of ['types.ts','eventBus.ts','engine.ts']) {
  const src = fs.readFileSync(path.join(srcDir, file), 'utf8')
  const out = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, strict: true }, fileName: file }).outputText
  fs.writeFileSync(path.join(outDir, file.replace('.ts','.js')), out, 'utf8')
}

const {Engine} = require(path.join(outDir, 'engine.js'))
const dirs = [{dir:'up',dx:0,dy:-1},{dir:'down',dx:0,dy:1},{dir:'left',dx:-1,dy:0},{dir:'right',dx:1,dy:0}]
const key = (p)=> `${p.x},${p.y}`
const manhattan = (a,b)=> Math.abs(a.x-b.x)+Math.abs(a.y-b.y)

function shortestFirstStep(state, start, goal){
  const wallSet = new Set((state.walls||[]).map(key))
  const blocked = new Set((state.entities||[]).filter(e=>e.type==='monster').map(e=>key(e.pos)))
  const q = [start], prev = new Map(), seen = new Set([key(start)])
  while(q.length){
    const cur = q.shift()
    if(cur.x===goal.x && cur.y===goal.y) break
    for(const d of dirs){
      const n = {x:cur.x+d.dx,y:cur.y+d.dy}
      if(n.x<0 || n.y<0 || n.x>=state.width || n.y>=state.height) continue
      const nk = key(n)
      if(seen.has(nk) || wallSet.has(nk)) continue
      if(blocked.has(nk) && !(n.x===goal.x && n.y===goal.y)) continue
      seen.add(nk); prev.set(nk, {from:key(cur), dir:d.dir}); q.push(n)
    }
  }
  let curKey = key(goal)
  if(!prev.has(curKey)) return null
  let firstDir = null
  while(prev.has(curKey)){ const p = prev.get(curKey); firstDir = p.dir; if(p.from===key(start)) break; curKey = p.from }
  return firstDir
}

function chooseAction(state){
  const p = state.entities.find(e=>e.id==='p')
  const monsters = state.entities.filter(e=>e.type==='monster')
  const stairs = state.entities.find(e=>e.type==='item' && e.kind==='stairs')
  const potion = state.entities.find(e=>e.type==='item' && e.kind==='potion')

  if(state.playerClass==='knight'){
    if((p.hp||0)<=5 && (state.guardCooldown||0)===0) return {type:'guard'}
    const adjacent = monsters.find(m=>manhattan(m.pos,p.pos)===1)
    if(adjacent){
      const dx = adjacent.pos.x-p.pos.x, dy = adjacent.pos.y-p.pos.y
      const dir = Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up')
      return {type:'bash',dir}
    }
  }

  let targets = []
  if(stairs) targets = [stairs.pos]
  else if((p.hp||0)<=5 && potion) targets = [potion.pos]
  else if(monsters.length){ monsters.sort((a,b)=>manhattan(p.pos,a.pos)-manhattan(p.pos,b.pos)); targets = monsters.slice(0,2).map(m=>m.pos) }

  for(const t of targets){
    const dir = shortestFirstStep(state, p.pos, t)
    if(dir){
      const dist = manhattan(p.pos, t)
      if(state.playerClass==='rogue' && (state.dashCooldown||0)===0 && dist>=3) return {type:'dash', dir}
      return {type:'move', dir}
    }
  }
  return {type:'wait'}
}

function runClass(playerClass){
  const runs = []
  for(let i=0;i<6;i++){
    const eng = new Engine(30,30,i+1,playerClass)
    let state = eng.getState(), turns = 0
    while(!state.gameOver && turns < 1200){ state = eng.step(chooseAction(state)); turns++ }
    const hp = state.entities.find(e=>e.id==='p')?.hp ?? 0
    runs.push({seed:i+1,class:playerClass,floor:state.floor,score:state.score,hp,turns,defeat:state.gameOver})
  }
  const avg = (k)=> runs.reduce((a,b)=>a+b[k],0)/runs.length
  return {runs, avgFloor:Number(avg('floor').toFixed(2)), avgScore:Math.round(avg('score')), defeats:runs.filter(r=>r.defeat).length, maxFloor:Math.max(...runs.map(r=>r.floor))}
}

console.log(JSON.stringify({knight: runClass('knight'), rogue: runClass('rogue')}, null, 2))
