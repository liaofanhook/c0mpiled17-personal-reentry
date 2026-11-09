import {readFileSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {RUNTIME} from './resolver.mjs';
export function budgetLedger(path){
 if(!path)throw new Error('An explicit private cost-ledger path is required');
 const read=()=>JSON.parse(readFileSync(path,'utf8'));
 const exposure=state=>state.attempts.reduce((s,a)=>s+(a.cost??a.reserve),0);
 const transaction=fn=>{
  const lock=openSync(`${path}.lock`,'wx',0o600);
  try{const state=read(),value=fn(state);writeFileSync(path,JSON.stringify(state,null,2),{mode:0o600});return value;}
  finally{closeSync(lock);unlinkSync(`${path}.lock`);}
 };
 return {
  countCache(key){return read().token_counts?.[key]??null;},
  cacheCount(key,value){transaction(state=>{state.token_counts??={};state.token_counts[key]=value;});},
  reserve(amount,kind='resolve'){return transaction(state=>{if(state.attempts.length>=RUNTIME.max_calls||exposure(state)+amount>RUNTIME.cost_hard_stop)throw Object.assign(new Error('Runtime budget cap reached'),{safe_code:'BUDGET_LIMIT'});const id=state.attempts.length+1;state.attempts.push({id,kind,time:new Date().toISOString(),reserve:amount,cost:null});return id;});},
  settle(id,cost){if(cost!==null)transaction(state=>{state.attempts.find(a=>a.id===id).cost=cost;});},
  pending(id){const a=read().attempts.find(a=>a.id===id);return a.cost===null?a.reserve:0;},
  summary(){const state=read();return {calls:state.attempts.length,max_calls:RUNTIME.max_calls,estimated_usd:state.attempts.reduce((s,a)=>s+(a.cost??0),0),unknown_reserve_usd:state.attempts.filter(a=>a.cost===null).reduce((s,a)=>s+a.reserve,0),warning:exposure(state)>=RUNTIME.cost_warning,hard_stop:RUNTIME.cost_hard_stop};}
 };
}
