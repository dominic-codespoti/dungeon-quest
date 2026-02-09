import type {GameSnapshot, PlayerAction, GameEvent, Entity, Coord, PlayerClass, PlayerRace, GeneratedItem, Rarity} from './types'
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

    const threatCap = 8 + this.floor * 1.8
    let threat = 0

    for(let i=0;i<monsterCount;i++){
      const kind = this.rollMonsterKind()
      const hp = kind==='brute' ? 7 + Math.floor((this.floor-1)/2) : kind==='chaser' ? 4 + Math.floor((this.floor-1)/3) : kind==='spitter' ? 4 + Math.floor((this.floor-1)/4) : 3 + Math.floor((this.floor-1)/3)
      const cost = kind==='brute' ? 2.4 : kind==='chaser' ? 1.5 : kind==='spitter' ? 1.8 : 1.2
      if(i>1 && threat + cost > threatCap) continue
      this.spawnMonster(`m${this.floor}-${i+1}`,kind,hp)
      threat += cost
    }

    // Mini-boss prototype: every 3rd floor gets one heavy elite.
    if(this.floor >= 3 && this.floor % 3 === 0){
      const bossHp = 14 + this.floor
      this.spawnMonster(`boss-${this.floor}`,'boss',bossHp)
      this.emit({tick:this.tick,type:'boss_spawned',payload:{floor:this.floor,hp:bossHp}})
    }

    const potionCount = this.floorModifier==='scarce-potions' ? 0 : this.floor>=4 ? 2 : 1
    for(let i=0;i<potionCount;i++) this.spawnItem(`i${this.floor}-p${i+1}`,'potion')
    this.spawnItem(`i${this.floor}-r1`,'relic')

    // Item variety pass: utility + risk/reward pickups.
    if(this.floor % 2 === 0) this.spawnItem(`i${this.floor}-e1`,'elixir')
    if(this.floor >= 3 && this.rand() < 0.5) this.spawnItem(`i${this.floor}-c1`,'cursed-idol')
    if(this.floor >= 2 && this.rand() < 0.45) this.spawnItem(`i${this.floor}-b1`,'bomb')
    if(this.floor >= 2 && this.rand() < 0.35) this.spawnItem(`i${this.floor}-s1`,'blink-shard')
    if(this.floor >= 3 && this.rand() < 0.25) this.spawnItem(`i${this.floor}-c2`,'chest')
    if(this.floor >= 4 && this.rand() < 0.22) this.spawnItem(`i${this.floor}-h1`,'shrine')
    if(this.floor >= 5 && this.rand() < 0.18) this.spawnItem(`i${this.floor}-f1`,'fountain')

    // Generated gear system (item classes + rarity + enchantments)
    const gearDrops = this.floor >= 2 ? 2 : 1
    for(let i=0;i<gearDrops;i++) this.spawnItem(`i${this.floor}-g${i+1}`,'gear')

    this.updateVision()
    if(!initial){
      this.emit({tick:this.tick,type:'floor',payload:{floor:this.floor,modifier:this.floorModifier}})
    }
    this.emit({
      tick:this.tick,
      type:'init',
      payload:{floor:this.floor,modifier:this.floorModifier,playerClass:this.playerClass,playerRace:this.playerRace,width:this.width,height:this.height,walls:this.getWalls(),entities:this.entities}
    })
  }

  private getModifierForFloor(floor:number): 'none'|'brute-heavy'|'swarm'|'scarce-potions' {
    if(floor < 2) return 'none'
    if(floor % 4 === 0) return 'brute-heavy'
    if(floor % 3 === 0) return 'scarce-potions'
    if(floor % 2 === 0) return 'swarm'
    return 'none'
  }

  private rollMonsterKind(): 'chaser'|'brute'|'skitter'|'spitter' {
    const pick = this.rand()
    if(this.floor >= 4 && pick > 0.86) return 'spitter'
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

  private spawnMonster(id:string,kind:'chaser'|'brute'|'skitter'|'spitter'|'boss',hp:number){
    this.entities.push({id,type:'monster',kind,pos:this.spawnFreePos(5),hp})
  }

  private spawnItem(id:string,kind:'potion'|'relic'|'stairs'|'elixir'|'cursed-idol'|'gear'|'bomb'|'blink-shard'|'chest'|'shrine'|'fountain'){
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
      gameOver:this.gameOver,
      ...(this.outcome ? { outcome: this.outcome } : {})
    }
  }

  private emit(ev:GameEvent){ this.events.push(ev); eventBus.publish(ev) }

  private equipGear(gear: GeneratedItem, player: Entity){
    this.inventory.push(gear)
    this.attackBonus += gear.atkBonus
    this.defenseBonus += gear.defBonus
    player.hp = Math.min(this.maxHp + gear.hpBonus, (player.hp||0) + gear.hpBonus)

    // Keep inventory readable: 6 active pieces max, oldest gets replaced.
    if(this.inventory.length > 6){
      const removed = this.inventory.shift()!
      this.attackBonus = Math.max(0, this.attackBonus - removed.atkBonus)
      this.defenseBonus = Math.max(0, this.defenseBonus - removed.defBonus)
      this.emit({tick:this.tick,type:'gear_replaced',payload:{removed,reason:'inventory_cap'}})
    }
  }

  private trySpawnStairs(){
    const monstersLeft = this.entities.filter(e=>e.type==='monster').length
    const hasStairs = this.entities.some(e=>e.type==='item' && e.kind==='stairs')
    if(monstersLeft===0 && !hasStairs){
      this.spawnItem(`i${this.floor}-stairs`,'stairs')
      this.emit({tick:this.tick,type:'stairs_spawned',payload:{floor:this.floor}})
    }
  }

  private maybeBossLoot(dead:any){
    if(dead?.kind!=='boss') return
    const dropRoll = this.rand()
    if(dropRoll < 0.5) this.spawnItem(`i${this.floor}-boss-bomb-${this.tick}`,'bomb')
    else this.spawnItem(`i${this.floor}-boss-shard-${this.tick}`,'blink-shard')
    this.emit({tick:this.tick,type:'boss_loot',payload:{floor:this.floor,drop:dropRoll<0.5?'bomb':'blink-shard'}})
  }

  step(action: PlayerAction){
    if(this.gameOver) return this.getState()
    this.tick++
    if(this.dashCooldown > 0) this.dashCooldown--
    if(this.backstepCooldown > 0) this.backstepCooldown--
    if(this.guardCooldown > 0) this.guardCooldown--

    const player = this.entities.find(e=>e.type==='player')
    if(!player) throw new Error('no player')

    const d:Record<'up'|'down'|'left'|'right',Coord>={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}
    let playerScoredKill = false
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
          this.bossCharged.delete(occ.id)
          this.entities = this.entities.filter(e=>e.id!==occ.id)
          this.maybeBossLoot(occ)
          this.score += occ.kind==='boss' ? 500 : occ.kind==='brute' ? 180 : occ.kind==='spitter' ? 140 : occ.kind==='skitter' ? 120 : 100
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
        this.emit({tick:this.tick,type:'pickup',payload:{id:item.id,kind:item.kind}})
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
            this.score += m.kind==='boss' ? 500 : m.kind==='brute' ? 180 : m.kind==='spitter' ? 140 : m.kind==='skitter' ? 120 : 100
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
      } else if(item.kind==='stairs'){
        this.score += 150 + this.floor * 25
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
        this.dashCooldown = this.playerRace==='elf' ? 2 : 3
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
          this.backstepCooldown = 3
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
          const bashDmg = 3 + Math.floor(this.attackBonus/2)
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
            this.score += occ.kind==='boss' ? 500 : occ.kind==='brute' ? 180 : occ.kind==='spitter' ? 140 : occ.kind==='skitter' ? 120 : 100
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
    monsters.forEach(m=>{
      const kind = m.kind || 'chaser'
      const attacks = (kind==='skitter' && this.tick % 3 === 0) || (kind==='boss' && this.tick % 2 === 0) ? 0 : 1
      if(attacks===0) return

      const dx = playerPos.x - m.pos.x
      const dy = playerPos.y - m.pos.y
      const distance = Math.abs(dx)+Math.abs(dy)
      const senseRadius = kind==='boss' ? 10 : (this.floorModifier==='swarm' ? 9 : 7)
      const canSense = distance <= senseRadius && this.hasLineOfSight(m.pos, playerPos)
      if(!canSense){
        if(this.rand() < 0.25){
          const dirs: Coord[] = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]
          const step = dirs[Math.floor(this.rand()*dirs.length)]
          if(step){
            const nd = {x:m.pos.x+step.x,y:m.pos.y+step.y}
            if(!this.isWall(nd) && !this.entities.some(e=>e.id!==m.id && e.pos.x===nd.x && e.pos.y===nd.y)){
              m.pos = nd
              this.emit({tick:this.tick,type:'move',payload:{id:m.id,to:nd,via:'wander'}})
            }
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

      if(kind==='spitter' && distance<=4 && distance>1 && this.hasLineOfSight(m.pos, playerPos)){
        let spit = Math.max(0, 1 - this.defenseBonus)
        if(this.guardActive){ spit = Math.max(0, spit-1); this.guardActive = false; this.emit({tick:this.tick,type:'guard_triggered'}) }
        player.hp = (player.hp||0) - spit
        this.emit({tick:this.tick,type:'combat',payload:{attacker:m.id,target:'p',damage:spit,kind,via:'spit'}})
        this.emit({tick:this.tick,type:'spit_used',payload:{id:m.id,damage:spit}})
        return
      }

      if(distance===1){
        let dmg = kind==='boss' ? 3 : kind==='brute' ? 2 : 1
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
    this.updateVision()
    if((player.hp||0)<=0){ this.gameOver = true; this.outcome = 'defeat'; this.emit({tick:this.tick,type:'defeat',payload:{reason:'player_dead',score:this.score,floor:this.floor}}) }
    return this.getState()
  }
}

export default Engine
