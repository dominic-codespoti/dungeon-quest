import type {GameSnapshot, PlayerAction, GameEvent, Entity, Coord, PlayerClass, GeneratedItem, Rarity} from './types'
import eventBus from './eventBus'

function rng(seed:number){
  let s = seed >>> 0
  return ()=>{ s = Math.imul(1664525, s) + 1013904223 | 0; return ((s >>> 0) / 4294967296) }
}

const key = (p:Coord)=> `${p.x},${p.y}`

export class Engine{
  tick = 0
  floor = 1
  floorModifier: 'none'|'brute-heavy'|'swarm'|'scarce-potions' = 'none'
  playerClass: PlayerClass
  width:number
  height:number
  entities: Entity[] = []
  events: GameEvent[] = []
  walls = new Set<string>()
  score = 0
  attackBonus = 0
  defenseBonus = 0
  dashCooldown = 0
  guardCooldown = 0
  guardActive = false
  gameOver = false
  outcome: 'victory'|'defeat'|undefined
  private rand: ()=>number

  constructor(width=30,height=30,seed=1,playerClass:PlayerClass='knight'){
    this.width = width
    this.height = height
    this.playerClass = playerClass
    this.rand = rng(seed)
    this.setupFloor(true)
  }

  private setupFloor(initial=false){
    const currentHp = this.entities.find(e=>e.id==='p')?.hp ?? 12
    const preservedHp = initial ? 12 : Math.min(12, currentHp + 1)

    this.floorModifier = this.getModifierForFloor(this.floor)

    this.entities = [{id:'p',type:'player',pos:{x:Math.floor(this.width/2),y:Math.floor(this.height/2)},hp:preservedHp}]
    this.dashCooldown = 0
    this.guardCooldown = 0
    this.guardActive = false
    this.walls = new Set<string>()
    this.generateWalls()

    const baseCount = 4
    const scaledCount = baseCount + Math.floor((this.floor - 1) * 1.5)
    const monsterCount = Math.min(12, scaledCount + (this.floorModifier==='swarm' ? 2 : 0))

    const threatCap = 8 + this.floor * 1.8
    let threat = 0

    for(let i=0;i<monsterCount;i++){
      const kind = this.rollMonsterKind()
      const hp = kind==='brute' ? 7 + Math.floor((this.floor-1)/2) : kind==='chaser' ? 4 + Math.floor((this.floor-1)/3) : 3 + Math.floor((this.floor-1)/3)
      const cost = kind==='brute' ? 2.4 : kind==='chaser' ? 1.5 : 1.2
      if(i>1 && threat + cost > threatCap) continue
      this.spawnMonster(`m${this.floor}-${i+1}`,kind,hp)
      threat += cost
    }

    const potionCount = this.floorModifier==='scarce-potions' ? 0 : this.floor>=4 ? 2 : 1
    for(let i=0;i<potionCount;i++) this.spawnItem(`i${this.floor}-p${i+1}`,'potion')
    this.spawnItem(`i${this.floor}-r1`,'relic')

    // Item variety pass: utility + risk/reward pickups.
    if(this.floor % 2 === 0) this.spawnItem(`i${this.floor}-e1`,'elixir')
    if(this.floor >= 3 && this.rand() < 0.5) this.spawnItem(`i${this.floor}-c1`,'cursed-idol')

    // Generated gear system (item classes + rarity + enchantments)
    const gearDrops = this.floor >= 2 ? 2 : 1
    for(let i=0;i<gearDrops;i++) this.spawnItem(`i${this.floor}-g${i+1}`,'gear')

    if(!initial){
      this.emit({tick:this.tick,type:'floor',payload:{floor:this.floor,modifier:this.floorModifier}})
    }
    this.emit({
      tick:this.tick,
      type:'init',
      payload:{floor:this.floor,modifier:this.floorModifier,playerClass:this.playerClass,width:this.width,height:this.height,walls:this.getWalls(),entities:this.entities}
    })
  }

