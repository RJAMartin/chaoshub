import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { WhackAMoleGame } from './whack-a-mole.game'
const module: GameModule = {
  id: 'whack-a-mole', name: 'Whack-a-Mole',
  description: 'Moles pop up — click them before they hide. Most hits in 45s wins.',
  minPlayers: 1, maxPlayers: 8, supportsSinglePlayer: true, supportsMultiplayer: true,
  tags: ['reflex', 'arcade', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new WhackAMoleGame(context),
}
export default module
