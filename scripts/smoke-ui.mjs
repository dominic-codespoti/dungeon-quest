import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appPath = resolve(process.cwd(), 'src/ui/App.tsx')
const mountPath = resolve(process.cwd(), 'src/ui/GameMount.tsx')
const src = readFileSync(appPath, 'utf8')
const mountSrc = readFileSync(mountPath, 'utf8')

const checks = [
  ["shared helper: random seed", "function randomSeed(){"],
  ["shared helper: random class/race", "function randomClassRace(){"],
  ["shared helper: resolve chosen seed", "function resolveChosenSeed(seedInput:string){"],
  ["shared helper: apply preset to create", "const applyPresetToCreate = (preset:{klass:PlayerClass,race:PlayerRace,seed:number|string}, label:'Daily'|'Last-run')=>{"],
  ["shared helper: apply daily preset", "const applyDailyPresetToCreate = ()=>{"],
  ["shared helper: apply last-run preset", "const applyLastRunPresetToCreate = ()=>{"],
  ["shared helper: apply random class/race in create", "const applyRandomClassRaceToCreate = (withSeed=false)=>{"],
  ["shared helper: open create preset", "const openCreatePreset = (preset:{klass:PlayerClass,race:PlayerRace,seed:number|string})=>{"],
  ["shared helper: launch preset game", "const launchGamePreset = (preset:{klass:PlayerClass,race:PlayerRace,seed:number|string})=>{"],
  ["shared helper: copy create launch link", "const copyCreateLaunchLink = async ()=>{"],
  ["create launch link helper: uses resolved seed", "u.searchParams.set('seed', String(resolveChosenSeed(customSeed)))"],
  ["menu hotkey: Z daily build", "if(ev.key==='z' || ev.key==='Z') openCreatePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})"],
  ["menu hotkey: D daily challenge", "if(ev.key==='d' || ev.key==='D') launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})"],
  ["menu button: daily challenge uses launcher", "<button onClick={()=>launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})} title='D · launch daily challenge now'>Daily Challenge"],
  ["menu hotkey: H primer alias", "if(ev.key==='h' || ev.key==='H') toggleMenuModal('primer')"],
  ["menu hotkey: V copy daily preset", "if(ev.key==='v' || ev.key==='V') copyDailyPreset()"],
  ["menu hotkey: F toggle damage numbers", "if(ev.key==='f' || ev.key==='F') toggleFloatingNumbers()"],
  ["menu hotkey: G last build", "if((ev.key==='g' || ev.key==='G') && lastRun) openCreatePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})"],
  ["menu action: last build button", ">Last Build</button>"],
  ["menu button: last build uses create helper", "<button onClick={()=>openCreatePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})} title='G · prefill create from last run'>Last Build</button>"],
  ["menu button: daily build uses create helper", "<button onClick={()=>openCreatePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})} title='Z · prefill create from daily preset'>Daily Build</button>"],
  ["menu button: resume last uses launcher", "<button onClick={()=>launchGamePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})} title='Y · relaunch last snapshot'>Resume Last Run</button>"],
  ["menu tooltip: quick start intent", "title='A · random class/race/seed'"],
  ["hotkey: A quick start uses launcher", "if(ev.key==='a' || ev.key==='A'){\n        const rr = randomClassRace()\n        launchGamePreset({klass:rr.klass, race:rr.race, seed:randomSeed()})\n      }"],
  ["menu tooltip: daily challenge intent", "title='D · launch daily challenge now'"],
  ["menu action: damage numbers toggle button", "<button onClick={toggleFloatingNumbers} title='F'>Damage Numbers:"],
  ["create hotkey: R reroll build+seed", "if(ev.key==='r' || ev.key==='R'){"],
  ["create status: surprise feedback", "setStatus('Surprise class/race applied.')"],
  ["create status: reroll feedback", "setStatus('Rerolled class, race, and seed.')"],
  ["create action: reroll build+seed button", ">Reroll Build+Seed</button>"],
  ["create tooltip: surprise intent", "title='S · randomize class/race only'"],
  ["create tooltip: quickstart intent", "title='A · random build + seed and launch'"],
  ["create button: quick start uses launcher", "title='A · random build + seed and launch'>Quick Start</button>"],
  ["create hint: J launch-link shown", "J copy launch link"],
  ["create hint: back alias shown", "B/Esc back"],
  ["create hotkey: J copy launch link", "if(ev.key==='j' || ev.key==='J') copyCreateLaunchLink()"],
  ["create button tooltip: back alias", "title='B / Esc'>Back</button>"],
  ["create hotkey: Y apply last run", "if((ev.key==='y' || ev.key==='Y') && lastRun) applyLastRunPresetToCreate()"],
  ["create hotkey: L start last run", "if((ev.key==='l' || ev.key==='L') && lastRun) launchGamePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})"],
  ["create hotkey: B back to menu", "if(ev.key==='Escape' || ev.key==='b' || ev.key==='B') navigate({screen:'menu'})"],
  ["create action: start daily preset button", ">Start Daily Preset</button>"],
  ["create tooltip: start daily preset intent", "title='D · launch daily preset now'"],
  ["create tooltip: start last-run preset intent", "title='L · launch last-run preset now'"],
  ["create button: copy launch link", "title='J · copy run link for current create setup'>Copy Launch Link</button>"],
  ["create start-adventure button uses launcher", "launchGamePreset({klass, race, seed:resolveChosenSeed(customSeed)})"],
  ["daily row action: open build", ">Open Build</button>"],
  ["daily row tooltip: open build intent", "title='Z · open daily build in create'"],
  ["records action: play daily", ">Play Daily Challenge</button>"],
  ["records button: play daily uses launcher", "title='D · launch daily challenge immediately from records' onClick={()=>launchGamePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})}"],
  ["records tooltip: play daily intent", "title='D · launch daily challenge immediately from records'"],
  ["records action: open daily in create", ">Open Daily in Create</button>"],
  ["records button: open daily in create uses helper", "title='Z · prefill create with daily loadout' onClick={()=>openCreatePreset({klass:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})}"],
  ["records button: open-last in create uses helper", "{lastRun && <button title='G · prefill create with last-run loadout' onClick={()=>openCreatePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})}>Open Last in Create</button>}"],
  ["records button: resume-last uses launcher", "{lastRun && <button title='Y' onClick={()=>launchGamePreset({klass:lastRun.klass, race:lastRun.race, seed:lastRun.seed})}>Resume Last Run</button>}"],
  ["records hint strip", "Quick keys:"],
  ["renderer fallback state", "const [showRendererFallback,setShowRendererFallback] = useState(false)"],
  ["renderer fallback delayed", "const t = window.setTimeout(()=>setShowRendererFallback(true), 1600)"],
  ["renderer fallback retry button", "Renderer still initializing… <button onClick={retryRenderer}"],
]

