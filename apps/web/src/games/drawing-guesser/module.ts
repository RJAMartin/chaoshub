import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { DrawingGuesserGame } from './drawing-guesser.game'

const module: GameModule = {
  id: 'drawing-guesser',
  name: 'Drawing Guesser',
  description: 'One player draws, everyone else guesses. Pictionary-style fun.',
  minPlayers: 2,
  maxPlayers: 8,
  supportsSinglePlayer: false,
  supportsMultiplayer: true,
  tags: ['drawing', 'creative', 'social', 'multiplayer'],
  create: (context: GameContext) => new DrawingGuesserGame(context),
}

export default module
