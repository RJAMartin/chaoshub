import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { HotOrColdGame } from './hot-or-cold.game'
const module: GameModule = {
  id: 'hot-or-cold', name: 'Hot or Cold',
  description: 'Guess the secret number 1-1000. Get hotter or colder hints with each guess!',
  minPlayers: 1, maxPlayers: 8, supportsSinglePlayer: true, supportsMultiplayer: true,
  tags: ['guessing', 'number', 'multiplayer'],
  create: (context: GameContext) => new HotOrColdGame(context),
}
export default module
