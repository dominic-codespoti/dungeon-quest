import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appPath = resolve(process.cwd(), 'src/ui/App.tsx')
const src = readFileSync(appPath, 'utf8')

const checks = [
  ["menu hotkey: Z daily build", "if(ev.key==='z' || ev.key==='Z') navigate({screen:'create', class:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})"],
  ["menu hotkey: D daily challenge", "if(ev.key==='d' || ev.key==='D') navigate({screen:'game', class:dailyPreset.klass, race:dailyPreset.race, seed:dailyPreset.seed})"],
  ["menu hotkey: G last build", "if((ev.key==='g' || ev.key==='G') && lastRun) navigate({screen:'create', class:lastRun.klass, race:lastRun.race, seed:lastRun.seed})"],
  ["menu action: last build button", ">Last Build</button>"],
  ["menu tooltip: quick start intent", "title='A · random class/race/seed'"],
  ["menu tooltip: daily challenge intent", "title='D · launch daily challenge now'"],
  ["create hotkey: Y apply last run", "if((ev.key==='y' || ev.key==='Y') && lastRun){"],
  ["create hotkey: L start last run", "if((ev.key==='l' || ev.key==='L') && lastRun) navigate({screen:'game', class:lastRun.klass, race:lastRun.race, seed:lastRun.seed})"],
  ["create action: start daily preset button", ">Start Daily Preset</button>"],
  ["records action: play daily", ">Play Daily Challenge</button>"],
  ["records action: open daily in create", ">Open Daily in Create</button>"],
  ["records hint strip", "Quick keys:"],
]

const failures = checks.filter(([, needle]) => !src.includes(needle))

if (failures.length) {
  console.error('UI smoke checks failed:')
  for (const [name] of failures) console.error(`- ${name}`)
  process.exit(1)
}

console.log(`UI smoke checks passed (${checks.length} checks).`)
