export const VERSION = 'reentry-1';
export const REASONS = ['NONE','INVALID_PACKET','AMBIGUOUS_EPISODE','INSUFFICIENT_ANCHOR','SOURCE_CONFLICT','INSUFFICIENT_EVIDENCE','WORK_POSITION_INCOMPLETE','ACTION_OUT_OF_SCOPE','HUMAN_DECISION_REQUIRED'];
export const RETURNS = ['ASK_CLARIFICATION','PRESENT_HUMAN_DECISION','REQUEST_EVIDENCE','VIEW_EVIDENCE','STOP_OUT_OF_SCOPE'];
const str = {type:'string',minLength:1};
const en = values => ({type:'string',enum:values});
const arr = (items,minItems=0,maxItems) => ({type:'array',items,minItems,...(maxItems===undefined?{}:{maxItems})});
const obj = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const nullable = schema => ({anyOf:[schema,{type:'null'}]});
export const citationSchema = obj({record_id:str,field_path:str,quote:str});
const citations = arr(citationSchema,1);
const cited = obj({text:str,citations});
export const actionSchema = obj({action_type:str,requested_effect:en(['READ_ONLY_OPEN','READ_ONLY_DRAFT','HUMAN_DECISION','WRITE','SEND','SUBMIT','OTHER']),target_ref:str,description:str});
const assessment = en(['N/A','COMPLETE','INCOMPLETE']);
export const packetSchema = obj({
  schema_version:{type:'string',enum:[VERSION]},request_id:str,workspace_revision:str,policy_revision:str,
  anchor_interpretation:obj({text:str,continuity_relevant:{type:'boolean'}}),
  resolution_status:en(['UNIQUE','AMBIGUOUS','INSUFFICIENT']),
  candidate_episodes:arr(obj({candidate_id:str,label:str,anchor_match:cited}),0,2),
  resolved_episode:nullable(obj({candidate_id:str,label:str,basis:cited})),
  clarification:nullable(obj({question:str,options:arr(obj({candidate_id:str,label:str}),2,2)})),
  evidence_ledger:arr(obj({claim_id:str,claim:str,field:str,role:en(['SUPPORT','HISTORICAL','DRAFT','CONFLICT']),citations})),
  authority_currentness_basis:arr(obj({claim_id:str,record_ids:arr(str,1),basis:cited})),
  evidence_assessment:en(['N/A','SUFFICIENT','CONFLICT','INSUFFICIENT']),
  conflicts:arr(obj({field:str,entity_key:str,event_date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},timezone:str,sides:arr(obj({value:str,citations}),2),unresolved_basis:cited})),
  missing_evidence:arr(obj({needed_fact:str,basis:cited})),
  work_position:nullable(obj({summary:nullable(cited),completed:nullable(cited),next_step:nullable(cited)})),
  work_position_assessment:assessment,
  unresolved_items:arr(obj({item_id:str,kind:en(['HUMAN_DECISION','SOURCE_CONFLICT','MISSING_EVIDENCE','OTHER']),description:cited,blocks_action_types:arr(str),blocking_basis:cited})),
  unresolved_assessment:assessment,unresolved_basis:arr(citationSchema),
  target_action:nullable(actionSchema),candidate_system_action:nullable(actionSchema),
  return_operation_candidate:nullable(en(RETURNS)),
  candidate_reason_codes:arr(en(REASONS)),candidate_diagnostic_codes:arr(en(REASONS.slice(1)))
});

