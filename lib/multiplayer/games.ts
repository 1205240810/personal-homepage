// Registry of online game modules served by the relay.
import type { GameModule } from './protocol.ts';
import { echoModule } from './echo.ts';
import { goOnline } from './go-online.ts';

// oxlint-disable-next-line typescript/no-explicit-any
export const GAME_MODULES: GameModule<any, any>[] = [echoModule, goOnline];
