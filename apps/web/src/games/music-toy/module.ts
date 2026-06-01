import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { MusicToyGame } from './music-toy.game'

const module: GameModule = {
  id: 'music-toy',
  name: 'Music Toy',
  description: 'Place notes on a shared 16-step grid. Make music together.',
  minPlayers: 1,
  maxPlayers: 8,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['sandbox', 'music', 'creative', 'multiplayer'],
  create: (context: GameContext) => new MusicToyGame(context),
}

export default module
