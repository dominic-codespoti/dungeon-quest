import type {GameSnapshot, PlayerAction, GameEvent, Entity, Coord, Dir, PlayerClass, PlayerRace, GeneratedItem, Rarity} from './types'
import eventBus from './eventBus'

function rng(seed:number){
  let s = seed >>> 0
  return ()=>{ s = Math.imul(1664525, s) + 1013904223 | 0; return ((s >>> 0) / 4294967296) }
}

const key = (p:Coord)=> `${p.x},${p.y}`

export class Engine{
  tick = 0
  floor = 1
  floorModifier: 'none'|'brute-heavy'|'swarm'|'scarce-potions'|'ambush' = 'none'
  playerClass: PlayerClass
  playerRace: PlayerRace
  width:number
  height:number
  entities: Entity[] = []
  events: GameEvent[] = []
  walls = new Set<string>()
  score = 0
  killStreak = 0
  streakRewardClaimed = false
  attackBonus = 0
  defenseBonus = 0
  maxHp = 12
  inventory: GeneratedItem[] = []
  visible = new Set<string>()
  discovered = new Set<string>()
  dashCooldown = 0
  backstepCooldown = 0
  guardCooldown = 0
  guardActive = false
  bossCharged = new Set<string>()
  gameOver = false
  outcome: 'victory'|'defeat'|undefined
  private rand: ()=>number

  constructor(width=30,height=30,seed=1,playerClass:PlayerClass='knight', playerRace:PlayerRace='human'){
    this.width = width
    this.height = height
    this.playerClass = playerClass
    this.playerRace = playerRace
    this.rand = rng(seed)
    this.applyRaceBonuses()
    this.setupFloor(true)
  }

  private applyRaceBonuses(){
    // Baseline
    this.maxHp = 12
    if(this.playerRace==='human'){
      this.attackBonus += 1
      this.defenseBonus += 1
    } else if(this.playerRace==='elf'){
      // Mobility-focused race bonus
      this.dashCooldown = Math.max(0, this.dashCooldown - 1)
      this.maxHp = 11
    } else if(this.playerRace==='dwarf'){
      this.maxHp = 14
      this.defenseBonus += 1
    }
  }

  private classScalingBonusForFloor(floor:number){
    const tier = Math.max(0, Math.floor((floor-1)/2))
    if(this.playerClass==='rogue'){
      return {
        attack: tier>=2 ? 1 : 0,
        defense: tier>=4 ? 1 : 0,
        dashCooldownBonus: tier>=1 ? 1 : 0,
        backstepCooldownBonus: tier>=3 ? 1 : 0,
      }
    }
    // Knight scaling: steadier defensive growth with modest offense.
    return {
      attack: tier>=3 ? 1 : 0,
      defense: Math.min(2, Math.floor(tier/2)),
      dashCooldownBonus: 0,
      backstepCooldownBonus: 0,
    }
  }

  private buildStartingGear(): GeneratedItem[]{
    if(this.playerClass==='rogue'){
      const base: GeneratedItem[] = [
        {itemClass:'weapon', baseType:'Dagger', rarity:'common', name:'Rogue Dagger', atkBonus:1, defBonus:0, hpBonus:0, scoreValue:30, enchantments:['Quickdraw'], equipped:true},
        {itemClass:'armor', baseType:'Leather', rarity:'common', name:'Leather Jerkin', atkBonus:0, defBonus:1, hpBonus:0, scoreValue:30, enchantments:['Lightweight'], equipped:true},
      ]
      return base
    }
    return [
      {itemClass:'weapon', baseType:'Short Sword', rarity:'common', name:'Short Sword', atkBonus:1, defBonus:0, hpBonus:0, scoreValue:30, enchantments:['Tempered'], equipped:true},
      {itemClass:'armor', baseType:'Leather Armor', rarity:'common', name:'Leather Armor', atkBonus:0, defBonus:1, hpBonus:0, scoreValue:30, enchantments:['Stitched'], equipped:true},
    ]
  }

