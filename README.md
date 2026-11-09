# Personal Re-entry

**Resume the right work, not just the last chat.**

A read-only prototype for people returning to interrupted AI work. Give it a rough anchor; it recovers the relevant work episode, checks visible sources, and restores the current work position. A separate deterministic gate permits one local read-only next step or returns control with a specific reason.

Built from new source during the November 9, 2026 c0mpiled-17 session, officially started at 10:01 KST. First commit: 10:08 KST. No product code or Git history was reused from preparation.

## Run locally

Use Node.js 22 or later (verified on 24.21.0).

```sh
npm ci --ignore-scripts
```

Provide `OPENAI_API_KEY` through your existing secure process environment. Keep it out of source files, browser code, and Git. Create a private cost ledger outside this repository containing `{"attempts":[]}`, then set `REENTRY_COST_LEDGER` to its absolute path.

```sh
npm start
```

Open `http://127.0.0.1:4173`. The server binds only to loopback. It loads one immutable workspace for every query and keeps working results only in memory. The ledger stores budget metadata, not user work.

For an isolated process, use Node's permission mode with read access to this repository and the exact ledger file, plus write access to that ledger and its `.lock` file. The server needs no access to any evaluation directory or credential file when the key is already in its process environment.

## How it works

1. Enter a rough anchor for interrupted work.
2. One OpenAI Responses resolver receives all 15 synthetic records and a fixed policy. It produces a candidate packet with exact source excerpts, current work position, and unresolved dependencies.
3. A closed local schema verifies structure, visible citations, and request fingerprints. A deterministic gate checks episode resolution, evidence, work-position completeness, permitted actions, and action-specific human decisions in that order.
4. A ready result can open one read-only surface. A hold returns control for clarification, evidence, or a human decision. The server retains and revalidates the permitted action; the browser cannot supply an action or policy.

The configured runtime is `gpt-6.1-sol`, medium reasoning, default service tier, `store=false`, 30-second timeout, 6,000 output-token cap, and no automatic retries. The SDK is pinned to `openai@7.53.0`. An exact provider token-count baseline and conservative bounds over variable fields enforce a 20,000-token input cap. The build's approved budget is a 64-request cap and USD 10 exposure cap, including unknown-cost reserves. These caps persist across restarts through the private ledger.

## Validation during the build

The six end-to-end scenarios passed on the current resolver and gate: storyboard continuation, two-episode ambiguity, conflicting official start times, a pending human decision, an out-of-scope decision/update request, and an insufficient anchor. The storyboard and conflict branches each passed two consecutive fresh requests.

Independent control checks passed all G01–G18 groups, including 108 result combinations (11 legal), bad citations, altered policies, unsafe target/candidate actions, stale request fingerprints, and failure closure. Mechanical schema checks exercised 547 mutations. Session and HTTP checks verified stale-result rejection, current HOLD dispatch refusal, injected-action rejection, evidence access, and closed static routes. Browser checks covered source inspection, read-only continuation, HOLD controls, input invalidation, human-control return, transport failure, and a 390px responsive layout.

Earlier failed runs and timeouts were retained privately and are not represented as passing. This is a small synthetic acceptance matrix, not a statistical accuracy or production safety claim. Private evaluation material and receipts are excluded from this repository. Optional `REENTRY_EVIDENCE_STDOUT=1` emits synthetic evaluation packets for an external local runner; ordinary operation emits only safe run metadata.

## Scope

One shared workspace of 15 synthetic records across six source types. No real connectors, account system, write-back, sending, submission, or deployment. Source classifications are model inferences checked against visible citations; they are not a guarantee of semantic correctness.

The product repository excludes planning inputs, private evaluation material, receipts, and credentials.
