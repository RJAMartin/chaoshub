import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { SpellingBeeGame } from './spelling-bee.game'
const module: GameModule = {
  id: 'spelling-bee', name: 'Spelling Bee',
  description: 'Unscramble the letters and spell the word correctly. First to type it wins!',
  minPlayers: 1, maxPlayers: 8, supportsSinglePlayer: true, supportsMultiplayer: true,
  tags: ['word', 'spelling', 'puzzle', 'multiplayer'],
  create: (context: GameContext) => new SpellingBeeGame(context),
}
export default module