  private setupFloor(initial=false){
    const currentHp = this.entities.find(e=>e.id==='p')?.hp ?? this.maxHp
    const preservedHp = initial ? this.maxHp : Math.min(this.maxHp, currentHp + 1)

    this.floorModifier = this.getModifierForFloor(this.floor)

    this.entities = [{id:'p',type:'player',pos:{x:Math.floor(this.width/2),y:Math.floor(this.height/2)},hp:preservedHp}]
    if(initial){
      this.attackBonus = 0
      this.defenseBonus = 0
      this.inventory = []
      this.discovered.clear()
      this.applyRaceBonuses()
      const player = this.entities.find(e=>e.id==='p')
      if(player){
        for(const gear of this.buildStartingGear()) this.equipGear(gear, player)
      }
    } else {
      const player = this.entities.find(e=>e.id==='p')
      const s = this.classScalingBonusForFloor(this.floor)
      this.attackBonus += s.attack
      this.defenseBonus += s.defense
      this.emit({tick:this.tick,type:'class_scaling',payload:{floor:this.floor,playerClass:this.playerClass,attack:s.attack,defense:s.defense,dash:s.dashCooldownBonus,backstep:s.backstepCooldownBonus}})
      if(player && (s.attack || s.defense)){
        this.emit({tick:this.tick,type:'status',payload:{text:`${this.playerClass} scaling applied (+${s.attack} atk, +${s.defense} def)`}})
      }
    }
    this.dashCooldown = 0
    this.backstepCooldown = 0
    this.guardCooldown = 0
    this.guardActive = false
    this.bossCharged.clear()
    this.streakRewardClaimed = false
    this.discovered.clear()
    this.walls = new Set<string>()
    this.generateWalls()

    const baseCount = 4
    const scaledCount = baseCount + Math.floor((this.floor - 1) * 1.5)
    const monsterCount = Math.min(12, scaledCount + (this.floorModifier==='swarm' ? 2 : 0))

    const threatCap = 8 + this.floor * 1.8 + (this.floorModifier==='ambush' ? 1.2 : 0)
    let threat = 0

    for(let i=0;i<monsterCount;i++){
      const kind = this.rollMonsterKind()
      const hp = kind==='brute' ? 7 + Math.floor((this.floor-1)/2) : kind==='chaser' ? 4 + Math.floor((this.floor-1)/3) : kind==='spitter' ? 4 + Math.floor((this.floor-1)/4) : kind==='sentinel' ? 8 + Math.floor((this.floor-1)/3) : 3 + Math.floor((this.floor-1)/3)
      const cost = kind==='brute' ? 2.4 : kind==='chaser' ? 1.5 : kind==='spitter' ? 1.8 : kind==='sentinel' ? 2.6 : 1.2
      if(i>1 && threat + cost > threatCap) continue
      const minDist = this.floorModifier==='ambush'
        ? (i===0 ? 3 : 4)
        : this.floor===1
        ? (i===0 ? 2 : 3)
        : this.floor===2
        ? 4
        : 5
      this.spawnMonster(`m${this.floor}-${i+1}`,kind,hp,minDist)
      threat += cost
    }

    this.enforceAmbushRangedThreat()
    this.applyEncounterTemplate()

    // Mini-boss prototype: every 3rd floor gets one heavy elite.
    if(this.floor >= 3 && this.floor % 3 === 0){
      const bossHp = 14 + this.floor
      this.spawnMonster(`boss-${this.floor}`,'boss',bossHp)
      this.spawnItem(`i${this.floor}-vault-${this.tick}`,'chest')
      this.emit({tick:this.tick,type:'boss_spawned',payload:{floor:this.floor,hp:bossHp}})
      this.emit({tick:this.tick,type:'vault_spawned',payload:{floor:this.floor,reward:'chest'}})
    }

    const potionCount = this.floorModifier==='scarce-potions' ? 0 : this.floor>=4 ? 2 : 1
    for(let i=0;i<potionCount;i++) this.spawnItem(`i${this.floor}-p${i+1}`,'potion')
    this.spawnItem(`i${this.floor}-r1`,'relic')
    if(this.floorModifier==='scarce-potions') this.spawnItem(`i${this.floor}-cache1`,'chest')

    // Item variety pass: utility + risk/reward pickups.
    if(this.floor % 2 === 0) this.spawnItem(`i${this.floor}-e1`,'elixir')
    if(this.floor >= 3 && this.rand() < 0.5) this.spawnItem(`i${this.floor}-c1`,'cursed-idol')
    if(this.floor >= 2 && this.rand() < 0.45) this.spawnItem(`i${this.floor}-b1`,'bomb')
    if(this.floor >= 2 && this.rand() < 0.35) this.spawnItem(`i${this.floor}-s1`,'blink-shard')
    if(this.floor >= 3 && this.rand() < 0.25) this.spawnItem(`i${this.floor}-c2`,'chest')
    if(this.floor >= 4 && this.rand() < 0.22) this.spawnItem(`i${this.floor}-h1`,'shrine')
    if(this.floor >= 5 && this.rand() < 0.18) this.spawnItem(`i${this.floor}-f1`,'fountain')
    if(this.floor >= 5 && this.rand() < 0.2) this.spawnItem(`i${this.floor}-r1`,'rift-orb')

    // Generated gear system (item classes + rarity + enchantments)
    const gearDrops = this.floor >= 2 ? 2 : 1
    for(let i=0;i<gearDrops;i++) this.spawnItem(`i${this.floor}-g${i+1}`,'gear')

    this.updateVision()
    const monstersNow = this.entities.filter(e=>e.type==='monster').length
    const itemsNow = this.entities.filter(e=>e.type==='item').length
    if(!initial){
      this.emit({tick:this.tick,type:'floor',payload:{floor:this.floor,modifier:this.floorModifier}})
      this.emit({tick:this.tick,type:'floor_brief',payload:{floor:this.floor,modifier:this.floorModifier,monsters:monstersNow,items:itemsNow}})
      const modHint = this.floorModifier==='ambush'
        ? 'Ambush floor: expect pincer packs and rear pressure.'
        : this.floorModifier==='brute-heavy'
        ? 'Brute-heavy floor: stronger frontline enemies.'
        : this.floorModifier==='scarce-potions'
        ? 'Scarce-potions floor: healing is limited.'
        : this.floorModifier==='swarm'
        ? 'Swarm floor: higher enemy count, lower individual threat.'
        : ''
      if(modHint) this.emit({tick:this.tick,type:'modifier_hint',payload:{floor:this.floor,modifier:this.floorModifier,text:modHint}})
    }
    this.emit({
      tick:this.tick,
      type:'init',
      payload:{floor:this.floor,modifier:this.floorModifier,playerClass:this.playerClass,playerRace:this.playerRace,width:this.width,height:this.height,walls:this.getWalls(),entities:this.entities}
    })
  }

  private getModifierForFloor(floor:number): 'none'|'brute-heavy'|'swarm'|'scarce-potions'|'ambush' {
    if(floor < 2) return 'none'
    if(floor % 5 === 0) return 'ambush'
    if(floor % 4 === 0) return 'brute-heavy'
    if(floor % 3 === 0) return 'scarce-potions'
    if(floor % 2 === 0) return 'swarm'
    return 'none'
  }

