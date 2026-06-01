import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { TriviaQuizGame } from './trivia-quiz.game'

const module: GameModule = {
  id: 'trivia-quiz',
  name: 'Trivia Quiz',
  description: 'Answer fast, score big. 10 rounds of multiple-choice trivia.',
  minPlayers: 1,
  maxPlayers: 8,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['trivia', 'quiz', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new TriviaQuizGame(context),
}

export default module
