import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { EmojiDecodeGame } from './emoji-decode.game'
const module: GameModule = {
  id: 'emoji-decode', name: 'Emoji Decode',
  description: 'Decode emoji sequences representing movies, shows and phrases!',
  minPlayers: 1, maxPlayers: 8, supportsSinglePlayer: true, supportsMultiplayer: true,
  tags: ['word', 'emoji', 'puzzle', 'multiplayer'],
  create: (context: GameContext) => new EmojiDecodeGame(context),
}
export default module
