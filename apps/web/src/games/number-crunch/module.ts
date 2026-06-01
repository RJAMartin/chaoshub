import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { NumberCrunchGame } from './number-crunch.game'

const module: GameModule = {
  id: 'number-crunch',
  name: 'Number Crunch',
  description: 'Solve math problems faster than everyone else. 15 rounds.',
  minPlayers: 1,
  maxPlayers: 8,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['math', 'competitive', 'multiplayer', 'reflex'],
  create: (context: GameContext) => new NumberCrunchGame(context),
}

export default module