const failures = checks.filter(([, needle]) => !src.includes(needle))

const mountChecks = [
  ["mount helper: float numbers from url", "function getFloatNumbersFromUrl(){"],
  ["mount flag: showDamageNumbers", "const showDamageNumbers = getFloatNumbersFromUrl()"],
  ["boss bar phase marker", "const phase = ratio > 0.66 ? 'PHASE I' : ratio > 0.33 ? 'PHASE II' : 'PHASE III'"],
  ["boss intro title card", "showBossIntro('BOSS ENCOUNTER')"],
  ["enemy hp bar store tracks last hp", "const hpBars: Record<string, {bg:any, fg:any, lastHp?:number}> = {}"],
  ["damage numbers conditional toggle", "if(showDamageNumbers && Number.isFinite(e.payload?.damage) && e.payload.damage>0) fxDamageNumber(to, e.payload.damage, e.payload.target==='p')"],
]
const mountFailures = mountChecks.filter(([, needle]) => !mountSrc.includes(needle))

const legacySeedExpr = "Math.floor(Math.random()*1_000_000)+1"
const seedExprCount = src.split(legacySeedExpr).length - 1
const seedExprGuardFailed = seedExprCount !== 1

if (failures.length || mountFailures.length || seedExprGuardFailed) {
  console.error('UI smoke checks failed:')
  for (const [name] of failures) console.error(`- missing: ${name}`)
  for (const [name] of mountFailures) console.error(`- mount missing: ${name}`)
  if (seedExprGuardFailed) console.error(`- guard: expected exactly 1 random-seed expression (in helper), found ${seedExprCount}`)
  process.exit(1)
}

console.log(`UI smoke checks passed (${checks.length + mountChecks.length} checks, 1 guard).`)
