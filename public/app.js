const $=s=>document.querySelector(s);
const anchor=$('#anchor'),form=$('#anchor-form'),run=$('#run'),status=$('#status'),result=$('#result'),empty=$('#empty-state');
let epoch=0,current=null,controller=null,invalidations=Promise.resolve(),copy={};
const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined&&text!==null)n.textContent=text;return n;};
const add=(parent,...children)=>{for(const child of children)if(child)parent.append(child);return parent;};
const button=(text,fn,className='secondary')=>{const b=el('button',className,text);b.type='button';b.addEventListener('click',fn);return b;};
async function api(path,body,signal){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});const data=await response.json();if(!response.ok)throw new Error(data.error??'The request could not be processed.');return data;}
function progress(stage){for(const [id,on]of [['#step-episode',stage>=2],['#step-source',stage>=3],['#step-card',stage>=4]])$(id).classList.toggle('active',on);}
function clear(){current=null;result.hidden=true;result.replaceChildren();status.hidden=true;status.replaceChildren();empty.hidden=false;$('#evidence-dialog').close();progress(1);}
function invalidate(){epoch++;controller?.abort();controller=null;run.disabled=false;clear();invalidations=invalidations.catch(()=>{}).then(()=>api('/invalidate',{}));}
anchor.addEventListener('input',invalidate);
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!anchor.value.trim()){status.hidden=false;status.textContent='Enter a few words about the work you want to resume.';return;}
 const ticket=++epoch,value=anchor.value;
 controller?.abort();controller=new AbortController();const signal=controller.signal;
 clear();empty.hidden=true;run.disabled=true;status.hidden=false;progress(2);
 add(status,el('span','loading-dot'),el('span','','Finding the work episode…'),el('p','loading-small','Checking the same 15 visible records. Sources and work position are assessed before an action becomes available.'));
 try{
   await invalidations;
   if(ticket!==epoch)return;
   const data=await api('/reentry',{anchor:value},signal);
   if(ticket!==epoch)return;
   current=data;status.hidden=true;progress(data.gate.gate_stage>=2?4:2);render(data);
 }catch(error){
   if(ticket!==epoch||error.name==='AbortError')return;
   current=null;result.hidden=true;status.replaceChildren(el('span','',error.message),el('p','loading-small','No action was authorized. Review the input before trying again.'));status.hidden=false;
 }finally{if(ticket===epoch){run.disabled=false;controller=null;}}
});
function label(text){return el('h3','field-label',text);}
function citations(parent,list){for(const c of [...new Map((list??[]).map(c=>[JSON.stringify(c),c])).values()])parent.append(button(c.record_id,()=>viewEvidence(c.record_id),'cite'));return parent;}
function cited(parent,value){if(!value){parent.append(el('p','body-text','Not recovered'));return;}parent.append(el('p','body-text',value.text));citations(parent,value.citations);}
function adjust(){invalidate();anchor.focus();anchor.select();}
function render(data){
 const {gate:g,packet:p}=data;const ready=g.control_disposition==='CONTINUE'&&g.execution_state==='READY'&&g.recovery_scope==='FULL'&&g.reason_code==='NONE'&&g.proposed_system_action;
 const text=copy[g.reason_code]??['A valid recovery result could not be produced',g.explanation];
 const card=el('article',`card ${ready?'ready':'hold'}`),header=el('div','card-header'),heading=el('div');
 add(heading,el('div','card-kicker',ready?'CONTEXT RECOVERED · NEXT STEP CHECKED':'CONTROL RETURNED · REVIEW REQUIRED'));
 const title=el('h2','',text[0]);title.id='card-title';add(heading,title,el('p','',text[1]));
 add(header,heading,el('span','result-stamp',`Recovery: ${g.recovery_scope.toLowerCase()}`));card.append(header);
 const body=el('div','card-body'),work=el('div','work-column'),control=el('div','control-column');
 work.append(label('Recovered episode'));
 if(p?.resolved_episode){work.append(el('h3','episode-title',p.resolved_episode.label));citations(work,p.resolved_episode.basis.citations);const match=el('div','action-block');match.append(label('Anchor match'));cited(match,p.candidate_episodes[0]?.anchor_match);work.append(match);}
 else if(p?.clarification){const q=el('div','clarification');add(q,el('h3','',p.clarification.question));for(const option of p.clarification.options){const candidate=p.candidate_episodes.find(c=>c.candidate_id===option.candidate_id);const optionBlock=el('div');optionBlock.append(button(option.label,()=>{const next=`Continue preparing for ${option.label}. Bring me back to its current work position.`;invalidate();anchor.value=next;form.requestSubmit();}));if(candidate)citations(optionBlock,candidate.anchor_match.citations);q.append(optionBlock);}work.append(q);}
 else work.append(el('p','body-text','Not recovered'));
 const position=el('section','work-position');position.append(label('Current work position'));
 if(p?.work_position){for(const [key,name]of [['summary','Now'],['completed','Completed'],['next_step','Next step']]){const row=el('div','wp-row'),v=el('div','wp-value');add(row,el('span','wp-name',name));if(p.work_position[key]){add(v,el('span','',p.work_position[key].text));citations(v,p.work_position[key].citations);}else v.textContent='Not recovered';add(row,v);position.append(row);}}
 else position.append(el('p','body-text',g.gate_stage<2?'Not assessed at this stage':'Not recovered'));
 work.append(position);
 if(p?.conflicts.length){for(const conflict of p.conflicts){const box=el('div','conflict-box'),sides=el('div','conflict-sides');box.append(el('div','conflict-title',`${conflict.field} · unresolved`));for(const side of conflict.sides){const sideBox=el('div','conflict-side');add(sideBox,el('strong','',side.value),el('p','',side.citations.map(c=>c.record_id).join(' · ')));citations(sideBox,side.citations);sides.append(sideBox);}add(box,sides,el('div','conflict-context',`${conflict.entity_key} · ${conflict.event_date} · ${conflict.timezone} · same field`));work.append(box);}}
 if(p?.unresolved_items.length){for(const item of p.unresolved_items){const pending=el('div','pending');add(pending,el('h4','',item.kind==='HUMAN_DECISION'?'Unresolved items · Human decision':'Unresolved items'),el('p','',item.description.text));const blocks=item.blocks_action_types.includes(g.target_action?.action_type);pending.append(el('small','',g.gate_stage<3?'Action dependency not assessed at this stage':blocks?'Blocks the target action':'Does not block the listed action'));citations(pending,item.description.citations);work.append(pending);}}
 else if(p?.unresolved_assessment==='COMPLETE'){const noPending=el('div','pending');add(noPending,el('h4','','Unresolved items'),el('p','','No unresolved items recovered.'));citations(noPending,p.unresolved_basis);work.append(noPending);}
 add(control,label('Control decision'));
 for(const [key,name]of [['control_disposition','Control'],['execution_state','Execution'],['recovery_scope','Recovery'],['reason_code','Reason'],['diagnostic_codes','Diagnostics']]){const row=el('div','control-axis'),value=Array.isArray(g[key])?g[key].join(', ')||'NONE':g[key];add(row,el('span','',name),el('strong',ready?'':'hold-color',value));control.append(row);}
 for(const [name,a]of [['Target action',g.target_action],['System action',g.proposed_system_action]]){const block=el('div','action-block');block.append(label(name));if(a){const value=el('p','action-value');value.append(el('code','',a.action_type));add(block,value,el('p','body-text',a.description));}else block.append(el('p','action-value',name==='Target action'?'Not assessed at this stage':'No system action is available for this request.'));control.append(block);}
 if(g.return_operation){const block=el('div','action-block');add(block,label('Return operation'),el('p','action-value',g.return_operation),el('p','body-text','The current target remains unapproved.'));control.append(block);}
 const actions=el('div','card-actions');
 if(ready)actions.append(button('Continue from here ↗',continueWork,'primary'));
 else if(g.return_operation==='PRESENT_HUMAN_DECISION')actions.append(button('Review human decision',()=>{const note=el('div','clarification');add(note,el('h3','','A human decision is still pending'),el('p','body-text',p?.unresolved_items.filter(u=>u.kind==='HUMAN_DECISION').map(u=>u.description.text).join(' ')||g.explanation),el('p','body-text','Express your decision in a new anchor. Reviewing this card does not authorize the action.'),button('Adjust interpretation',adjust));work.append(note);note.scrollIntoView({behavior:'smooth',block:'center'});}));
 else if(g.return_operation==='REQUEST_EVIDENCE'&&p)actions.append(button('Review needed evidence',()=>{const note=el('div','clarification');add(note,el('h3','','More evidence is needed'),el('p','body-text',p.conflicts.length?'Clarify the conflicting fact with its official source. This prototype cannot import new evidence or choose a winner.':p.missing_evidence.map(e=>e.needed_fact).join(' ')||g.explanation));work.append(note);note.scrollIntoView({behavior:'smooth',block:'center'});}));
 actions.append(button('Adjust interpretation',adjust));control.append(actions);
 const stages=document.createElement('details');stages.className='evidence-panel';stages.append(el('summary','','Stage assessments'));for(const [name,value]of Object.entries(g.stage_assessments)){const row=el('div','control-axis');add(row,el('span','',name.replaceAll('_',' ')),el('strong','',value==='N/A'?'Not assessed at this stage':value));stages.append(row);}control.append(stages);
 add(body,work,control);card.append(body);
 if(p&&g.accepted_citations.length){const evidence=el('details','evidence-panel');evidence.id='source-evidence';add(evidence,el('summary','','View evidence · Valid sources / Historical, draft or conflicting'),el('p','source-note','Source classifications are inferred from the visible records.'));
   for(const claim of p.evidence_ledger){const row=el('div','evidence-row'),head=el('div','evidence-head');add(head,el('span','field-label',claim.field),el('span',`role ${claim.role==='CONFLICT'?'conflict':''}`,claim.role));add(row,head,el('p','',claim.claim));citations(row,claim.citations);for(const basis of p.authority_currentness_basis.filter(b=>b.claim_id===claim.claim_id)){row.append(el('p','basis',basis.basis.text));citations(row,basis.basis.citations);}evidence.append(row);}card.append(evidence);
 }else{const noEvidence=el('div','evidence-panel');noEvidence.append(el('p','source-note','No verified record reference is available for this result.'));card.append(noEvidence);}
 const technical=el('div','technical');add(technical,el('span','',`REQUEST ${data.request_id.slice(0,8)} · WORKSPACE ${data.workspace_revision.slice(0,8)}`),el('span','','MODEL-ASSISTED · SYNTHETIC · READ-ONLY'));card.append(technical);
 result.replaceChildren(card);result.hidden=false;empty.hidden=true;result.scrollIntoView({behavior:'smooth',block:'start'});
}
async function continueWork(){
 const snapshot=current,ticket=epoch;
 if(!snapshot||snapshot.gate.execution_state!=='READY')return;
 try{const data=await api('/continue',{request_id:snapshot.request_id});if(ticket!==epoch||current!==snapshot)return;
  $('#surface')?.remove();const surface=el('section','surface');surface.id='surface';add(surface,el('h3','',data.action_type==='DRAFT_STORYBOARD'?'Recovered storyboard workspace':'Recovered work'),el('p','',data.notice));const grid=el('div','surface-grid');for(const [name,text]of Object.entries(data.fields)){const field=el('div');add(field,el('h4','',name),el('p','',text));grid.append(field);}surface.append(grid);$('.technical').before(surface);surface.scrollIntoView({behavior:'smooth',block:'center'});
 }catch{if(ticket!==epoch)return;invalidate();status.hidden=false;status.textContent='No current authorized action is available. Run re-entry again.';}
}
async function viewEvidence(record_id){const snapshot=current,ticket=epoch;if(!snapshot)return;try{const response=await fetch(`/evidence?request_id=${encodeURIComponent(snapshot.request_id)}&record_id=${encodeURIComponent(record_id)}`);if(!response.ok)throw new Error();const data=await response.json();if(ticket!==epoch)return;const r=data.record,content=$('#evidence-content');content.replaceChildren(el('p','record-type',`${r.source_type.replaceAll('_',' ')} · ${r.record_id} · SYNTHETIC`));const heading=el('h2','',r.title);heading.id='evidence-title';add(content,heading,el('p','record-body',r.content),el('p','source-note',`${r.actor} · ${r.timestamp}`),el('h3','field-label','Verified source excerpts'));for(const c of data.citations)content.append(el('blockquote','',c.quote));if(data.basis.length){content.append(el('h3','field-label','Model’s source basis'));for(const b of data.basis)content.append(el('p','body-text',b.basis.text));}add(content,el('h3','field-label','Native metadata'),el('pre','',JSON.stringify(r.native_metadata,null,2)));$('#evidence-dialog').showModal();}catch{status.hidden=false;status.textContent='No verified record reference is available for this result.';}}
$('#close-evidence').addEventListener('click',()=>$('#evidence-dialog').close());
$('#evidence-dialog').addEventListener('click',e=>{if(e.target===$('#evidence-dialog'))$('#evidence-dialog').close();});
fetch('/meta').then(r=>r.json()).then(data=>{copy=data.copy;}).catch(()=>{status.hidden=false;status.textContent='The local service is unavailable.';run.disabled=true;});
window.addEventListener('pagehide',()=>{navigator.sendBeacon('/invalidate',new Blob(['{}'],{type:'application/json'}));});