  private getModifierForFloor(floor:number): 'none'|'brute-heavy'|'swarm'|'scarce-potions' {
    if(floor < 2) return 'none'
    if(floor % 4 === 0) return 'brute-heavy'
    if(floor % 3 === 0) return 'scarce-potions'
    if(floor % 2 === 0) return 'swarm'
    return 'none'
  }

  private rollMonsterKind(): 'chaser'|'brute'|'skitter' {
    const pick = this.rand()
    if(this.floorModifier==='brute-heavy') return pick < 0.45 ? 'brute' : pick < 0.75 ? 'chaser' : 'skitter'
    if(this.floorModifier==='swarm') return pick < 0.2 ? 'brute' : pick < 0.5 ? 'chaser' : 'skitter'
    return pick < 0.5 ? 'chaser' : pick < 0.8 ? 'skitter' : 'brute'
  }

  private rollRarity(): Rarity {
    const r = this.rand()
    if(r < 0.55) return 'common'
    if(r < 0.82) return 'magic'
    if(r < 0.95) return 'rare'
    return 'epic'
  }

  private generateGear(): GeneratedItem {
    const itemClass = this.rand() < 0.5 ? 'weapon' : 'armor'
    const rarity = this.rollRarity()
    const tier = rarity==='common' ? 1 : rarity==='magic' ? 2 : rarity==='rare' ? 3 : 4

    if(itemClass==='weapon'){
      const bases = ['Sword','Dagger','Spear','Mace']
      const baseType = bases[Math.floor(this.rand()*bases.length)] ?? 'Sword'
      const atkBonus = tier + Math.floor(this.floor/3)
      const enchants = [
        'Keen (+1 atk)',
        'Vicious (+1 dash dmg)',
        'Balanced (-1 skill cooldown chance)'
      ]
      const enchantments = rarity==='common' ? [] : [enchants[Math.floor(this.rand()*enchants.length)] ?? 'Keen (+1 atk)']
      return {
        itemClass, baseType, rarity,
        name: `${rarity.toUpperCase()} ${baseType}`,
        atkBonus,
        defBonus: 0,
        hpBonus: rarity==='epic' ? 2 : 0,
        scoreValue: 80 + tier*40,
        enchantments
      }
    }

    const bases = ['Leather','Chainmail','Plate','Cloak']
    const baseType = bases[Math.floor(this.rand()*bases.length)] ?? 'Leather'
    const defBonus = Math.max(1, tier-1) + Math.floor(this.floor/4)
    const enchants = [
      'Fortified (+1 def)',
      'Stalwart (+1 max hp)',
      'Shadowwoven (evasion vibe)'
    ]
    const enchantments = rarity==='common' ? [] : [enchants[Math.floor(this.rand()*enchants.length)] ?? 'Fortified (+1 def)']
    return {
      itemClass, baseType, rarity,
      name: `${rarity.toUpperCase()} ${baseType}`,
      atkBonus: 0,
      defBonus,
      hpBonus: rarity==='epic' ? 2 : (rarity==='rare' ? 1 : 0),
      scoreValue: 80 + tier*40,
      enchantments
    }
  }

  private generateWalls(){
    const center = {x:Math.floor(this.width/2), y:Math.floor(this.height/2)}
    const densityBoost = this.floorModifier==='swarm' ? -0.01 : this.floorModifier==='brute-heavy' ? 0.015 : 0
    const density = Math.min(0.22, Math.max(0.08, 0.1 + (this.floor - 1) * 0.012 + densityBoost))
    for(let y=0; y<this.height; y++){
      for(let x=0; x<this.width; x++){
        const isBorder = x===0 || y===0 || x===this.width-1 || y===this.height-1
        if(isBorder){
          this.walls.add(key({x,y}))
          continue
        }
        const nearStart = Math.abs(x-center.x) + Math.abs(y-center.y) <= 3
        if(!nearStart && this.rand() < density){
          this.walls.add(key({x,y}))
        }
      }
    }
  }