  private rollMonsterKind(): 'chaser'|'brute'|'skitter'|'spitter'|'sentinel' {
    const pick = this.rand()
    if(this.floor >= 6 && pick > 0.92) return 'sentinel'
    if(this.floor >= 4 && pick > 0.82) return 'spitter'
    if(this.floorModifier==='ambush') return pick < 0.2 ? 'brute' : pick < 0.42 ? 'chaser' : pick < 0.74 ? 'skitter' : pick < 0.9 ? 'spitter' : 'sentinel'
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
    // Room-and-corridor generator: fill with walls, then carve rooms.
    this.walls.clear()
    for(let y=0; y<this.height; y++) for(let x=0; x<this.width; x++) this.walls.add(key({x,y}))

    const rooms: Array<{x:number,y:number,w:number,h:number,cx:number,cy:number}> = []
    const roomAttempts = 80
    const targetRooms = 8 + Math.min(4, Math.floor(this.floor/2))

    const carve = (x:number,y:number)=>{
      if(x<=0 || y<=0 || x>=this.width-1 || y>=this.height-1) return
      this.walls.delete(key({x,y}))
    }
    const carveRoom = (rx:number,ry:number,rw:number,rh:number)=>{
      for(let y=ry;y<ry+rh;y++) for(let x=rx;x<rx+rw;x++) carve(x,y)
    }
    const carveTunnel = (ax:number,ay:number,bx:number,by:number)=>{
      if(this.rand() < 0.5){
        for(let x=Math.min(ax,bx); x<=Math.max(ax,bx); x++) carve(x,ay)
        for(let y=Math.min(ay,by); y<=Math.max(ay,by); y++) carve(bx,y)
      } else {
        for(let y=Math.min(ay,by); y<=Math.max(ay,by); y++) carve(ax,y)
        for(let x=Math.min(ax,bx); x<=Math.max(ax,bx); x++) carve(x,by)
      }
    }

    for(let i=0;i<roomAttempts && rooms.length<targetRooms;i++){
      const rw = 4 + Math.floor(this.rand()*6)
      const rh = 4 + Math.floor(this.rand()*6)
      const rx = 1 + Math.floor(this.rand()*(this.width-rw-2))
      const ry = 1 + Math.floor(this.rand()*(this.height-rh-2))
      const overlaps = rooms.some(r => rx < r.x+r.w+1 && rx+rw+1 > r.x && ry < r.y+r.h+1 && ry+rh+1 > r.y)
      if(overlaps) continue
      carveRoom(rx,ry,rw,rh)
      const room = {x:rx,y:ry,w:rw,h:rh,cx:rx+Math.floor(rw/2),cy:ry+Math.floor(rh/2)}
      if(rooms.length>0){
        const p = rooms[rooms.length-1]!
        carveTunnel(p.cx,p.cy,room.cx,room.cy)
      }
      rooms.push(room)
    }

    if(rooms.length===0){
      for(let y=1;y<this.height-1;y++) for(let x=1;x<this.width-1;x++) if(this.rand() > 0.12) this.walls.delete(key({x,y}))
    }

    const player = this.entities.find(e=>e.id==='p')
    if(player){
      if(rooms.length>0) player.pos = {x:rooms[0]!.cx,y:rooms[0]!.cy}
      else player.pos = {x:Math.floor(this.width/2), y:Math.floor(this.height/2)}
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

  private spawnMonster(id:string,kind:'chaser'|'brute'|'skitter'|'spitter'|'sentinel'|'boss',hp:number,minPlayerDistance=5){
    this.entities.push({id,type:'monster',kind,pos:this.spawnFreePos(minPlayerDistance),hp})
  }

  private tryRepositionMonster(monster: Entity, desired: Coord, minPlayerDistance=3){
    const player = this.entities.find(e=>e.id==='p')
    if(!player) return false
    const trySpot = (spot:Coord)=>{
      if(spot.x<0 || spot.x>=this.width || spot.y<0 || spot.y>=this.height) return false
      if(this.isWall(spot)) return false
      const d = Math.abs(spot.x-player.pos.x) + Math.abs(spot.y-player.pos.y)
      if(d < minPlayerDistance) return false
      const occ = this.entities.find(e=>e.id!==monster.id && e.pos.x===spot.x && e.pos.y===spot.y)
      if(occ) return false
      monster.pos = spot
      return true
    }

    if(trySpot(desired)) return true
    for(let r=1;r<=4;r++){
      for(let oy=-r; oy<=r; oy++){
        for(let ox=-r; ox<=r; ox++){
          if(Math.abs(ox)+Math.abs(oy)!==r) continue
          if(trySpot({x:desired.x+ox,y:desired.y+oy})) return true
        }
      }
    }
    return false
  }

  private enforceAmbushRangedThreat(){
    if(this.floorModifier!=='ambush') return
    const monsters = this.entities.filter(e=>e.type==='monster' && e.kind!=='boss')
    if(monsters.length===0) return
    const hasRanged = monsters.some(m=>m.kind==='spitter' || m.kind==='sentinel')
    if(hasRanged) return

    const target = monsters.find(m=>m.kind==='skitter' || m.kind==='chaser') || monsters[0]
    if(!target) return
    target.kind = this.floor >= 7 ? 'sentinel' : 'spitter'
    const hpBase = target.kind==='sentinel' ? 8 + Math.floor((this.floor-1)/3) : 4 + Math.floor((this.floor-1)/4)
    target.hp = hpBase
  }

  private applyEncounterTemplate(){
    const player = this.entities.find(e=>e.id==='p')
    if(!player) return
    const monsters = this.entities.filter(e=>e.type==='monster' && e.kind!=='boss')
    if(monsters.length < 3) return

    const anchor = this.spawnFreePos(6)
    const byKind = (k:string)=> monsters.filter(m=>m.kind===k)

    if(this.floorModifier==='swarm'){
      const pattern: Coord[] = [
        {x:anchor.x,y:anchor.y}, {x:anchor.x+1,y:anchor.y}, {x:anchor.x-1,y:anchor.y}, {x:anchor.x,y:anchor.y+1},
        {x:anchor.x,y:anchor.y-1}, {x:anchor.x+1,y:anchor.y+1}
      ]
      monsters.slice(0, Math.min(pattern.length, monsters.length)).forEach((m,i)=> this.tryRepositionMonster(m, pattern[i]!, 4))
      return
    }

    if(this.floorModifier==='ambush'){
      const bait = byKind('chaser')[0] || byKind('brute')[0] || monsters[0]
      const left = byKind('skitter')[0] || monsters.find(m=>m.id!==bait?.id)
      const right = byKind('skitter').find(m=>m.id!==left?.id) || monsters.find(m=>m.id!==bait?.id && m.id!==left?.id)
      const ranged = byKind('spitter')[0] || byKind('sentinel')[0] || monsters.find(m=>m.id!==bait?.id && m.id!==left?.id && m.id!==right?.id)
      if(bait) this.tryRepositionMonster(bait, {x:anchor.x,y:anchor.y}, 4)
      if(left) this.tryRepositionMonster(left, {x:anchor.x-2,y:anchor.y+1}, 5)
      if(right) this.tryRepositionMonster(right, {x:anchor.x+2,y:anchor.y+1}, 5)
      if(ranged) this.tryRepositionMonster(ranged, {x:anchor.x,y:anchor.y-2}, 6)
      return
    }

    if(this.floorModifier==='brute-heavy'){
      const brute = byKind('brute')[0] || monsters[0]
      if(brute) this.tryRepositionMonster(brute, {x:anchor.x,y:anchor.y}, 4)
      const ranged = byKind('spitter')[0] || byKind('sentinel')[0] || monsters.find(m=>m.id!==brute?.id)
      if(ranged) this.tryRepositionMonster(ranged, {x:anchor.x+2,y:anchor.y}, 5)
      const flank = monsters.find(m=>m.id!==brute?.id && m.id!==ranged?.id)
      if(flank) this.tryRepositionMonster(flank, {x:anchor.x+1,y:anchor.y+1}, 4)
      return
    }

    // Higher floors bias to frontline+ranged crossfire packs.
    if(this.floor >= 4){
      const frontline = byKind('brute')[0] || byKind('chaser')[0] || monsters[0]
      const rangedA = byKind('sentinel')[0] || byKind('spitter')[0] || monsters.find(m=>m.id!==frontline?.id)
      const rangedB = byKind('spitter').find(m=>m.id!==rangedA?.id) || byKind('sentinel').find(m=>m.id!==rangedA?.id) || monsters.find(m=>m.id!==frontline?.id && m.id!==rangedA?.id)
      if(frontline) this.tryRepositionMonster(frontline, {x:anchor.x,y:anchor.y}, 4)
      if(rangedA) this.tryRepositionMonster(rangedA, {x:anchor.x+2,y:anchor.y-1}, 5)
      if(rangedB) this.tryRepositionMonster(rangedB, {x:anchor.x-2,y:anchor.y+1}, 5)
      const skirmisher = byKind('skitter')[0] || monsters.find(m=>m.id!==frontline?.id && m.id!==rangedA?.id && m.id!==rangedB?.id)
      if(skirmisher) this.tryRepositionMonster(skirmisher, {x:anchor.x+1,y:anchor.y+2}, 4)
      return
    }

    // Default mixed template: triangle pressure pack.
    const tri: Coord[] = [
      {x:anchor.x,y:anchor.y}, {x:anchor.x+1,y:anchor.y+1}, {x:anchor.x-1,y:anchor.y+1}
    ]
    monsters.slice(0,3).forEach((m,i)=> this.tryRepositionMonster(m, tri[i]!, 4))
  }

  private spawnItem(id:string,kind:'potion'|'relic'|'stairs'|'elixir'|'cursed-idol'|'gear'|'bomb'|'blink-shard'|'chest'|'shrine'|'fountain'|'rift-orb'){
    const loot = kind==='gear' ? this.generateGear() : undefined
    this.entities.push({id,type:'item',kind,pos:this.spawnFreePos(kind==='stairs' ? 6 : 3), ...(loot ? {loot} : {})})
  }

  private hasLineOfSight(from:Coord, to:Coord){
    let x0 = from.x, y0 = from.y, x1 = to.x, y1 = to.y
    const dx = Math.abs(x1-x0), sx = x0 < x1 ? 1 : -1
    const dy = -Math.abs(y1-y0), sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    while(!(x0===x1 && y0===y1)){
      const e2 = 2*err
      if(e2 >= dy){ err += dy; x0 += sx }
      if(e2 <= dx){ err += dx; y0 += sy }
      if(x0===x1 && y0===y1) break
      if(this.isWall({x:x0,y:y0})) return false
    }
    return true
  }

  private updateVision(){
    const player = this.entities.find(e=>e.id==='p')
    if(!player) return
    const radius = 8
    this.visible.clear()
    for(let y=player.pos.y-radius; y<=player.pos.y+radius; y++){
      for(let x=player.pos.x-radius; x<=player.pos.x+radius; x++){
        if(x<0||y<0||x>=this.width||y>=this.height) continue
        const d2 = (x-player.pos.x)*(x-player.pos.x)+(y-player.pos.y)*(y-player.pos.y)
        if(d2 > radius*radius) continue
        const p = {x,y}
        if(this.hasLineOfSight(player.pos,p)){
          const k = key(p)
          this.visible.add(k)
          this.discovered.add(k)
        }
      }
    }
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
      nextFloorModifier:this.getModifierForFloor(this.floor + 1),
      playerClass:this.playerClass,
      playerRace:this.playerRace,
      width:this.width,
      height:this.height,
      walls:this.getWalls(),
      visible:[...this.visible].map(k=>{ const p=k.split(','); return {x:Number(p[0]??0),y:Number(p[1]??0)} }),
      discovered:[...this.discovered].map(k=>{ const p=k.split(','); return {x:Number(p[0]??0),y:Number(p[1]??0)} }),
      entities:JSON.parse(JSON.stringify(this.entities)),
      score:this.score,
      killStreak:this.killStreak,
      attackBonus:this.attackBonus,
      defenseBonus:this.defenseBonus,
      maxHp:this.maxHp,
      inventory: JSON.parse(JSON.stringify(this.inventory)),
      dashCooldown:this.dashCooldown,
      backstepCooldown:this.backstepCooldown,
      guardCooldown:this.guardCooldown,
      guardActive:this.guardActive,
      bossCharging:this.bossCharged.size,
      gameOver:this.gameOver,
      ...(this.outcome ? { outcome: this.outcome } : {})
    }
  }

  private emit(ev:GameEvent){ this.events.push(ev); eventBus.publish(ev) }

  private setEquipped(item: GeneratedItem, equipped: boolean, player: Entity){
    if(Boolean(item.equipped)===equipped) return
    if(equipped){
      this.attackBonus += item.atkBonus
      this.defenseBonus += item.defBonus
      player.hp = Math.min(this.maxHp + item.hpBonus, (player.hp||0) + item.hpBonus)
      item.equipped = true
      return
    }
    this.attackBonus = Math.max(0, this.attackBonus - item.atkBonus)
    this.defenseBonus = Math.max(0, this.defenseBonus - item.defBonus)
    player.hp = Math.max(1, (player.hp||1) - item.hpBonus)
    item.equipped = false
  }

  equipInventoryIndex(index:number){
    const player = this.entities.find(e=>e.id==='p')
    if(!player) return this.getState()
    const item = this.inventory[index]
    if(!item) return this.getState()

    const currently = this.inventory.find(it=>it.itemClass===item.itemClass && it.equipped)
    if(currently && currently!==item){
      this.setEquipped(currently, false, player)
      this.emit({tick:this.tick,type:'gear_replaced',payload:{removed:currently,reason:'manual_swap'}})
    }
    this.setEquipped(item, true, player)
    this.emit({tick:this.tick,type:'gear_equipped',payload:{name:item.name,itemClass:item.itemClass}})
    return this.getState()
  }

  unequipInventoryIndex(index:number){
    const player = this.entities.find(e=>e.id==='p')
    if(!player) return this.getState()
    const item = this.inventory[index]
    if(!item || !item.equipped) return this.getState()
    this.setEquipped(item, false, player)
    this.emit({tick:this.tick,type:'gear_unequipped',payload:{name:item.name,itemClass:item.itemClass}})
    return this.getState()
  }

  autoEquipBest(){
    const player = this.entities.find(e=>e.id==='p')
    if(!player) return this.getState()

    const score = (it:GeneratedItem)=> (it.atkBonus*2) + (it.defBonus*2) + it.hpBonus + (it.rarity==='epic' ? 3 : it.rarity==='rare' ? 2 : it.rarity==='magic' ? 1 : 0)
    const classes: GeneratedItem['itemClass'][] = ['weapon','armor']

    for(const cls of classes){
      const candidates = this.inventory.filter(it=>it.itemClass===cls)
      if(candidates.length===0) continue
      const best = candidates.slice().sort((a,b)=> score(b)-score(a))[0]
      if(!best) continue
      const idx = this.inventory.indexOf(best)
      if(idx>=0) this.equipInventoryIndex(idx)
    }

    this.emit({tick:this.tick,type:'gear_autoequip',payload:{mode:'best'}})
    return this.getState()
  }

  unequipAll(){
    const player = this.entities.find(e=>e.id==='p')
    if(!player) return this.getState()
    let count = 0
    for(const it of this.inventory){
      if(!it.equipped) continue
      this.setEquipped(it, false, player)
      count++
    }
    if(count>0) this.emit({tick:this.tick,type:'gear_unequipped_all',payload:{count}})
    return this.getState()
  }

  sortInventory(){
    const rarityRank: Record<Rarity, number> = {epic:4, rare:3, magic:2, common:1}
    this.inventory.sort((a,b)=>{
      if(Boolean(b.equipped)!==Boolean(a.equipped)) return Number(b.equipped)-Number(a.equipped)
      if(a.itemClass!==b.itemClass) return a.itemClass==='weapon' ? -1 : 1
      const rr = (rarityRank[b.rarity]||0) - (rarityRank[a.rarity]||0)
      if(rr!==0) return rr
      const aScore = a.atkBonus + a.defBonus + a.hpBonus
      const bScore = b.atkBonus + b.defBonus + b.hpBonus
      if(bScore!==aScore) return bScore-aScore
      return a.name.localeCompare(b.name)
    })
    this.emit({tick:this.tick,type:'inventory_sorted',payload:{count:this.inventory.length}})
    return this.getState()
  }

  private equipGear(gear: GeneratedItem, player: Entity){
    const replaced = this.inventory.find(it=>it.itemClass===gear.itemClass && it.equipped)
    if(replaced){
      this.setEquipped(replaced, false, player)
      this.emit({tick:this.tick,type:'gear_replaced',payload:{removed:replaced,reason:'slot_upgrade'}})
    }

    const next = {...gear, equipped:false}
    this.inventory.push(next)
    this.setEquipped(next, true, player)

    if(this.inventory.length > 8){
      // Prefer trimming oldest unequipped first.
      const dropIdx = this.inventory.findIndex(it=>!it.equipped)
      if(dropIdx>=0) this.inventory.splice(dropIdx,1)
      else this.inventory = this.inventory.slice(-8)
    }
  }

  private trySpawnStairs(){
    const monstersLeft = this.entities.filter(e=>e.type==='monster').length
    const hasStairs = this.entities.some(e=>e.type==='item' && e.kind==='stairs')
    if(monstersLeft===0 && !hasStairs){
      this.spawnItem(`i${this.floor}-stairs`,'stairs')
      if(this.floor >= 2){
        this.spawnItem(`i${this.floor}-clear-reward-${this.tick}`,'chest')
        this.emit({tick:this.tick,type:'clear_reward',payload:{floor:this.floor,reward:'chest'}})
      }
      const nextFloor = this.floor + 1
      const nextModifier = this.getModifierForFloor(nextFloor)
      const nextBoss = nextFloor >= 3 && nextFloor % 3 === 0
      this.emit({tick:this.tick,type:'stairs_spawned',payload:{floor:this.floor,nextFloor,nextModifier,nextBoss}})
    }
  }

  private maybeBossLoot(dead:any){
    if(dead?.kind!=='boss') return
    const dropRoll = this.rand()
    if(dropRoll < 0.5) this.spawnItem(`i${this.floor}-boss-bomb-${this.tick}`,'bomb')
    else this.spawnItem(`i${this.floor}-boss-shard-${this.tick}`,'blink-shard')
    this.emit({tick:this.tick,type:'boss_loot',payload:{floor:this.floor,drop:dropRoll<0.5?'bomb':'blink-shard'}})
    this.emit({tick:this.tick,type:'boss_defeated_unlock',payload:{floor:this.floor}})
  }

  step(action: PlayerAction){
    if(this.gameOver) return this.getState()
    this.tick++
    if(this.dashCooldown > 0) this.dashCooldown--
    if(this.backstepCooldown > 0) this.backstepCooldown--
    if(this.guardCooldown > 0) this.guardCooldown--

    const player = this.entities.find(e=>e.type==='player')
    if(!player) throw new Error('no player')

    const d:Record<Dir,Coord>={
      up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0},
      'up-left':{x:-1,y:-1},'up-right':{x:1,y:-1},'down-left':{x:-1,y:1},'down-right':{x:1,y:1}
    }
    let playerScoredKill = false

    const canTraverseDiagonal = (from:Coord, to:Coord)=>{
      const dx = to.x - from.x
      const dy = to.y - from.y
      if(Math.abs(dx)!==1 || Math.abs(dy)!==1) return true
      const h = {x:from.x+dx,y:from.y}
      const v = {x:from.x,y:from.y+dy}
      return !this.isWall(h) && !this.isWall(v)
    }

    const adjacentMonsterCount = (pos:Coord, exceptId?:string)=> this.entities.filter(e=>{
      if(e.type!=='monster') return false
      if(exceptId && e.id===exceptId) return false
      const dist = Math.abs(e.pos.x-pos.x) + Math.abs(e.pos.y-pos.y)
      return dist===1
    }).length

    const isCorridorTile = (pos:Coord)=>{
      const lw = this.isWall({x:pos.x-1,y:pos.y})
      const rw = this.isWall({x:pos.x+1,y:pos.y})
      const uw = this.isWall({x:pos.x,y:pos.y-1})
      const dw = this.isWall({x:pos.x,y:pos.y+1})
      return (lw && rw && !uw && !dw) || (uw && dw && !lw && !rw)
    }

    const tunedMeleeDamage = (base:number, targetId:string)=>{
      let dmg = base
      const crowd = adjacentMonsterCount(player.pos, targetId)
      if(crowd>=2) dmg -= 1
      if(isCorridorTile(player.pos)) dmg += 1
      return Math.max(1, dmg)
    }

    const stepInto = (nd:Coord, moveType:'move'|'dash'):{changedFloor:boolean, stopped:boolean} => {
      if(nd.x<0 || nd.x>=this.width || nd.y<0 || nd.y>=this.height) return {changedFloor:false,stopped:true}
      if(!canTraverseDiagonal(player.pos, nd)){ this.emit({tick:this.tick,type:'bump',payload:{id:'p',to:nd,reason:'corner'}}); return {changedFloor:false,stopped:true} }
      if(this.isWall(nd)){ this.emit({tick:this.tick,type:'bump',payload:{id:'p',to:nd,reason:'wall'}}); return {changedFloor:false,stopped:true} }

      const occ = this.entities.find(e=>e.pos.x===nd.x && e.pos.y===nd.y && e.id!=='p')
      if(occ?.type==='monster'){
        const raw = (moveType==='dash' ? 5 : 3) + this.attackBonus
        const damage = tunedMeleeDamage(raw, occ.id)
        occ.hp = (occ.hp||1) - damage
        this.emit({tick:this.tick,type:'combat',payload:{attacker:'p',target:occ.id,damage,via:moveType}})
        if((occ.hp||0) <=0){
          this.emit({tick:this.tick,type:'die',payload:{id:occ.id,kind:occ.kind}})
          this.bossCharged.delete(occ.id)
          this.entities = this.entities.filter(e=>e.id!==occ.id)
          this.maybeBossLoot(occ)
          this.score += occ.kind==='boss' ? 500 : occ.kind==='sentinel' ? 210 : occ.kind==='brute' ? 180 : occ.kind==='spitter' ? 140 : occ.kind==='skitter' ? 120 : 100
          playerScoredKill = true
          if(this.playerClass==='rogue' && moveType==='dash'){
            this.dashCooldown = Math.max(0, this.dashCooldown - 1)
            this.emit({tick:this.tick,type:'dash_refresh',payload:{cooldown:this.dashCooldown}})
          }
        }
        return {changedFloor:false,stopped:true}
      }

      player.pos = nd
      if(occ?.type==='item'){
        this.emit({tick:this.tick,type:'item_here',payload:{id:occ.id,kind:occ.kind}})
      }
      this.emit({tick:this.tick,type:'move',payload:{id:'p',to:nd,via:moveType}})
      return {changedFloor:false,stopped:false}
    }

    const interactAtPlayer = (): {changedFloor:boolean} => {
      const item = this.entities.find(e=>e.type==='item' && e.pos.x===player.pos.x && e.pos.y===player.pos.y)
      if(!item){
        this.emit({tick:this.tick,type:'interact_none'})
        return {changedFloor:false}
      }
      if(item.kind==='potion'){
        player.hp = Math.min(this.maxHp, (player.hp||0) + 4)
        this.score += 25
        this.emit({tick:this.tick,type:'pickup',payload:{id:item.id,kind:item.kind}})
        this.entities = this.entities.filter(e=>e.id!==item.id)
      } else if(item.kind==='relic'){
        this.score += 200
        const r = this.rand()
        let boon: 'power'|'ward'|'focus' = 'power'
        if(r < 0.34){
          this.attackBonus += 1
          boon = 'power'
        } else if(r < 0.67){
          this.defenseBonus += 1
          boon = 'ward'
        } else {
          this.dashCooldown = Math.max(0, this.dashCooldown - 1)
          this.backstepCooldown = Math.max(0, this.backstepCooldown - 1)
          this.guardCooldown = Math.max(0, this.guardCooldown - 1)
          boon = 'focus'
        }
        this.emit({tick:this.tick,type:'pickup',payload:{id:item.id,kind:item.kind}})
        this.emit({tick:this.tick,type:'relic_boon',payload:{boon,attackBonus:this.attackBonus,defenseBonus:this.defenseBonus}})
        this.entities = this.entities.filter(e=>e.id!==item.id)
      } else if(item.kind==='elixir'){
        player.hp = Math.min(this.maxHp, (player.hp||0) + 2)
        this.dashCooldown = Math.max(0, this.dashCooldown - 1)
        this.guardCooldown = Math.max(0, this.guardCooldown - 1)
        this.score += 60
        this.emit({tick:this.tick,type:'pickup',payload:{id:item.id,kind:item.kind,effects:['heal+2','cooldowns-1']}})
        this.entities = this.entities.filter(e=>e.id!==item.id)
      } else if(item.kind==='cursed-idol'){
        player.hp = (player.hp||0) - 2
        this.score += 350
        this.emit({tick:this.tick,type:'pickup',payload:{id:item.id,kind:item.kind,effects:['hp-2','score+350']}})
        this.entities = this.entities.filter(e=>e.id!==item.id)
      } else if(item.kind==='gear'){
        const gear = item.loot
        if(gear){
          this.equipGear(gear, player)
          this.score += gear.scoreValue
          this.emit({tick:this.tick,type:'pickup',payload:{id:item.id,kind:item.kind,gear}})
        } else {
          this.emit({tick:this.tick,type:'pickup',payload:{id:item.id,kind:item.kind}})
        }
        this.entities = this.entities.filter(e=>e.id!==item.id)
      } else if(item.kind==='bomb'){
        const around: Coord[] = [
          {x:player.pos.x+1,y:player.pos.y},
          {x:player.pos.x-1,y:player.pos.y},
          {x:player.pos.x,y:player.pos.y+1},
          {x:player.pos.x,y:player.pos.y-1},
          {x:player.pos.x+1,y:player.pos.y+1},
          {x:player.pos.x+1,y:player.pos.y-1},
          {x:player.pos.x-1,y:player.pos.y+1},
          {x:player.pos.x-1,y:player.pos.y-1}
        ]
        let hits = 0
        for(const t of around){
          const m = this.entities.find(e=>e.type==='monster' && e.pos.x===t.x && e.pos.y===t.y)
          if(!m) continue
          const dmg = 4 + Math.floor(this.attackBonus/2)
          m.hp = (m.hp||1) - dmg
          hits++
          this.emit({tick:this.tick,type:'combat',payload:{attacker:'p',target:m.id,damage:dmg,via:'bomb'}})
          if((m.hp||0) <= 0){
            this.emit({tick:this.tick,type:'die',payload:{id:m.id,kind:m.kind}})
            this.bossCharged.delete(m.id)
            this.entities = this.entities.filter(e=>e.id!==m.id)
            this.maybeBossLoot(m)
            this.score += m.kind==='boss' ? 500 : m.kind==='sentinel' ? 210 : m.kind==='brute' ? 180 : m.kind==='spitter' ? 140 : m.kind==='skitter' ? 120 : 100
            playerScoredKill = true
          }
        }
        this.score += 40 + hits*25
        this.emit({tick:this.tick,type:'bomb_blast',payload:{at:player.pos,hits}})
        this.entities = this.entities.filter(e=>e.id!==item.id)
      } else if(item.kind==='blink-shard'){
        const from = {x:player.pos.x,y:player.pos.y}
        const candidates: Coord[] = []
        for(let y=Math.max(0,from.y-4); y<=Math.min(this.height-1,from.y+4); y++){
          for(let x=Math.max(0,from.x-4); x<=Math.min(this.width-1,from.x+4); x++){
            const p = {x,y}
            const dist = Math.abs(from.x-x)+Math.abs(from.y-y)
            if(dist < 3) continue
            if(this.isWall(p)) continue
            if(this.entities.some(e=>e.id!=='p' && e.pos.x===x && e.pos.y===y)) continue
            candidates.push(p)
          }
        }
        const to = candidates.length ? candidates[Math.floor(this.rand()*candidates.length)]! : from
        player.pos = to
        this.score += 70
        this.emit({tick:this.tick,type:'blink_used',payload:{from,to}})
        this.entities = this.entities.filter(e=>e.id!==item.id)
      } else if(item.kind==='chest'){
        const roll = this.rand()
        const drop = roll < 0.4 ? 'gear' : roll < 0.7 ? 'bomb' : 'blink-shard'
        this.entities = this.entities.filter(e=>e.id!==item.id)
        this.spawnItem(`i${this.floor}-chest-drop-${this.tick}`, drop as any)
        this.score += 90
        this.emit({tick:this.tick,type:'chest_opened',payload:{drop}})
      } else if(item.kind==='shrine'){
        const r = this.rand()
        let boon: 'might'|'guarding'|'vigor' = 'might'
        if(r < 0.34){ this.attackBonus += 1; boon = 'might' }
        else if(r < 0.67){ this.defenseBonus += 1; boon = 'guarding' }
        else { this.maxHp += 1; player.hp = Math.min(this.maxHp, (player.hp||0) + 1); boon = 'vigor' }
        this.score += 120
        this.emit({tick:this.tick,type:'shrine_boon',payload:{boon,attackBonus:this.attackBonus,defenseBonus:this.defenseBonus,maxHp:this.maxHp}})
        this.entities = this.entities.filter(e=>e.id!==item.id)
      } else if(item.kind==='fountain'){
        player.hp = this.maxHp
        this.dashCooldown = 0
        this.backstepCooldown = 0
        this.guardCooldown = 0
        this.score += 130
        this.emit({tick:this.tick,type:'fountain_used',payload:{hp:this.maxHp,clears:['dash','backstep','guard']}})
        this.entities = this.entities.filter(e=>e.id!==item.id)
      } else if(item.kind==='rift-orb'){
        const adj: Coord[] = [
          {x:player.pos.x+1,y:player.pos.y},{x:player.pos.x-1,y:player.pos.y},{x:player.pos.x,y:player.pos.y+1},{x:player.pos.x,y:player.pos.y-1}
        ]
        let pulled = 0
        for(const m of this.entities.filter(e=>e.type==='monster')){
          const target = adj.find(a=>!this.isWall(a) && !this.entities.some(e=>e.id!==m.id && e.id!=='p' && e.pos.x===a.x && e.pos.y===a.y) && !(a.x===player.pos.x && a.y===player.pos.y))
          if(!target) continue
          if(Math.abs(m.pos.x-player.pos.x)+Math.abs(m.pos.y-player.pos.y) > 6) continue
          m.pos = {x:target.x,y:target.y}
          this.emit({tick:this.tick,type:'move',payload:{id:m.id,to:m.pos,via:'rift'}})
          pulled++
          if(pulled>=3) break
        }
        this.score += 80 + pulled*10
        this.emit({tick:this.tick,type:'rift_used',payload:{pulled}})
        this.entities = this.entities.filter(e=>e.id!==item.id)
      } else if(item.kind==='stairs'){
        const bossAlive = this.entities.some(e=>e.type==='monster' && e.kind==='boss')
        if(bossAlive){
          this.emit({tick:this.tick,type:'stairs_blocked_boss',payload:{floor:this.floor}})
          return {changedFloor:false}
        }

        this.score += 150 + this.floor * 25
        // Run goal: clear floor 10 to win.
        if(this.floor >= 10){
          this.gameOver = true
          this.outcome = 'victory'
          this.emit({tick:this.tick,type:'victory',payload:{floor:this.floor,score:this.score}})
          this.entities = this.entities.filter(e=>e.id!==item.id)
          return {changedFloor:false}
        }
        this.emit({tick:this.tick,type:'stairs_used',payload:{fromFloor:this.floor,toFloor:this.floor+1}})
        this.floor += 1
        this.setupFloor(false)
        return {changedFloor:true}
      }

      return {changedFloor:false}
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
        const cdBonus = this.classScalingBonusForFloor(this.floor).dashCooldownBonus
        this.dashCooldown = Math.max(1, (this.playerRace==='elf' ? 2 : 3) - cdBonus)
        this.emit({tick:this.tick,type:'dash_used',payload:{dir:action.dir,cooldown:this.dashCooldown}})
        for(let i=0;i<2;i++){
          const res = stepInto({x:player.pos.x + delta.x, y: player.pos.y + delta.y},'dash')
          if(res.changedFloor) return this.getState()
          if(res.stopped) break
        }
      }
    } else if(action.type==='backstep'){
      if(this.playerClass!=='rogue') this.emit({tick:this.tick,type:'skill_blocked',payload:{skill:'backstep',class:this.playerClass}})
      else if(this.backstepCooldown>0) this.emit({tick:this.tick,type:'backstep_blocked',payload:{cooldown:this.backstepCooldown}})
      else {
        const delta = d[action.dir]
        const nd = {x:player.pos.x - delta.x, y: player.pos.y - delta.y}
        if(nd.x>=0 && nd.x<this.width && nd.y>=0 && nd.y<this.height && !this.isWall(nd) && !this.entities.some(e=>e.id!=='p' && e.pos.x===nd.x && e.pos.y===nd.y)){
          player.pos = nd
          const bsBonus = this.classScalingBonusForFloor(this.floor).backstepCooldownBonus
          this.backstepCooldown = Math.max(1, 3 - bsBonus)
          this.emit({tick:this.tick,type:'backstep_used',payload:{to:nd,cooldown:this.backstepCooldown}})
          this.emit({tick:this.tick,type:'move',payload:{id:'p',to:nd,via:'backstep'}})
        } else {
          this.emit({tick:this.tick,type:'backstep_blocked',payload:{reason:'occupied_or_wall'}})
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
          const rawBash = 3 + Math.floor(this.attackBonus/2)
          const bashDmg = tunedMeleeDamage(rawBash, occ.id)
          occ.hp = (occ.hp||1) - bashDmg
          const push = {x:target.x + delta.x, y:target.y + delta.y}
          const canPush = !this.isWall(push) && !this.entities.some(e=>e.id!==occ.id && e.pos.x===push.x && e.pos.y===push.y)
          if(canPush) occ.pos = push
          this.emit({tick:this.tick,type:'combat',payload:{attacker:'p',target:occ.id,damage:bashDmg,via:'bash',pushed:canPush}})
          if((occ.hp||0) <=0){
            this.emit({tick:this.tick,type:'die',payload:{id:occ.id,kind:occ.kind}})
            this.bossCharged.delete(occ.id)
            this.entities = this.entities.filter(e=>e.id!==occ.id)
            this.maybeBossLoot(occ)
            this.score += occ.kind==='boss' ? 500 : occ.kind==='sentinel' ? 210 : occ.kind==='brute' ? 180 : occ.kind==='spitter' ? 140 : occ.kind==='skitter' ? 120 : 100
            playerScoredKill = true
          }
        }
      }
    } else if(action.type==='interact'){
      const res = interactAtPlayer()
      if(res.changedFloor) return this.getState()
    } else {
      this.emit({tick:this.tick,type:'wait'})
    }

