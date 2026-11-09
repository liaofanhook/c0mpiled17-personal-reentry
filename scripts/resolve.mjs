import {createResolver} from '../lib/resolver.mjs';
import {budgetLedger} from '../lib/budget.mjs';
import {makeInput} from '../lib/workspace.mjs';
import {gate} from '../lib/gate.mjs';
import {validatePacket} from '../lib/schema.mjs';
import {randomUUID} from 'node:crypto';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const {anchor}=JSON.parse(raw);
const input=makeInput(anchor,randomUUID());
const resolver=createResolver({apiKey:process.env.OPENAI_API_KEY,ledger:budgetLedger(process.env.REENTRY_COST_LEDGER),onAttempt:attempt=>console.log(JSON.stringify({type:'attempt',...attempt}))});
try{
 const {packet,info}=await resolver(input);
 console.log(JSON.stringify({type:'result',input,packet,gate:gate(packet,input),validation_errors:validatePacket(packet,input),info}));
}catch(e){console.log(JSON.stringify({type:'error',error_code:e.safe_code??'RESOLVER_FAILURE'}));process.exitCode=1;}
