import {randomUUID} from 'node:crypto';
import {makeInput,workspace_revision,policy_revision} from './workspace.mjs';
import {gate,invalid,validOutput} from './gate.mjs';
import {validatePacket} from './schema.mjs';
export function createSessionStore(resolve){
 const sessions=new Map();
 function get(id){if(!sessions.has(id))sessions.set(id,{generation:0,current:null});return sessions.get(id);}
 return {
  invalidate(id){const s=get(id);s.generation++;s.current=null;},
  async run(id,anchor){
   const s=get(id);s.generation++;s.current=null;const generation=s.generation;
   const input=makeInput(anchor,randomUUID());
   let packet=null,info=null,g;
   try{({packet,info}=await resolve(input));
     // Semantic projection exists only in memory, before gate. It is never published ungoverned.
     const projection=packet&&typeof packet==='object'?structuredClone(packet):null;
     g=gate(packet,input);
     if(g.reason_code==='INVALID_PACKET')packet=null;else packet=projection;
   }catch{g=invalid(input);}
   if(generation!==s.generation)return {stale:true};
   const result={request_id:input.request_id,workspace_revision,policy_revision,runtime_mode:'model-assisted',packet,gate:g,info};
   s.current=result;
   return result;
  },
  current(id,request_id){const r=get(id).current;return r?.request_id===request_id?r:null;},
  continue(id,request_id){
   const r=this.current(id,request_id);
   if(!r||r.workspace_revision!==workspace_revision||r.policy_revision!==policy_revision||!validOutput(r.gate)||r.gate.execution_state!=='READY'||r.gate.control_disposition!=='CONTINUE'||!r.packet||validatePacket(r.packet,makeInput('',request_id)).length)throw new Error('No current authorized action');
   const fresh=gate(r.packet,makeInput('',request_id));
   if(JSON.stringify(fresh)!==JSON.stringify(r.gate)||!fresh.proposed_system_action)throw new Error('Result changed');
   const a=fresh.proposed_system_action;
   const fields=a.action_type==='DRAFT_STORYBOARD'?
    {'Problem':'Draft area — not saved','Rough anchor':r.packet.anchor_interpretation.text,'Source basis':r.packet.evidence_ledger.filter(e=>e.role==='SUPPORT').map(e=>e.claim).join(' '),'Current work position':r.packet.work_position.summary.text,'Permitted next step':r.packet.work_position.next_step.text,'Control return':'Draft area — not saved'}:
    a.action_type==='DRAFT_FINAL_DEMO_PLAN'?{'Recovered work':r.packet.resolved_episode.label,'Human decision basis':r.packet.unresolved_items.map(u=>u.description.text).join(' '),'Demo sequence':'Draft area — not saved','Evidence':r.packet.evidence_ledger.map(e=>e.claim).join(' '),'Boundaries':'Local read-only draft; not saved'}:
    {'Recovered work':r.packet.resolved_episode.label,'Current work position':r.packet.work_position.summary.text,'Evidence':r.packet.evidence_ledger.map(e=>e.claim).join(' ')};
   return {action_type:a.action_type,notice:'Draft area — not saved',fields};
  }
 };
}
