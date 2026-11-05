// Registry of online game modules served by the relay.
import type { GameModule } from './protocol.ts';
import { echoModule } from './echo.ts';
import { goOnline } from './go-online.ts';
import { blackjackDuel } from './blackjack-duel.ts';
import { holdemOnline } from './holdem-online.ts';
import { gomokuOnline } from './gomoku-online.ts';
import { hanamiOnline } from './hanami-online.ts';
import { quoridorOnline } from './quoridor-online.ts';
import { expeditionOnline } from './expedition-online.ts';
import { bazaarOnline } from './bazaar-online.ts';
import { glazeOnline } from './glaze-online.ts';
import { brocadeOnline } from './brocade-online.ts';

// oxlint-disable-next-line typescript/no-explicit-any
export const GAME_MODULES: GameModule<any, any>[] = [
  echoModule,
  goOnline,
  blackjackDuel,
  holdemOnline,
  gomokuOnline,
  hanamiOnline,
  quoridorOnline,
  expeditionOnline,
  bazaarOnline,
  glazeOnline,
  brocadeOnline,
];
