# Proof appendix — Cardwake

A **proof** in this project is a claim made verifiable by a single command anyone can rerun: the code that runs it lives in the repository, not in a document. The rule is one line long: **a green proof is a verifiable claim, not a promise** — green as long as its command exits 0, red the moment it does not, and nothing declares it green on its own. The 29 proofs P-01 to P-29 cover the twenty-three acceptance properties of the requirements notebook (`CAR-P-01` to `CAR-P-23`, one proof each, one to one) plus six end-to-end scenarios: the quote stack, the manor, the spy, phrase-to-script, the 40-task evaluation game, and the keyless demo.

Everything runs **with no API key and no network**: model answers come from recorded cassettes and a local fake model — verified by rerunning the whole suite with the network blocked (426 tests, 0 failures). To rerun everything: `npm run preuves` — the registry executes the 29 commands and writes the report to `docs/preuves/rapport.md` (human-readable) and `docs/preuves/rapport.json` (tooling). The verdict column below mirrors that report; step labels and commands are copied word for word from the project's proof registry.

Each of the 29 commands was executed on this repository and exits 0 (green verdict); the report keeps the per-proof detail. What is not proven is listed honestly at the end, and nothing else in this document claims otherwise.

## The 29 proofs

| id | step | what it proves | command | verdict |
|---|---|---|---|---|
| P-01 | language round trip | printing then parsing gives back the same tree | `npx vitest run packages/lang/test/print.test.ts` | green |
| P-02 | analysis robustness | any text yields a tree or positioned errors | `npx vitest run packages/lang/test/print.test.ts` | green |
| P-03 | plain-language readback | at least one sentence per instruction, every object named | `npx vitest run packages/lang/test/paraphrase.test.ts` | green |
| P-04 | determinism | same seed, exactly the same sequence of effects | `npx vitest run packages/lang/test/interpreter.test.ts` | green |
| P-05 | text chunks | writing then reading returns what was written | `npx vitest run packages/lang/test/values-chunks.test.ts` | green |
| P-06 | guard rails | an endless loop stops under maxSteps | `npx vitest run packages/lang/test/interpreter.test.ts` | green |
| P-07 | all or nothing | an aborted transaction leaves no trace | `npx vitest run packages/model/test/ops-journal.test.ts` | green |
| P-08 | inverse | a sequence of operations then their inverses restores the stack | `npx vitest run packages/model/test/ops-journal.test.ts` | green |
| P-09 | message hierarchy | the path travelled is visible | `npx vitest run packages/model/test/dispatch.test.ts` | green |
| P-10 | identifiers | unique, never reused | `npx vitest run packages/model/test/ops-journal.test.ts` | green |
| P-11 | no overreach | the adversarial fake model does not get through | `npx vitest run packages/agent/test/loop-adversary.test.ts` | green |
| P-12 | no elevation | neither level, nor instruction, nor budget changes | `npx vitest run packages/agent/test/loop-adversary.test.ts` | green |
| P-13 | received stack | level capped at 2 without a declaration of trust | `npx vitest run packages/model/test/properties-authorize.test.ts` | green |
| P-14 | chatter ends | the hop counter bounds the turns | `npx vitest run packages/model/test/dispatch.test.ts` | green |
| P-15 | budgets | once exhausted, no further call to the gateway | `npx vitest run packages/agent/test/loop.test.ts` | green |
| P-16 | bounded context | neither key, nor another card, nor journal | `npx vitest run packages/agent/test/properties-agent.test.ts` | green |
| P-17 | scripts under approval | no agent script without a human token | `npx vitest run packages/model/test/properties-authorize.test.ts` | green |
| P-18 | file | exporting then importing gives back the same stack | `npx vitest run packages/model/test/schema-file.test.ts` | green |
| P-19 | fingerprint | independent of the order of the keys | `npx vitest run packages/agent/test/properties-gateway.test.ts` | green |
| P-20 | replay | the recorded mode gives the same final state | `npx vitest run packages/agent/test/cassette-record.test.ts` | green |
| P-21 | numbers | 0.1 + 0.2 displays as 0.3 | `npx vitest run packages/lang/test/values-chunks.test.ts` | green |
| P-22 | nothing secret | neither key nor counters in an export | `npx vitest run packages/agent/test/properties-gateway.test.ts` | green |
| P-23 | ink | agent text stays marked, a human edit erases it | `npx vitest run packages/model/test/ops-journal.test.ts` | green |
| P-24 | the quote | 150 / 15 / 165 in the browser | `npx vitest run apps/web/test/dispatch-adapter.test.ts` | green |
| P-25 | the manor | the guard alerts, the cook already knows | `npx vitest run apps/web/test/agent-bridge.test.ts` | green |
| P-26 | the spy | the path and the refusals are visible | `npx vitest run apps/web/test/spy.test.ts` | green |
| P-27 | phrase to script | controlled draft, read back, dry run | `npx vitest run packages/agent/test/write-script.test.ts` | green |
| P-28 | the 40 tasks | six families, reachable expectations | `npx vitest run evals` | green |
| P-29 | without a key | the demo runs with no network and no key | `npx vitest run apps/web/test/agent-bridge.test.ts` | green |

## What is not yet proven

| Point | What it would take |
|---|---|
| **The video** | The timed script is delivered (`docs/video-script.md`, 2:58) but filming and editing remain: shoot the screens on merged code and cut the voice-over, with no third-party brand and no copyrighted music. |
| **The verified brand name** | To check: the availability of the product name and the language name has never been verified — npm registry, domain name, GitHub organisation, trademark databases (requirements notebook, annex D). |
| **Hosting beyond 29 January 2027** | The commitment runs until 29 January 2027 (CAR-N-14); beyond that date, a hosting decision (renewal or migration) and an availability check would be needed. |
| **Median latency of one agent turn** | To measure: time agent turns on the recorded cassette scenarios, over a given number of turns, then compute the median. |
| **Evaluation game pass rate (40 tasks)** | To measure with a real key: the game stays out of CI; one full pass is estimated (notebook estimate) at ≈ $2.40, actual cost to measure. |
| **Accessibility audit** | To measure: `aria-*` and `role` attributes are in place across the screens, but the full audit and the screen-reader pass remain. |
| **Performance measurements** | To measure: stack open time, operations per second, site load — no measurement script exists yet. |

None of these points is claimed as proven anywhere in this appendix; "to measure" means exactly that.
