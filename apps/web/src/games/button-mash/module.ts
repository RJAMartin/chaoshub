import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { ButtonMashGame } from './button-mash.game'
const module: GameModule = {
  id: 'button-mash', name: 'Button Mash',
  description: 'Tap as many times as you can in 10 seconds. Most taps wins.',
  minPlayers: 1, maxPlayers: 8, supportsSinglePlayer: true, supportsMultiplayer: true,
  tags: ['reflex', 'arcade', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new ButtonMashGame(context),
}
export default module
