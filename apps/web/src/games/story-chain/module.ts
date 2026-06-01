import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { StoryChainGame } from './story-chain.game'
const module: GameModule = {
  id: 'story-chain', name: 'Story Chain',
  description: 'Each player adds one sentence to a collaborative story, then vote for the funniest!',
  minPlayers: 2, maxPlayers: 6, supportsSinglePlayer: false, supportsMultiplayer: true,
  tags: ['creative', 'party', 'vote', 'word'],
  create: (context: GameContext) => new StoryChainGame(context),
}
export default module
