import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { SumoShoveGame } from './sumo-shove.game'

const module: GameModule = {
  id: 'sumo-shove',
  name: 'Sumo Shove',
  description: 'Shove opponents off the platform. Last one standing wins.',
  minPlayers: 2,
  maxPlayers: 6,
  supportsSinglePlayer: false,
  supportsMultiplayer: true,
  tags: ['physics', 'action', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new SumoShoveGame(context),
}

export default module
