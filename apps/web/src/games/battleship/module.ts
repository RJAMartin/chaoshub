import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { BattleshipGame } from './battleship.game'
const module: GameModule = {
  id: 'battleship', name: 'Battleship',
  description: 'Sink your opponent\'s fleet before they sink yours! Classic naval strategy.',
  minPlayers: 2, maxPlayers: 2, supportsSinglePlayer: false, supportsMultiplayer: true,
  tags: ['strategy', 'board', 'classic', '2-player'],
  create: (context: GameContext) => new BattleshipGame(context),
}
export default module
