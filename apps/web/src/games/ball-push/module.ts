import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { BallPushGame } from './ball-push.game'

const module: GameModule = {
  id: 'ball-push',
  name: 'Ball Push',
  description: 'Push the ball into your opponent\'s goal using your paddle. First to 3 wins!',
  minPlayers: 2,
  maxPlayers: 2,
  supportsSinglePlayer: false,
  supportsMultiplayer: true,
  tags: ['physics', 'competitive', '2-player'],
  create: (context: GameContext) => new BallPushGame(context),
}

export default module
