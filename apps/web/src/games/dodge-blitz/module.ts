import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { DodgeBlitzGame } from './dodge-blitz.game'

const module: GameModule = {
  id: 'dodge-blitz',
  name: 'Dodge Blitz',
  description: 'Dodge the falling objects. Last player standing wins.',
  minPlayers: 1,
  maxPlayers: 6,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['arcade', 'reflex', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new DodgeBlitzGame(context),
}

export default module
