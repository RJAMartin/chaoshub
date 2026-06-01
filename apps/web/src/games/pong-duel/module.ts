import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { PongDuelGame } from './pong-duel.game'

const module: GameModule = {
  id: 'pong-duel',
  name: 'Pong Duel',
  description: 'Classic Pong. First to 7 points wins.',
  minPlayers: 2,
  maxPlayers: 2,
  supportsSinglePlayer: false,
  supportsMultiplayer: true,
  tags: ['arcade', 'competitive', 'classic', '1v1'],
  create: (context: GameContext) => new PongDuelGame(context),
}

export default module
