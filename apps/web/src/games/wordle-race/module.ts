import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { WordleRaceGame } from './wordle-race.game'

const module: GameModule = {
  id: 'wordle-race',
  name: 'Wordle Race',
  description: 'Guess the 5-letter word in 6 tries. First to solve wins.',
  minPlayers: 1,
  maxPlayers: 6,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['word', 'puzzle', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new WordleRaceGame(context),
}

export default module
