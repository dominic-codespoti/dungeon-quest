import Phaser from 'phaser'

export function createGame(container: HTMLElement){
  const w = container.clientWidth || window.innerWidth
  const h = container.clientHeight || window.innerHeight

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: container,
    width: w,
    height: h,
    scene: {
      preload(){},
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
