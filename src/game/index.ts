import Phaser from 'phaser'

export function createGame(container: HTMLElement){
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: container,
    width: 640,
    height: 480,
    scene: {
      preload(){},
      create(){
        const g = this.add.graphics()
        g.fillStyle(0x888888)
        g.fillRect(0,0,640,480)
        this.add.text(10,10,'Dungeon Quest (Phaser)')
      },
      update(){}
    }
  }
  return new Phaser.Game(config)
}
