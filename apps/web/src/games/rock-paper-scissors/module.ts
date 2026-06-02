import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { RockPaperScissorsGame } from './rock-paper-scissors.game'

const module: GameModule = {
  id: 'rock-paper-scissors',
  name: 'Rock Paper Scissors',
  description: 'Simultaneous reveal. Outsmart your opponents over 5 tense rounds.',
  minPlayers: 2,
  maxPlayers: 6,
  supportsSinglePlayer: false,
  supportsMultiplayer: true,
  tags: ['strategy', 'multiplayer', 'competitive'],
  create: (context: GameContext) => new RockPaperScissorsGame(context),
}

export default module
