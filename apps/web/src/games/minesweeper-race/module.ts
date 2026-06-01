import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { MinesweeperRaceGame } from './minesweeper-race.game'
const module: GameModule = {
  id: 'minesweeper-race', name: 'Minesweeper Race',
  description: 'Cooperative minesweeper! Work together to clear the board with 3 shared lives.',
  minPlayers: 1, maxPlayers: 8, supportsSinglePlayer: true, supportsMultiplayer: true,
  tags: ['cooperative', 'puzzle', 'strategy', 'classic'],
  create: (context: GameContext) => new MinesweeperRaceGame(context),
}
export default module
