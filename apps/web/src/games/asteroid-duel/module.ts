import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { AsteroidDuelGame } from './asteroid-duel.game'

const module: GameModule = {
  id: 'asteroid-duel',
  name: 'Asteroid Duel',
  description: 'Pilot your ship. Blast asteroids and rivals. First to 20 points wins.',
  minPlayers: 1,
  maxPlayers: 6,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['action', 'shooter', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new AsteroidDuelGame(context),
}

export default module