  private getWalls(): Coord[]{
    return [...this.walls].map(k=>{
      const parts = k.split(',')
      return {x: Number(parts[0] ?? 0), y: Number(parts[1] ?? 0)}
    })
  }

  private isWall(pos:Coord){ return this.walls.has(key(pos)) }

  private isOccupiedByEntity(pos:Coord, exceptId?:string){
    return this.entities.some(e=>e.id!==exceptId && e.pos.x===pos.x && e.pos.y===pos.y)
  }

  private hasPath(start:Coord, goal:Coord){
    if(this.isWall(start) || this.isWall(goal)) return false
    const q: Coord[] = [start]
    const seen = new Set<string>([key(start)])
    while(q.length){
      const cur = q.shift()!
      if(cur.x===goal.x && cur.y===goal.y) return true
      const neighbors: Coord[] = [{x:cur.x+1,y:cur.y},{x:cur.x-1,y:cur.y},{x:cur.x,y:cur.y+1},{x:cur.x,y:cur.y-1}]
      for(const n of neighbors){
        if(n.x<0 || n.x>=this.width || n.y<0 || n.y>=this.height) continue
        if(this.isWall(n)) continue
        const nk = key(n)
        if(seen.has(nk)) continue
        seen.add(nk)
        q.push(n)
      }
    }
    return false
  }

  private spawnFreePos(minPlayerDistance=4){
    const player = this.entities.find(e=>e.id==='p')
    let tries = 0
    while(tries < 1200){
      tries++
      const pos = {x:Math.floor(this.rand()*this.width), y:Math.floor(this.rand()*this.height)}
      const occupied = this.isOccupiedByEntity(pos)
      const nearPlayer = player ? (Math.abs(pos.x-player.pos.x) + Math.abs(pos.y-player.pos.y) < minPlayerDistance) : false
      const reachable = player ? this.hasPath(player.pos, pos) : true
      if(!occupied && !nearPlayer && !this.isWall(pos) && reachable) return pos
    }
    return {x:Math.floor(this.width/2)+1,y:Math.floor(this.height/2)}
  }

  private spawnMonster(id:string,kind:'chaser'|'brute'|'skitter',hp:number){
    this.entities.push({id,type:'monster',kind,pos:this.spawnFreePos(5),hp})
  }

  private spawnItem(id:string,kind:'potion'|'relic'|'stairs'|'elixir'|'cursed-idol'|'gear'){
    const loot = kind==='gear' ? this.generateGear() : undefined
    this.entities.push({id,type:'item',kind,pos:this.spawnFreePos(kind==='stairs' ? 6 : 3), ...(loot ? {loot} : {})})
  }

  private nextStepToward(start:Coord, goal:Coord, blockerId?:string): Coord | null {
    if(start.x===goal.x && start.y===goal.y) return null
    const q: Coord[] = [start]
    const prev = new Map<string, string>()
    const seen = new Set<string>([key(start)])
    while(q.length){
      const cur = q.shift()!
      if(cur.x===goal.x && cur.y===goal.y) break
      const neighbors: Coord[] = [{x:cur.x+1,y:cur.y},{x:cur.x-1,y:cur.y},{x:cur.x,y:cur.y+1},{x:cur.x,y:cur.y-1}]
      for(const n of neighbors){
        if(n.x<0 || n.x>=this.width || n.y<0 || n.y>=this.height) continue
        if(this.isWall(n)) continue
        const nk = key(n)
        if(seen.has(nk)) continue
        const occ = this.entities.find(e=>e.id!==blockerId && e.pos.x===n.x && e.pos.y===n.y)
        if(occ && !(n.x===goal.x && n.y===goal.y && occ.type==='player')) continue
        seen.add(nk)
        prev.set(nk, key(cur))
        q.push(n)
      }
    }
    const goalKey = key(goal)
    if(!prev.has(goalKey)) return null
    let curKey = goalKey
    let prior = prev.get(curKey)
    while(prior && prior !== key(start)){ curKey = prior; prior = prev.get(curKey) }
    const [x,y] = curKey.split(',').map(Number)
    return {x:x ?? start.x, y:y ?? start.y}
  }

