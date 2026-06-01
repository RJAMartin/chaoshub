import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { ConnectFourGame } from './connect-four.game'
const module: GameModule = {
  id: 'connect-four', name: 'Connect Four',
  description: 'Drop pieces to connect 4 in a row horizontally, vertically or diagonally!',
  minPlayers: 2, maxPlayers: 2, supportsSinglePlayer: false, supportsMultiplayer: true,
  tags: ['strategy', 'board', 'classic', '2-player'],
  create: (context: GameContext) => new ConnectFourGame(context),
}
export default module
