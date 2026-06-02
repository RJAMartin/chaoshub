import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { SpeedMathGame } from './speed-math.game'

const module: GameModule = {
  id: 'speed-math',
  name: 'Speed Math',
  description: 'Race to solve arithmetic problems. First with the correct answer scores a point.',
  minPlayers: 1,
  maxPlayers: 8,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['trivia', 'reflex', 'multiplayer'],
  create: (context: GameContext) => new SpeedMathGame(context),
}

export default module