    if(playerScoredKill){
      this.killStreak += 1
      const bonus = this.killStreak >= 2 ? this.killStreak * 10 : 0
      if(bonus > 0){
        this.score += bonus
        this.emit({tick:this.tick,type:'streak_bonus',payload:{streak:this.killStreak,bonus}})
      }
      if(this.killStreak >= 4 && !this.streakRewardClaimed){
        this.streakRewardClaimed = true
        const reward = this.rand() < 0.5 ? 'bomb' : 'blink-shard'
        this.entities.push({id:`i${this.floor}-streak-${this.tick}`,type:'item',kind:reward as any,pos:{x:player.pos.x,y:player.pos.y}})
        this.emit({tick:this.tick,type:'streak_reward',payload:{streak:this.killStreak,reward}})
      }
    } else {
      this.killStreak = 0
    }

    this.updateVision()
    const playerPos = player.pos
    const monsters = this.entities.filter(e=>e.type==='monster')

    const tryMoveMonster = (m:any, nd:Coord, via='path')=>{
      if(nd.x<0 || nd.x>=this.width || nd.y<0 || nd.y>=this.height) return false
      if(!canTraverseDiagonal(m.pos, nd)) return false
      if(this.isWall(nd)) return false
      const occ = this.entities.find(e=>e.id!==m.id && e.pos.x===nd.x && e.pos.y===nd.y)
      if(occ) return false
      m.pos = nd
      this.emit({tick:this.tick,type:'move',payload:{id:m.id,to:nd,via}})
      return true
    }

