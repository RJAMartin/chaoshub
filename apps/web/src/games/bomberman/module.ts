import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { BombermanGame } from './bomberman.game'

const module: GameModule = {
  id: 'bomberman',
  name: 'Bomberman',
  description: 'Place bombs to destroy blocks and blast opponents. Last one standing wins.',
  minPlayers: 2,
  maxPlayers: 4,
  supportsSinglePlayer: false,
  supportsMultiplayer: true,
  tags: ['action', 'strategy', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new BombermanGame(context),
}

export default module
