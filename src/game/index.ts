import Phaser from 'phaser'

import floorTex from '../ui/assets/textures/floor.png'
import wallTex from '../ui/assets/textures/wall.png'
import knightSprite from '../ui/assets/sprites/knight.png'
import rogueSprite from '../ui/assets/sprites/rogue.png'
import chaserSprite from '../ui/assets/sprites/chaser.png'
import bruteSprite from '../ui/assets/sprites/brute.png'
import skitterSprite from '../ui/assets/sprites/skitter.png'
import stairsSprite from '../ui/assets/sprites/stairs.png'
import relicSprite from '../ui/assets/sprites/relic.png'
import gearSprite from '../ui/assets/sprites/gear.png'
import idolSprite from '../ui/assets/sprites/idol.png'
import potionIcon from '../ui/assets/icons/potion.png'

export const TEX_KEYS = {
  floor: 'tex-floor',
  wall: 'tex-wall',
  knight: 'spr-knight',
  rogue: 'spr-rogue',
  chaser: 'spr-chaser',
  brute: 'spr-brute',
  skitter: 'spr-skitter',
  stairs: 'spr-stairs',
  relic: 'spr-relic',
  gear: 'spr-gear',
  idol: 'spr-idol',
  potion: 'spr-potion'
} as const

export function createGame(container: HTMLElement){
  const w = container.clientWidth || window.innerWidth
  const h = container.clientHeight || window.innerHeight

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: container,
    width: w,
    height: h,
    scene: {
      preload(){
        this.load.image(TEX_KEYS.floor, floorTex)
        this.load.image(TEX_KEYS.wall, wallTex)
        this.load.image(TEX_KEYS.knight, knightSprite)
        this.load.image(TEX_KEYS.rogue, rogueSprite)
        this.load.image(TEX_KEYS.chaser, chaserSprite)
        this.load.image(TEX_KEYS.brute, bruteSprite)
        this.load.image(TEX_KEYS.skitter, skitterSprite)
        this.load.image(TEX_KEYS.stairs, stairsSprite)
        this.load.image(TEX_KEYS.relic, relicSprite)
        this.load.image(TEX_KEYS.gear, gearSprite)
        this.load.image(TEX_KEYS.idol, idolSprite)
        this.load.image(TEX_KEYS.potion, potionIcon)
      },
      create(){
        const g = this.add.graphics()
        g.fillStyle(0x111827)
        g.fillRect(0,0,w,h)
      },
      update(){}
    }
  }
  return new Phaser.Game(config)
}
