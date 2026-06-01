import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { SnakeBattleGame } from './snake-battle.game'

const module: GameModule = {
  id: 'snake-battle',
  name: 'Snake Battle',
  description: 'Grow your snake by eating pellets. Outlast everyone else.',
  minPlayers: 1,
  maxPlayers: 6,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['arcade', 'competitive', 'multiplayer', 'snake'],
  create: (context: GameContext) => new SnakeBattleGame(context),
}

export default module
