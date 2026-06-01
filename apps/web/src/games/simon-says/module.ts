import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { SimonSaysGame } from './simon-says.game'

const module: GameModule = {
  id: 'simon-says',
  name: 'Simon Says',
  description: 'Watch the sequence. Repeat it. One wrong move and you\'re out.',
  minPlayers: 1,
  maxPlayers: 8,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['memory', 'reflex', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new SimonSaysGame(context),
}

export default module