    monsters.forEach(m=>{
      const kind = m.kind || 'chaser'
      const attacks = (kind==='skitter' && this.tick % 3 === 0) || (kind==='boss' && this.tick % 2 === 0) ? 0 : 1
      if(attacks===0) return

      const dx = playerPos.x - m.pos.x
      const dy = playerPos.y - m.pos.y
      const distance = Math.abs(dx)+Math.abs(dy)
      const senseRadius = kind==='boss' ? 10 : (this.floorModifier==='ambush' ? 10 : this.floorModifier==='swarm' ? 9 : 7)
      const canSense = distance <= senseRadius && this.hasLineOfSight(m.pos, playerPos)
      if(!canSense){
        if(this.rand() < 0.25){
          const dirs: Coord[] = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]
          const step = dirs[Math.floor(this.rand()*dirs.length)]
          if(step){
            const nd = {x:m.pos.x+step.x,y:m.pos.y+step.y}
            tryMoveMonster(m, nd, 'wander')
          }
        }
        return
      }

      if(kind==='boss'){
        if(distance<=2 && !this.bossCharged.has(m.id) && this.tick % 3 === 0){
          this.bossCharged.add(m.id)
          this.emit({tick:this.tick,type:'boss_charge',payload:{id:m.id,pos:m.pos}})
          return
        }
        if(distance===1 && this.bossCharged.has(m.id)){
          let slam = Math.max(0, 5 - this.defenseBonus)
          if(this.guardActive){ slam = Math.max(0, slam-1); this.guardActive = false; this.emit({tick:this.tick,type:'guard_triggered'}) }
          player.hp = (player.hp||0) - slam
          this.bossCharged.delete(m.id)
          this.emit({tick:this.tick,type:'combat',payload:{attacker:m.id,target:'p',damage:slam,kind,via:'slam'}})
          this.emit({tick:this.tick,type:'boss_slam',payload:{id:m.id,damage:slam}})
          return
        }
      }

      if(kind==='spitter'){
        const canSpit = distance<=5 && distance>1 && this.hasLineOfSight(m.pos, playerPos)
        if(canSpit){
          let spit = Math.max(0, 1 - this.defenseBonus)
          if(this.guardActive){ spit = Math.max(0, spit-1); this.guardActive = false; this.emit({tick:this.tick,type:'guard_triggered'}) }
          player.hp = (player.hp||0) - spit
          this.emit({tick:this.tick,type:'combat',payload:{attacker:m.id,target:'p',damage:spit,kind,via:'spit'}})
          this.emit({tick:this.tick,type:'spit_used',payload:{id:m.id,damage:spit}})
          return
        }
        // Kiting behavior: if too close, retreat to hold range.
        if(distance<=2){
          const away = {x:m.pos.x - Math.sign(dx), y:m.pos.y - Math.sign(dy)}
          if(tryMoveMonster(m, away, 'kite')) return
        }
      }

      if(kind==='sentinel' && distance>1){
        // Sentinel anchors lanes and zaps nearby intruders, otherwise holds space.
        if(distance<=2 && this.hasLineOfSight(m.pos, playerPos)){
          let zap = Math.max(0, 1 - this.defenseBonus)
          if(this.guardActive){ zap = Math.max(0, zap-1); this.guardActive = false; this.emit({tick:this.tick,type:'guard_triggered'}) }
          player.hp = (player.hp||0) - zap
          this.emit({tick:this.tick,type:'combat',payload:{attacker:m.id,target:'p',damage:zap,kind,via:'zap'}})
        }
        return
      }

      if(kind==='brute' && distance===2 && (dx===0 || dy===0)){
        const step = {x:m.pos.x + Math.sign(dx), y:m.pos.y + Math.sign(dy)}
        if(tryMoveMonster(m, step, 'lunge')){
          let crash = Math.max(0, 2 - this.defenseBonus)
          if(this.guardActive){ crash = Math.max(0, crash-1); this.guardActive = false; this.emit({tick:this.tick,type:'guard_triggered'}) }
          player.hp = (player.hp||0) - crash
          this.emit({tick:this.tick,type:'combat',payload:{attacker:m.id,target:'p',damage:crash,kind,via:'lunge'}})
          return
        }
      }

      if(distance===1){
        let dmg = kind==='boss' ? 3 : kind==='sentinel' ? 2 : kind==='brute' ? 2 : 1
        dmg = Math.max(0, dmg - this.defenseBonus)
        if(this.guardActive){ dmg = Math.max(0, dmg-1); this.guardActive = false; this.emit({tick:this.tick,type:'guard_triggered'}) }
        player.hp = (player.hp||0) - dmg
        this.emit({tick:this.tick,type:'combat',payload:{attacker:m.id,target:'p',damage:dmg,kind}})
        return
      }

      if(kind==='skitter' && distance<=3){
        // Flank behavior: prefer orbit/sidestep over direct trades.
        const sideA = {x:m.pos.x + Math.sign(dy), y:m.pos.y - Math.sign(dx)}
        const sideB = {x:m.pos.x - Math.sign(dy), y:m.pos.y + Math.sign(dx)}
        if(this.rand()<0.7){
          if(tryMoveMonster(m, sideA, 'flank')) return
          if(tryMoveMonster(m, sideB, 'flank')) return
        } else {
          if(tryMoveMonster(m, sideB, 'flank')) return
          if(tryMoveMonster(m, sideA, 'flank')) return
        }
      }

      const pathStep = this.nextStepToward(m.pos, playerPos, m.id)
      if(pathStep && tryMoveMonster(m, pathStep, 'path')) return

      const movePref: Coord[] = []
      if(kind==='skitter') movePref.push({x:Math.sign(dy),y:0},{x:0,y:Math.sign(dx)},{x:Math.sign(dx),y:0},{x:0,y:Math.sign(dy)})
      else if(kind==='brute') movePref.push({x:Math.sign(dx),y:0},{x:0,y:Math.sign(dy)})
      else { const stepX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0; const stepY = stepX===0 ? Math.sign(dy) : 0; movePref.push({x:stepX,y:stepY},{x:Math.sign(dx),y:0},{x:0,y:Math.sign(dy)}) }

      for(const step of movePref){
        const nd = {x:m.pos.x + step.x, y:m.pos.y + step.y}
        if(tryMoveMonster(m, nd, kind==='skitter' ? 'skitter-step' : 'advance')) break
      }
    })

    this.trySpawnStairs()
    this.updateVision()
    if((player.hp||0)<=0){ this.gameOver = true; this.outcome = 'defeat'; this.emit({tick:this.tick,type:'defeat',payload:{reason:'player_dead',score:this.score,floor:this.floor}}) }
    return this.getState()
  }
}

export default Engine
