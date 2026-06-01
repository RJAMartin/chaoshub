import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { AirHockeyGame } from './air-hockey.game'
const module: GameModule = {
  id: 'air-hockey', name: 'Air Hockey',
  description: 'Move your paddle with the mouse — deflect the puck into their goal. First to 7 wins.',
  minPlayers: 2, maxPlayers: 2, supportsSinglePlayer: false, supportsMultiplayer: true,
  tags: ['physics', 'arcade', 'competitive', '2-player'],
  create: (context: GameContext) => new AirHockeyGame(context),
}
export default module
