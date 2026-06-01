import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { WordScrambleGame } from './word-scramble.game'

const module: GameModule = {
  id: 'word-scramble',
  name: 'Word Scramble',
  description: 'Unscramble the word before anyone else. 10 rounds, most points wins.',
  minPlayers: 1,
  maxPlayers: 8,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['word', 'trivia', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new WordScrambleGame(context),
}

export default module
