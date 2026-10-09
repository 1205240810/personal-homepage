import {chooseHold} from './logic';
self.onmessage=e=>{const {dice,card,difficulty}=e.data;self.postMessage(chooseHold(dice,card,difficulty));};
