import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { BreakoutBlitzGame } from './breakout-blitz.game'
const module: GameModule = {
  id: 'breakout-blitz', name: 'Breakout Blitz',
  description: 'Each player has their own bricks — race to clear your board first!',
  minPlayers: 1, maxPlayers: 4, supportsSinglePlayer: true, supportsMultiplayer: true,
  tags: ['arcade', 'competitive', 'reflex', 'multiplayer'],
  create: (context: GameContext) => new BreakoutBlitzGame(context),
}
export default module
