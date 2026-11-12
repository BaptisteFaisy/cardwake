# The 29 proofs — registry

Every feature on the site's **Proofs** page cites the proofs that cover it.
A proof here is a verifiable claim backed by a test that exists in this
repository — run its command from the root of the repository. This page is
generated from `packages/proofs/src/registry.ts` (the single source); rerun
`npm run preuves` to print the same report locally.

- **P-01** [Language] Analyzing, printing and analyzing again gives back the same tree. — `packages/lang/test/print.test.ts`
- **P-02** [Language] Printing is stable: the same tree always prints the same text. — `packages/lang/test/print.test.ts`
- **P-03** [Language] The plain readback is complete: every instruction gets a sentence, generated from the tree without any model. — `packages/lang/test/paraphrase.test.ts`
- **P-04** [Object model] The clock and the seed are injected: the same run gives the same stack, byte for byte. — `apps/web/test/agent-bridge.test.ts`
- **P-05** [Language] Numbers behave like the family they come from: 0.1 + 0.2 shows as 0.3, sums stay exact. — `packages/lang/test/values-chunks.test.ts`
- **P-06** [Language] Every script stops within maxSteps: an endless loop is halted and its effects rolled back. — `packages/lang/test/interpreter.test.ts`
- **P-07** [Journal] An interrupted process leaves no trace: an aborted transaction records nothing. — `packages/model/test/ops-journal.test.ts`
- **P-08** [Journal] Any sequence of operations, undone in reverse, restores the exact starting stack. — `packages/model/test/ops-journal.test.ts`
- **P-09** [Messages] A message climbs element, card, background, stack and stops at the first handler. — `packages/model/test/dispatch.test.ts`
- **P-10** [Journal] Identifiers stay unique across a run: an allocated id is never reused. — `packages/model/test/ops-journal.test.ts`
- **P-11** [Rights] An adversarial model asking for forbidden tools never gets a single operation through. — `packages/agent/test/loop-adversary.test.ts`
- **P-12** [Rights] No elevation: only a human sets a level, a persona, an awake state or a budget. — `packages/model/test/authorize.test.ts`
- **P-13** [Rights] A received stack caps its agents at level 2 until a human declares it trusted. — `packages/model/test/authorize.test.ts`
- **P-14** [Messages] Chatter is bounded: hops and agent turns run out and stop the talk. — `packages/model/test/dispatch.test.ts`
- **P-15** [Budgets] Honest budgets: a turn that produced nothing consumes neither a turn nor a hop. — `apps/web/test/agent-bridge.test.ts`
- **P-16** [Budgets] Budgets freeze when exhausted: nothing more is spent once the ceiling is reached. — `packages/agent/test/budget.test.ts`
- **P-17** [Rights] A script only installs with a human acceptance token, and the token is used once. — `packages/model/test/authorize.test.ts`
- **P-18** [Files] A stack is a file: export then import gives back the same stack, canonically serialized. — `packages/model/test/schema-file.test.ts`
- **P-19** [Gateway] The fingerprint of an exchange is stable: key order and tool ids never change it. — `packages/agent/test/properties-gateway.test.ts`
- **P-20** [Cassettes] Recorded replay: the same situation always finds the same recorded answer, with no network. — `packages/agent/test/cassette.test.ts`
- **P-21** [Language] Text pieces (lines, items, words, characters) split and join without loss. — `packages/lang/test/values-chunks.test.ts`
- **P-22** [Gateway] Nothing secret leaves: no key and no counter is exported, secrets are scrubbed from quotes. — `packages/agent/test/properties-gateway.test.ts`
- **P-23** [Journal] Agent ink: agent-written text stays marked, a human write clears the mark, undo restores it. — `packages/model/test/ops-journal.test.ts`
- **P-24** [Object model] A click runs the button's script: the quote computes subtotal, VAT and total. — `packages/model/test/host-script.test.ts`
- **P-25** [Messages] Cards talk to each other: the guard alerts, the cook already knows — and it all undoes. — `packages/model/test/dispatch.test.ts`
- **P-26** [Site] The message spy shows the path, the object that handled the message, and every refusal. — `apps/web/test/spy.test.ts`
- **P-27** [Agents] A phrase becomes a draft: checked, read back, and tried on a copy before installing. — `packages/agent/test/write-script.test.ts`
- **P-28** [Evaluation] The evaluation game holds 40 phrase-to-script tasks, and every expectation is reachable. — `evals/evals.test.ts`
- **P-29** [Site] The three demo stacks open with no key and no network, and replay identically. — `apps/web/test/agent-bridge.test.ts`

Command for any proof (example):

```sh
npx vitest run packages/lang/test/print.test.ts
```
