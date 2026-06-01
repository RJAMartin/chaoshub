import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { HangmanGame } from './hangman.game'
const module: GameModule = {
  id: 'hangman', name: 'Hangman',
  description: 'Guess the hidden word letter by letter — 6 wrong guesses and you\'re hanged.',
  minPlayers: 1, maxPlayers: 8, supportsSinglePlayer: true, supportsMultiplayer: true,
  tags: ['word', 'puzzle', 'multiplayer', 'competitive'],
  create: (context: GameContext) => new HangmanGame(context),
}
export default module