// The same closed schema is used for provider structured output and local checks.
// It does not interpret the semantic truth of model claims.
export function validateSchema(value,schema,path='$',errors=[]) {
  if(schema.anyOf){
    if(!schema.anyOf.some(s=>validateSchema(value,s,path,[]).length===0)) errors.push(`${path}: no allowed type`);
    return errors;
  }
  const type = value===null?'null':Array.isArray(value)?'array':typeof value;
  if(type!==schema.type){errors.push(`${path}: expected ${schema.type}`);return errors;}
  if(schema.enum&&!schema.enum.includes(value)) errors.push(`${path}: unknown enum`);
  if(type==='object'){
    for(const k of schema.required??[]) if(!Object.hasOwn(value,k)) errors.push(`${path}.${k}: required`);
    for(const k of Object.keys(value)){
      if(!Object.hasOwn(schema.properties,k)) errors.push(`${path}.${k}: unknown field`);
      else validateSchema(value[k],schema.properties[k],`${path}.${k}`,errors);
    }
  }
  if(type==='array'){
    if(value.length<(schema.minItems??0)||value.length>(schema.maxItems??Infinity)) errors.push(`${path}: array length`);
    value.forEach((v,i)=>validateSchema(v,schema.items,`${path}[${i}]`,errors));
  }
  if(type==='string'&&((schema.minLength&&value.trim().length<schema.minLength)||(schema.pattern&&!new RegExp(schema.pattern).test(value)))) errors.push(`${path}: invalid string`);
  return errors;
}
export function collectCitations(value,out=[]){
  if(!value||typeof value!=='object')return out;
  if(Object.hasOwn(value,'record_id')&&Object.hasOwn(value,'field_path')&&Object.hasOwn(value,'quote'))out.push(value);
  else for(const v of Object.values(value))collectCitations(v,out);
  return out;
}
export function validatePacket(p,input){
  const errors=validateSchema(p,packetSchema);
  if(errors.length)return errors;
  for(const key of ['request_id','workspace_revision','policy_revision']) if(p[key]!==input[key])errors.push(`${key}: envelope mismatch`);
  const byId=new Map(input.records.map(r=>[r.record_id,r]));
  for(const c of collectCitations(p)){
    const r=byId.get(c.record_id);
    const field=c.field_path==='title'||c.field_path==='content'?r?.[c.field_path]:c.field_path.startsWith('native_metadata.')?r?.native_metadata[c.field_path.slice(16)]:undefined;
    if(typeof field!=='string'||!field.includes(c.quote))errors.push('citation: invisible record, invalid field, or quote mismatch');
  }
  const ids=p.candidate_episodes.map(e=>e.candidate_id);
  if(new Set(ids).size!==ids.length)errors.push('duplicate candidate');
  const claims=p.evidence_ledger.map(e=>e.claim_id);
  if(new Set(claims).size!==claims.length)errors.push('duplicate claim');
  for(const b of p.authority_currentness_basis)if(!claims.includes(b.claim_id)||b.record_ids.some(id=>!byId.has(id)))errors.push('invalid basis link');
  if(new Set(p.unresolved_items.map(x=>x.item_id)).size!==p.unresolved_items.length)errors.push('duplicate unresolved item');
  if(p.resolution_status==='UNIQUE'){
    if(ids.length!==1||!p.resolved_episode||!ids.includes(p.resolved_episode.candidate_id)||p.clarification!==null)errors.push('invalid unique resolution');
    if(p.evidence_assessment==='N/A'||p.work_position_assessment==='N/A'||p.unresolved_assessment==='N/A')errors.push('unique assessment N/A');
    if(!p.evidence_ledger.length||!p.authority_currentness_basis.length)errors.push('missing unique source basis');
    if(p.work_position_assessment==='COMPLETE'&&(!p.work_position||Object.values(p.work_position).some(x=>x===null)))errors.push('complete work position lacks required support');
    if(p.unresolved_assessment==='COMPLETE'&&!p.unresolved_basis.length)errors.push('complete unresolved state lacks support');
    if(p.evidence_assessment==='CONFLICT'&&!p.conflicts.length)errors.push('conflict without pair');
    if(p.evidence_assessment!=='CONFLICT'&&p.conflicts.length)errors.push('unassessed conflict');
    if(p.evidence_assessment==='INSUFFICIENT'&&!p.missing_evidence.length&&p.unresolved_assessment!=='INCOMPLETE')errors.push('insufficient evidence without missing fact');
    for(const c of p.conflicts){if(new Set(c.sides.map(s=>s.value)).size<2)errors.push('conflict values do not differ');}
  }else{
    if(p.resolved_episode!==null||p.work_position!==null||p.evidence_assessment!=='N/A'||p.work_position_assessment!=='N/A'||p.unresolved_assessment!=='N/A'||p.unresolved_items.length||p.unresolved_basis.length||p.authority_currentness_basis.length||p.conflicts.length||p.missing_evidence.length||p.target_action!==null||p.candidate_system_action!==null)errors.push('unresolved episode has downstream assessment');
    if(p.resolution_status==='AMBIGUOUS'&&(ids.length!==2||!p.clarification||new Set(p.clarification.options.map(o=>o.candidate_id)).size!==2||p.clarification.options.some(o=>!ids.includes(o.candidate_id))))errors.push('invalid clarification');
    if(p.resolution_status==='INSUFFICIENT'&&(p.clarification!==null||ids.length>1))errors.push('invalid insufficient resolution');
  }
  return errors;
}

export const legalCombinations = [
 ['CONTINUE','READY','FULL','NONE'],
 ['HUMAN_RETURN','HOLD','NONE','INVALID_PACKET'],['HUMAN_RETURN','HOLD','NONE','INSUFFICIENT_ANCHOR'],
 ['HUMAN_RETURN','HOLD','PARTIAL','AMBIGUOUS_EPISODE'],
 ...['SOURCE_CONFLICT','INSUFFICIENT_EVIDENCE'].flatMap(reason=>['FULL','PARTIAL'].map(scope=>['HUMAN_RETURN','HOLD',scope,reason])),
 ['HUMAN_RETURN','HOLD','PARTIAL','WORK_POSITION_INCOMPLETE'],
 ...['ACTION_OUT_OF_SCOPE','HUMAN_DECISION_REQUIRED'].map(reason=>['HUMAN_RETURN','HOLD','FULL',reason])
];
export function validCombination(g){return legalCombinations.some(row=>row.every((v,i)=>v===[g.control_disposition,g.execution_state,g.recovery_scope,g.reason_code][i]));}

const stageAssessment=en(['PASS','BLOCK','N/A']);
export const gateOutputSchema=obj({
 request_id:str,workspace_revision:str,policy_revision:str,gate_stage:{type:'number',enum:[0,1,2,3,4]},
 control_disposition:en(['CONTINUE','HUMAN_RETURN']),execution_state:en(['READY','HOLD']),recovery_scope:en(['FULL','PARTIAL','NONE']),reason_code:en(REASONS),diagnostic_codes:arr(en(REASONS.slice(1))),target_action:nullable(actionSchema),proposed_system_action:nullable(actionSchema),return_operation:nullable(en(RETURNS)),
 stage_assessments:obj({structure:stageAssessment,episode:stageAssessment,evidence:stageAssessment,work_position:stageAssessment,unresolved:stageAssessment,action_permission:stageAssessment,human_pending:stageAssessment}),accepted_citations:arr(citationSchema),explanation:str
});
