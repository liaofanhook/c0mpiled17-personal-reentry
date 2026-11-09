import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ACTIONS} from './gate.mjs';
import {packetSchema,VERSION,RETURNS} from './schema.mjs';
export const fingerprint=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const records=JSON.parse(readFileSync(new URL('../runtime/records.json',import.meta.url),'utf8'));
export const workspace_revision=fingerprint(records);
export const policy={
 record_manifest:records.map(({record_id,source_type,source_ref,native_metadata})=>({record_id,source_type,source_ref,native_metadata})),
 source_policy:'Draft is not submitted or final. Explicit supersedes relationships can replace earlier versions. No source surface has universal priority. Preserve unresolved equally official same-field conflicts. Capture time does not replace issue time. Owner direction decisions do not override organizer event facts.',
 permission_envelope:'Local read-only only. No external access, write-back, sending, submitting, approval, or deciding on behalf of the owner. Drafts are in-memory views only.',
 target_action_schema:'action_type, requested_effect, target_ref, description; the goal may be out of scope and must be preserved honestly.',
 allowed_action_catalog:ACTIONS,
 return_operation_catalog:RETURNS,
 output_schema:packetSchema
};
export const policy_revision=fingerprint(policy);
export function makeInput(anchor,request_id){return {schema_version:VERSION,request_id,anchor,workspace_revision,workspace_as_of:'2026-12-06T18:00:00+09:00',records,policy_revision,policy_context:policy};}
