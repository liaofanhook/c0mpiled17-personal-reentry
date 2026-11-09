import {collectCitations,validatePacket,validCombination,validateSchema,gateOutputSchema,REASONS,RETURNS} from './schema.mjs';
export const ACTIONS=Object.freeze({OPEN_RECOVERED_WORKSPACE:['READ_ONLY_OPEN','recovered-workspace'],DRAFT_STORYBOARD:['READ_ONLY_DRAFT','storyboard-draft'],DRAFT_FINAL_DEMO_PLAN:['READ_ONLY_DRAFT','final-demo-plan-draft']});
export const COPY=Object.freeze({
 NONE:['Ready to continue from this work position','The listed system action is available in this read-only prototype.'],
 AMBIGUOUS_EPISODE:['Which work episode do you mean?','Two plausible episodes match this anchor. Answer one question before continuing.'],
 INSUFFICIENT_ANCHOR:['Add one more clue','There is not enough information to identify a useful work episode.'],
 SOURCE_CONFLICT:['A source conflict blocks this step','The visible sources disagree on a fact this action depends on. The conflict has not been resolved.'],
 INSUFFICIENT_EVIDENCE:['More evidence is needed','A fact needed for this step is not sufficiently supported by the visible records.'],
 WORK_POSITION_INCOMPLETE:['The work position is incomplete','The episode is identified, but its current work position has not been fully recovered.'],
 HUMAN_DECISION_REQUIRED:['A human decision is still pending','This action depends on a decision that has not been made. Reviewing the decision does not authorize the action.'],
 ACTION_OUT_OF_SCOPE:['This action is outside the prototype’s permissions','The prototype cannot make this decision or perform the requested change. Human confirmation does not expand its permissions.'],
 INVALID_PACKET:['A valid recovery result could not be produced','No action is available for this request. Review the input before trying again.']
});
const clone=x=>structuredClone(x);
export function allowedAction(a,system=false){return !!a&&Object.hasOwn(ACTIONS,a.action_type)&&a.requested_effect===ACTIONS[a.action_type][0]&&!/^[a-z][a-z0-9+.-]*:|^[\/\\]|\b(?:https?|mailto):/i.test(a.target_ref)&&(!system||a.target_ref===ACTIONS[a.action_type][1]);}
export function validOutput(g){
  if(validateSchema(g,gateOutputSchema).length)return false;
  if(!validCombination(g)||!Array.isArray(g.diagnostic_codes)||new Set(g.diagnostic_codes).size!==g.diagnostic_codes.length||g.diagnostic_codes.some(c=>!REASONS.slice(1).includes(c)||c===g.reason_code))return false;
  if(g.control_disposition==='CONTINUE')return g.gate_stage===4&&allowedAction(g.proposed_system_action,true)&&allowedAction(g.target_action)&&g.target_action.action_type===g.proposed_system_action.action_type&&g.return_operation===null&&g.diagnostic_codes.length===0&&Object.values(g.stage_assessments).every(x=>x==='PASS');
  const expectedStage={INVALID_PACKET:0,AMBIGUOUS_EPISODE:1,INSUFFICIENT_ANCHOR:1,SOURCE_CONFLICT:2,INSUFFICIENT_EVIDENCE:2,WORK_POSITION_INCOMPLETE:2,ACTION_OUT_OF_SCOPE:3,HUMAN_DECISION_REQUIRED:3}[g.reason_code];
  return g.gate_stage===expectedStage&&g.proposed_system_action===null&&RETURNS.includes(g.return_operation)&&!(g.diagnostic_codes.includes('WORK_POSITION_INCOMPLETE')&&g.recovery_scope==='FULL');
}
export function invalid(input){return {
 request_id:input.request_id,workspace_revision:input.workspace_revision,policy_revision:input.policy_revision,
 gate_stage:0,control_disposition:'HUMAN_RETURN',execution_state:'HOLD',recovery_scope:'NONE',reason_code:'INVALID_PACKET',diagnostic_codes:[],target_action:null,proposed_system_action:null,return_operation:'REQUEST_EVIDENCE',
 stage_assessments:{structure:'BLOCK',episode:'N/A',evidence:'N/A',work_position:'N/A',unresolved:'N/A',action_permission:'N/A',human_pending:'N/A'},accepted_citations:[],explanation:COPY.INVALID_PACKET[1]
};}
export function gate(p,input){
 if(validatePacket(p,input).length)return invalid(input);
 const s={structure:'PASS',episode:'N/A',evidence:'N/A',work_position:'N/A',unresolved:'N/A',action_permission:'N/A',human_pending:'N/A'};
 const cites=[...new Map(collectCitations(p).map(c=>[JSON.stringify(c),c])).values()];
 const finish=(stage,scope,reason,ret,diagnostics=[])=>{
   const ready=reason==='NONE';
   const result={request_id:input.request_id,workspace_revision:input.workspace_revision,policy_revision:input.policy_revision,gate_stage:stage,control_disposition:ready?'CONTINUE':'HUMAN_RETURN',execution_state:ready?'READY':'HOLD',recovery_scope:scope,reason_code:reason,diagnostic_codes:diagnostics,target_action:p.target_action?clone(p.target_action):null,proposed_system_action:ready?clone(p.candidate_system_action):null,return_operation:ret,stage_assessments:{...s},accepted_citations:clone(cites),explanation:COPY[reason][1]};
   return validOutput(result)?result:invalid(input);
 };
 if(p.resolution_status!=='UNIQUE'){
   s.episode='BLOCK';
   return finish(1,p.resolution_status==='AMBIGUOUS'?'PARTIAL':'NONE',p.resolution_status==='AMBIGUOUS'?'AMBIGUOUS_EPISODE':'INSUFFICIENT_ANCHOR','ASK_CLARIFICATION');
 }
 s.episode='PASS';s.work_position=p.work_position_assessment==='COMPLETE'?'PASS':'BLOCK';s.unresolved=p.unresolved_assessment==='COMPLETE'?'PASS':'BLOCK';
 const scope=s.work_position==='PASS'&&s.unresolved==='PASS'?'FULL':'PARTIAL';
 const wpDiagnostic=s.work_position==='BLOCK'?['WORK_POSITION_INCOMPLETE']:[];
 if(p.evidence_assessment==='CONFLICT'){
   s.evidence='BLOCK';return finish(2,scope,'SOURCE_CONFLICT','REQUEST_EVIDENCE',wpDiagnostic);
 }
 if(p.evidence_assessment==='INSUFFICIENT'||p.unresolved_assessment!=='COMPLETE'){
   s.evidence='BLOCK';return finish(2,scope,'INSUFFICIENT_EVIDENCE','REQUEST_EVIDENCE',wpDiagnostic);
 }
 s.evidence='PASS';
 if(s.work_position==='BLOCK')return finish(2,'PARTIAL','WORK_POSITION_INCOMPLETE','REQUEST_EVIDENCE');
 if(!p.target_action)return invalid(input);
 const blocking=p.unresolved_items.some(u=>u.kind==='HUMAN_DECISION'&&u.blocks_action_types.includes(p.target_action.action_type));
 s.human_pending=blocking?'BLOCK':'PASS';
 const permitted=allowedAction(p.target_action)&&(!p.candidate_system_action||allowedAction(p.candidate_system_action,true)&&p.candidate_system_action.action_type===p.target_action.action_type);
 s.action_permission=permitted?'PASS':'BLOCK';
 if(!permitted)return finish(3,'FULL','ACTION_OUT_OF_SCOPE','STOP_OUT_OF_SCOPE',blocking?['HUMAN_DECISION_REQUIRED']:[]);
 if(blocking)return finish(3,'FULL','HUMAN_DECISION_REQUIRED','PRESENT_HUMAN_DECISION');
 if(!p.candidate_system_action)return invalid(input);
 return finish(4,'FULL','NONE',null);
}
