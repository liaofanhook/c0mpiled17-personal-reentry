import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {records,workspace_revision,policy_revision} from './lib/workspace.mjs';
import {createResolver,RUNTIME} from './lib/resolver.mjs';
import {budgetLedger} from './lib/budget.mjs';
import {createSessionStore} from './lib/session.mjs';
import {COPY} from './lib/gate.mjs';

const port=Number(process.env.PORT??4173),host='127.0.0.1';
const ledger=budgetLedger(process.env.REENTRY_COST_LEDGER);
const resolver=createResolver({apiKey:process.env.OPENAI_API_KEY,ledger,onAttempt:({payload,...info})=>console.log(JSON.stringify({type:'attempt',...info}))});
const store=createSessionStore(resolver);
const files=new Map([['/',['public/index.html','text/html; charset=utf-8']],['/app.js',['public/app.js','text/javascript; charset=utf-8']],['/styles.css',['public/styles.css','text/css; charset=utf-8']]].map(([path,[file,type]])=>[path,{body:readFileSync(new URL(file,import.meta.url)),type}]));
const clients=new Map();
function session(req,res){const existing=/reentry_session=([0-9a-f-]{36})(?:;|$)/.exec(req.headers.cookie??'')?.[1];if(existing&&clients.has(existing))return existing;const id=randomUUID();clients.set(id,Date.now());res.setHeader('Set-Cookie',`reentry_session=${id}; HttpOnly; SameSite=Strict; Path=/`);return id;}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>8000)throw new Error('Request too large');}return JSON.parse(data);}
const only=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(o,k));
export const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 try{
  if(!['127.0.0.1','localhost'].includes((req.headers.host??'').split(':')[0]))return json(res,403,{error:'Local prototype only'});
  if(req.headers.origin&&!new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`]).has(req.headers.origin))return json(res,403,{error:'Origin rejected'});
  const url=new URL(req.url,`http://${host}:${port}`);
  const sid=session(req,res);
  if(req.method==='GET'&&files.has(url.pathname)){if(url.pathname==='/')store.invalidate(sid);const f=files.get(url.pathname);res.writeHead(200,{'Content-Type':f.type});return res.end(f.body);}
  if(req.method==='GET'&&url.pathname==='/meta')return json(res,200,{runtime_mode:RUNTIME.mode,record_count:records.length,source_count:new Set(records.map(r=>r.source_type)).size,workspace_as_of:'2026-12-06T18:00:00+09:00',workspace_revision,policy_revision,copy:COPY});
  if(req.method==='POST'&&url.pathname==='/invalidate'){store.invalidate(sid);return json(res,200,{invalidated:true});}
  if(req.method==='POST'&&url.pathname==='/reentry'){
   const b=await body(req);store.invalidate(sid);
   if(!only(b,['anchor'])||typeof b.anchor!=='string'||!b.anchor.trim()||b.anchor.length>2000)return json(res,400,{error:'Enter a few words about the work you want to resume.'});
   if(!/\b(continue|resume|return|back|prepar|draft|plan|decide|work|event|meetup|pitch|demo)\w*\b/i.test(b.anchor))return json(res,422,{error:'This prototype resumes ongoing work. Enter the work you want to return to.',code:'UNSUPPORTED_REQUEST_IN_THIS_PROTOTYPE'});
   const result=await store.run(sid,b.anchor);
   if(result.stale)return json(res,409,{error:'Input changed. Run re-entry again.'});
   console.log(JSON.stringify({type:'result',request_id:result.request_id,reason_code:result.gate.reason_code,recovery_scope:result.gate.recovery_scope}));
   return json(res,200,result);
  }
  if(req.method==='POST'&&url.pathname==='/continue'){
   const b=await body(req);
   if(!only(b,['request_id'])||typeof b.request_id!=='string')return json(res,400,{error:'Only the current request ID is accepted'});
   try{return json(res,200,store.continue(sid,b.request_id));}catch{return json(res,403,{error:'No current authorized action is available.'});}
  }
  if(req.method==='GET'&&url.pathname==='/evidence'){
   const r=store.current(sid,url.searchParams.get('request_id'));
   const id=url.searchParams.get('record_id');
   if(!r||!r.gate.accepted_citations.some(c=>c.record_id===id))return json(res,403,{error:'No verified reference for this request'});
   const record=records.find(x=>x.record_id===id);
   return json(res,200,{record,citations:r.gate.accepted_citations.filter(c=>c.record_id===id),basis:r.packet?.authority_currentness_basis.filter(b=>b.record_ids.includes(id))??[]});
  }
  return json(res,404,{error:'Not found'});
 }catch{return json(res,400,{error:'The request could not be processed. No action was authorized.'});}
});
server.listen(port,host,()=>console.log(`Personal Re-entry listening at http://${host}:${port}`));
