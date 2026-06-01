import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { PixelPortraitGame } from './pixel-portrait.game'
const module: GameModule = {
  id: 'pixel-portrait', name: 'Pixel Portrait',
  description: 'Draw a prompt in 40 seconds using a pixel grid, then vote for the best drawing.',
  minPlayers: 2, maxPlayers: 6, supportsSinglePlayer: false, supportsMultiplayer: true,
  tags: ['drawing', 'creative', 'party', 'vote'],
  create: (context: GameContext) => new PixelPortraitGame(context),
}
export default module
