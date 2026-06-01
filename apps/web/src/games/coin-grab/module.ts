import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { CoinGrabGame } from './coin-grab.game'

const module: GameModule = {
  id: 'coin-grab',
  name: 'Coin Grab',
  description: 'Collect the most coins in 60 seconds. Move fast!',
  minPlayers: 1,
  maxPlayers: 6,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['arcade', 'competitive', 'multiplayer', 'collection'],
  create: (context: GameContext) => new CoinGrabGame(context),
}

export default module
