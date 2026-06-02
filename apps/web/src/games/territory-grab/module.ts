import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { TerritoryGrabGame } from './territory-grab.game'

const module: GameModule = {
  id: 'territory-grab',
  name: 'Territory Grab',
  description: 'Expand your coloured territory by clicking adjacent cells. Most cells wins.',
  minPlayers: 2,
  maxPlayers: 6,
  supportsSinglePlayer: false,
  supportsMultiplayer: true,
  tags: ['strategy', 'multiplayer'],
  create: (context: GameContext) => new TerritoryGrabGame(context),
}

export default module