  getState(): GameSnapshot{
    return {
      tick:this.tick,
      floor:this.floor,
      floorModifier:this.floorModifier,
      playerClass:this.playerClass,
      width:this.width,
      height:this.height,
      walls:this.getWalls(),
      entities:JSON.parse(JSON.stringify(this.entities)),
      score:this.score,
      attackBonus:this.attackBonus,
      defenseBonus:this.defenseBonus,
      dashCooldown:this.dashCooldown,
      guardCooldown:this.guardCooldown,
      guardActive:this.guardActive,
      gameOver:this.gameOver,
      ...(this.outcome ? { outcome: this.outcome } : {})
    }
  }

  private emit(ev:GameEvent){ this.events.push(ev); eventBus.publish(ev) }

  private trySpawnStairs(){
    const monstersLeft = this.entities.filter(e=>e.type==='monster').length
    const hasStairs = this.entities.some(e=>e.type==='item' && e.kind==='stairs')
    if(monstersLeft===0 && !hasStairs){
      this.spawnItem(`i${this.floor}-stairs`,'stairs')
      this.emit({tick:this.tick,type:'stairs_spawned',payload:{floor:this.floor}})
    }
  }

  step(action: PlayerAction){
    if(this.gameOver) return this.getState()
    this.tick++
    if(this.dashCooldown > 0) this.dashCooldown--
    if(this.guardCooldown > 0) this.guardCooldown--

    const player = this.entities.find(e=>e.type==='player')
    if(!player) throw new Error('no player')

    const d:Record<'up'|'down'|'left'|'right',Coord>={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}
    const stepInto = (nd:Coord, moveType:'move'|'dash'):{changedFloor:boolean, stopped:boolean} => {
      if(nd.x<0 || nd.x>=this.width || nd.y<0 || nd.y>=this.height) return {changedFloor:false,stopped:true}
      if(this.isWall(nd)){ this.emit({tick:this.tick,type:'bump',payload:{id:'p',to:nd,reason:'wall'}}); return {changedFloor:false,stopped:true} }

      const occ = this.entities.find(e=>e.pos.x===nd.x && e.pos.y===nd.y && e.id!=='p')
      if(occ?.type==='monster'){
        const damage = (moveType==='dash' ? 5 : 3) + this.attackBonus
        occ.hp = (occ.hp||1) - damage
        this.emit({tick:this.tick,type:'combat',payload:{attacker:'p',target:occ.id,damage,via:moveType}})
        if((occ.hp||0) <=0){
          this.emit({tick:this.tick,type:'die',payload:{id:occ.id,kind:occ.kind}})
          this.entities = this.entities.filter(e=>e.id!==occ.id)
          this.score += occ.kind==='brute' ? 180 : occ.kind==='skitter' ? 120 : 100
          if(this.playerClass==='rogue' && moveType==='dash'){
            this.dashCooldown = Math.max(0, this.dashCooldown - 1)
            this.emit({tick:this.tick,type:'dash_refresh',payload:{cooldown:this.dashCooldown}})
          }
        }
        return {changedFloor:false,stopped:true}
      }

      player.pos = nd
      if(occ?.type==='item'){
        if(occ.kind==='potion'){
          player.hp = Math.min(12, (player.hp||0) + 4)
          this.score += 25
          this.emit({tick:this.tick,type:'pickup',payload:{id:occ.id,kind:occ.kind}})
          this.entities = this.entities.filter(e=>e.id!==occ.id)
        }
        else if(occ.kind==='relic'){
          this.score += 200
          this.emit({tick:this.tick,type:'pickup',payload:{id:occ.id,kind:occ.kind}})
          this.entities = this.entities.filter(e=>e.id!==occ.id)
        }
        else if(occ.kind==='elixir'){
          player.hp = Math.min(12, (player.hp||0) + 2)
          this.dashCooldown = Math.max(0, this.dashCooldown - 1)
          this.guardCooldown = Math.max(0, this.guardCooldown - 1)
          this.score += 60
          this.emit({tick:this.tick,type:'pickup',payload:{id:occ.id,kind:occ.kind,effects:['heal+2','cooldowns-1']}})
          this.entities = this.entities.filter(e=>e.id!==occ.id)
        }
        else if(occ.kind==='cursed-idol'){
          player.hp = (player.hp||0) - 2
          this.score += 350
          this.emit({tick:this.tick,type:'pickup',payload:{id:occ.id,kind:occ.kind,effects:['hp-2','score+350']}})
          this.entities = this.entities.filter(e=>e.id!==occ.id)
        }
        else if(occ.kind==='gear'){
          const gear = occ.loot
          if(gear){
            this.attackBonus += gear.atkBonus
            this.defenseBonus += gear.defBonus
            player.hp = Math.min(12 + gear.hpBonus, (player.hp||0) + gear.hpBonus)
            this.score += gear.scoreValue
            this.emit({tick:this.tick,type:'pickup',payload:{id:occ.id,kind:occ.kind,gear}})
          } else {
            this.emit({tick:this.tick,type:'pickup',payload:{id:occ.id,kind:occ.kind}})
          }
          this.entities = this.entities.filter(e=>e.id!==occ.id)
        }
        else if(occ.kind==='stairs'){
          this.score += 150 + this.floor * 25
          this.emit({tick:this.tick,type:'stairs_used',payload:{fromFloor:this.floor,toFloor:this.floor+1}})
          this.floor += 1
          this.setupFloor(false)
          return {changedFloor:true,stopped:true}
        }
      }
      this.emit({tick:this.tick,type:'move',payload:{id:'p',to:nd,via:moveType}})
      return {changedFloor:false,stopped:false}
    }

    if(action.type==='move'){
      const delta = d[action.dir]
      const res = stepInto({x:player.pos.x + delta.x, y: player.pos.y + delta.y},'move')
      if(res.changedFloor) return this.getState()
    } else if(action.type==='dash'){
      if(this.playerClass!=='rogue') this.emit({tick:this.tick,type:'skill_blocked',payload:{skill:'dash',class:this.playerClass}})
      else if(this.dashCooldown>0) this.emit({tick:this.tick,type:'dash_blocked',payload:{cooldown:this.dashCooldown}})
      else {
        const delta = d[action.dir]
        this.dashCooldown = 4
        this.emit({tick:this.tick,type:'dash_used',payload:{dir:action.dir,cooldown:this.dashCooldown}})
        for(let i=0;i<2;i++){
          const res = stepInto({x:player.pos.x + delta.x, y: player.pos.y + delta.y},'dash')
          if(res.changedFloor) return this.getState()
          if(res.stopped) break
        }
      }
    } else if(action.type==='guard'){
      if(this.playerClass!=='knight') this.emit({tick:this.tick,type:'skill_blocked',payload:{skill:'guard',class:this.playerClass}})
      else if(this.guardCooldown>0) this.emit({tick:this.tick,type:'guard_blocked',payload:{cooldown:this.guardCooldown}})
      else { this.guardActive = true; this.guardCooldown = 5; this.emit({tick:this.tick,type:'guard_used',payload:{cooldown:this.guardCooldown}}) }
    } else if(action.type==='bash'){
      if(this.playerClass!=='knight') this.emit({tick:this.tick,type:'skill_blocked',payload:{skill:'bash',class:this.playerClass}})
      else {
        const delta = d[action.dir]
        const target = {x:player.pos.x + delta.x, y:player.pos.y + delta.y}
        const occ = this.entities.find(e=>e.type==='monster' && e.pos.x===target.x && e.pos.y===target.y)
        if(!occ){ this.emit({tick:this.tick,type:'bash_miss'}) }
        else {
          const bashDmg = 3 + Math.floor(this.attackBonus/2)
          occ.hp = (occ.hp||1) - bashDmg
          const push = {x:target.x + delta.x, y:target.y + delta.y}
          const canPush = !this.isWall(push) && !this.entities.some(e=>e.id!==occ.id && e.pos.x===push.x && e.pos.y===push.y)
          if(canPush) occ.pos = push
          this.emit({tick:this.tick,type:'combat',payload:{attacker:'p',target:occ.id,damage:bashDmg,via:'bash',pushed:canPush}})
          if((occ.hp||0) <=0){
            this.emit({tick:this.tick,type:'die',payload:{id:occ.id,kind:occ.kind}})
            this.entities = this.entities.filter(e=>e.id!==occ.id)
            this.score += occ.kind==='brute' ? 180 : occ.kind==='skitter' ? 120 : 100
          }
        }
      }
    } else {
      this.emit({tick:this.tick,type:'wait'})
    }

    const playerPos = player.pos
    const monsters = this.entities.filter(e=>e.type==='monster')
    monsters.forEach(m=>{
      const kind = m.kind || 'chaser'
      const attacks = kind==='skitter' && this.tick % 3 === 0 ? 0 : 1
      if(attacks===0) return

      const dx = playerPos.x - m.pos.x
      const dy = playerPos.y - m.pos.y
      const distance = Math.abs(dx)+Math.abs(dy)
      if(distance===1){
        let dmg = kind==='brute' ? 2 : 1
        dmg = Math.max(0, dmg - this.defenseBonus)
        if(this.guardActive){ dmg = Math.max(0, dmg-1); this.guardActive = false; this.emit({tick:this.tick,type:'guard_triggered'}) }
        player.hp = (player.hp||0) - dmg
        this.emit({tick:this.tick,type:'combat',payload:{attacker:m.id,target:'p',damage:dmg,kind}})
        return
      }

      const pathStep = this.nextStepToward(m.pos, playerPos, m.id)
      if(pathStep){ m.pos = pathStep; this.emit({tick:this.tick,type:'move',payload:{id:m.id,to:pathStep,via:'path'}}); return }

      const movePref: Coord[] = []
      if(kind==='skitter') movePref.push({x:Math.sign(dy),y:0},{x:0,y:Math.sign(dx)},{x:Math.sign(dx),y:0},{x:0,y:Math.sign(dy)})
      else if(kind==='brute') movePref.push({x:Math.sign(dx),y:0},{x:0,y:Math.sign(dy)})
      else { const stepX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0; const stepY = stepX===0 ? Math.sign(dy) : 0; movePref.push({x:stepX,y:stepY},{x:Math.sign(dx),y:0},{x:0,y:Math.sign(dy)}) }

      for(const step of movePref){
        const nd = {x:m.pos.x + step.x, y:m.pos.y + step.y}
        if(nd.x<0 || nd.x>=this.width || nd.y<0 || nd.y>=this.height) continue
        if(this.isWall(nd)) continue
        const occ = this.entities.find(e=>e.id!==m.id && e.pos.x===nd.x && e.pos.y===nd.y)
        if(!occ){ m.pos = nd; this.emit({tick:this.tick,type:'move',payload:{id:m.id,to:nd}}); break }
      }
    })

    this.trySpawnStairs()
    if((player.hp||0)<=0){ this.gameOver = true; this.outcome = 'defeat'; this.emit({tick:this.tick,type:'defeat',payload:{reason:'player_dead',score:this.score,floor:this.floor}}) }
    return this.getState()
  }
}

export default Engine
