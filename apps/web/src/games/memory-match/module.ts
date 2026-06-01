import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { MemoryMatchGame } from './memory-match.game'

const module: GameModule = {
  id: 'memory-match',
  name: 'Memory Match',
  description: 'Flip cards to find matching pairs. Most matches wins.',
  minPlayers: 1,
  maxPlayers: 6,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['memory', 'puzzle', 'turn-based', 'multiplayer'],
  create: (context: GameContext) => new MemoryMatchGame(context),
}

export default module
