import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appPath = resolve(process.cwd(), 'src/ui/App.tsx')
const src = readFileSync(appPath, 'utf8')

const checks = [
  ["shared helper: random seed", "function randomSeed(){"],
  ["shared helper: random class/race", "function randomClassRace(){"],
  ["shared helper: apply daily preset", "const applyDailyPresetToCreate = ()=>{"],
  ["shared helper: apply last-run preset", "const applyLastRunPresetToCreate = ()=>{"],
  ["shared helper: apply random class/race in create", "const applyRandomClassRaceToCreate = (withSeed=false)=>{"],
  ["shared helper: launch preset game", "const launchGamePreset = (preset:{klass:PlayerClass,race:PlayerRace,seed:number|string})=>{"],
  ["menu hotkey: Z daily build", "if(ev.key==='z' || ev.key==='Z') navigate({screen:'create', class:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})"],
  ["menu hotkey: D daily challenge", "if(ev.key==='d' || ev.key==='D') launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})"],
  ["menu button: daily challenge uses launcher", "<button onClick={()=>launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})} title='D · launch daily challenge now'>Daily Challenge"],
  ["menu hotkey: H primer alias", "if(ev.key==='h' || ev.key==='H') toggleMenuModal('primer')"],
  ["menu hotkey: V copy daily preset", "if(ev.key==='v' || ev.key==='V') copyDailyPreset()"],
  ["menu hotkey: G last build", "if((ev.key==='g' || ev.key==='G') && lastRun) navigate({screen:'create', class:lastRun.klass, race:lastRun.race, seed:lastRun.seed})"],
  ["menu action: last build button", ">Last Build</button>"],
  ["menu tooltip: quick start intent", "title='A · random class/race/seed'"],
  ["menu tooltip: daily challenge intent", "title='D · launch daily challenge now'"],
  ["create hotkey: R reroll build+seed", "if(ev.key==='r' || ev.key==='R'){"],
  ["create status: surprise feedback", "setStatus('Surprise class/race applied.')"],
  ["create status: reroll feedback", "setStatus('Rerolled class, race, and seed.')"],
  ["create action: reroll build+seed button", ">Reroll Build+Seed</button>"],
  ["create tooltip: surprise intent", "title='S · randomize class/race only'"],
  ["create tooltip: quickstart intent", "title='A · random build + seed and launch'"],
  ["create hint: back alias shown", "B/Esc back"],
  ["create button tooltip: back alias", "title='B / Esc'>Back</button>"],
  ["create hotkey: Y apply last run", "if((ev.key==='y' || ev.key==='Y') && lastRun) applyLastRunPresetToCreate()"],
  ["create hotkey: L start last run", "if((ev.key==='l' || ev.key==='L') && lastRun) launchGamePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})"],
  ["create hotkey: B back to menu", "if(ev.key==='Escape' || ev.key==='b' || ev.key==='B') navigate({screen:'menu'})"],
  ["create action: start daily preset button", ">Start Daily Preset</button>"],
  ["create tooltip: start daily preset intent", "title='D · launch daily preset now'"],
  ["create tooltip: start last-run preset intent", "title='L · launch last-run preset now'"],
  ["create start-adventure button uses launcher", "launchGamePreset({klass, race, seed:Number.isFinite(chosenSeed) && chosenSeed>0 ? chosenSeed : randomSeed()})"],
  ["daily row action: open build", ">Open Build</button>"],
  ["daily row tooltip: open build intent", "title='Z · open daily build in create'"],
  ["records action: play daily", ">Play Daily Challenge</button>"],
  ["records button: play daily uses launcher", "title='D · launch daily challenge immediately from records' onClick={()=>launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})}"],
  ["records tooltip: play daily intent", "title='D · launch daily challenge immediately from records'"],
  ["records action: open daily in create", ">Open Daily in Create</button>"],
  ["records hint strip", "Quick keys:"],
]

const failures = checks.filter(([, needle]) => !src.includes(needle))

const legacySeedExpr = "Math.floor(Math.random()*1_000_000)+1"
const seedExprCount = src.split(legacySeedExpr).length - 1
const seedExprGuardFailed = seedExprCount !== 1

if (failures.length || seedExprGuardFailed) {
  console.error('UI smoke checks failed:')
  for (const [name] of failures) console.error(`- missing: ${name}`)
  if (seedExprGuardFailed) console.error(`- guard: expected exactly 1 random-seed expression (in helper), found ${seedExprCount}`)
  process.exit(1)
}

console.log(`UI smoke checks passed (${checks.length} checks, 1 guard).`)
