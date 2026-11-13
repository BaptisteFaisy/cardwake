# Submission — Cardwake

## Where the idea comes from

Cardwake is inspired by a 1987 card-stack tool that let anyone build software;
not affiliated with or endorsed by its publisher. That tool made programming
feel like writing sentences on index cards: a stack of cards, fields and
buttons you could see, and a language that read like English. It was
discontinued, and the idea that ordinary people could build their own small
software went with it. Cardwake resurrects the idea for 2026 — with one
addition the original could never have had: **every card can host an AI
agent, and that agent can never do more than the level a human gave it.**

No icon, font, texture, sound, stack or documentation text from the original
product is reused. The language was written from scratch; it resembles its
ancestor by its turns of phrase, not by its text.

## What it does

Cardwake is a static web app where you build **stacks of cards**. Each card
holds fields and buttons, and each card may hold one agent with a persona, a
speed and a **level from 1 to 5** — browse, type, paint, create, program.

- You write scripts in a small English-like language, or you **type a phrase**
  and the embedded model drafts the script for you — the Script tab of the
  builder does exactly that.
- Before anything installs, you get three defences: a **plain-English
  readback** generated from the syntax tree (never by the model itself), a
  **dry run** on a copy of the stack, and a **diff** against the old script.
  Nothing installs without an explicit Accept.
- Agents act by **messages**, card to card, counted in hops. An agent writes
  only on its own card. Only a human sets a level; only a human accepts a
  proposed script; a received stack opens with every agent **asleep** and
  capped at level 2 until you declare you trust it.
- Every act — human, script or agent — is a **transaction** in a journal you
  can read, filter by actor, and undo in one gesture. The stack saves itself
  after each committed transaction; there is no Save button.
- Your API key never enters a stack file, an export, or an agent's context.
  Budgets freeze when exhausted. A recorded mode ("cassette") lets anyone try
  the three demo stacks without a key and without any network call.

## How it was built

Built spec-first with an AI development agent, on a monorepo of pure
TypeScript packages (`lang`, `model`, `agent`) plus a React/Vite web app,
Vitest + fast-check for tests.

**Specs — 12.** `.kiro/specs/` holds twelve specs (requirements in EARS form
with `CAR-F-nn` ids, design, tasks): language-core, object-model,
message-dispatch, permissions, card-agents, phrase-to-script, journal-undo,
llm-gateway, editor-ui, received-stacks, sample-stacks, cli-mcp. A 1,300-line
requirements notebook feeds them; 23 acceptance properties (`CAR-P-01…23`)
are traced from it down to individual tests — and every one of the 23 ids now
appears in a test file. The last gap, `CAR-P-09` (the message hierarchy), is a
fast-check property: for every placement of `mouseUp` handlers on the four
levels and every choice of `pass`, the handler that runs is the first one on
the path that does not pass it.

**Steering — one text for two AIs.** `docs/language.md`, the complete
795-line language reference, is *the same file* copied to
`.kiro/steering/language.md` to instruct the development agent, and injected
into the embedded model's persona when it drafts scripts. One source teaches
both AIs; a test (`language-sync.test.ts`) fails if the copies drift.

**Hooks — 9.** Nine command hooks (no credits consumed) guard the
construction: no live model call from the agent (it never spends the key),
no API-key-shaped text, no third-party trademark in product files, no
`eval(`/`new Function`/`innerHTML`, a single gate for applying operations
(only `dispatch`/`authorize`), language properties kept green on save,
language-reference sync, cassette staleness listing, journal reminders. The
same checks run in CI via `scripts/guards/run_all.py`.

**Custom agents — 3.** `lang-reviewer` (read-only, reviews code against the
language reference), `safety-reviewer` (read-only, hunts any path around the
rights gate or any model output treated as code), and `stack-author` (writes
the example stacks using only `language.md` — the language's first user).

**MCP.** The project ships a working MCP server, `apps/mcp`: stdio JSON-RPC,
zero dependencies, six tools with no network and no key — `validate_script`,
`validate_stack`, `paraphrase`, `simulate`, `read_stack`, `format_script`.
It is reachable as `cardwake mcp`, and a real coding agent (opencode) has
driven it end to end: asked to validate a stack and read back a button's
script, the agent called the tools and returned the plain-English reading —
not written by us, produced by the agent. The CLI is complete too: `validate`,
`run`, `paraphrase`, `cassette verify`, `mcp`, `live`, plus `evals/run.ts`,
the harness that plays the 40 task game with a real model.

**Infrastructure, real numbers.** 33 PRs merged **without a single human
click** by the merge queue (branch protection + three required checks,
auto-boarding when green). CI verdict in **14 s** on 3 self-hosted runners
(two of them relocated from a repository where they idled). **539 tests green**
across 54 files. 23 of the 23 acceptance properties appear in a test; the
property suite runs **10 000 draws per property** on demand (the CI runs 100 to
stay inside the five-minute budget) — see `docs/rapport-proprietes.md`.

**Measured, with a real model.** The 40-task phrase-to-script game
(`docs/mesures/eval.md`, raw report in `docs/mesures/eval.json`) run on
2026-11-13 with `combo/cheap` through the local relay: **34 of 40 tasks pass at
the first try — 85 %**, exactly the target; 54 model calls, 269 385 input
tokens, 30 781 output tokens, about 20 minutes. Per family: calcul 8/8,
conditions 6/6, agents 5/6, navigation 5/6, chunks 6/8, loops 4/6.

**Performance, measured.** `docs/mesures.md` (regenerated by
`scripts/bench/bench.ts`): card change 0.004 ms (target 50 ms), a 100-card
stack opens in 1.10 ms (target 1 s), a 200-line script parses in 0.52 ms
(target 20 ms), **723 686 interpreter steps per second** (target 200 000), and
an event reaches its visible indication in 0.05 ms (target 100 ms).

## What held up

- **The single gate.** Every right check funnels through one module
  (`authorize`). Ten thousand draws of an *adversarial fake model* — one that
  answers with forbidden tools, on other agents' cards, at levels it does not
  have — never got a single operation through (CAR-P-11/12/13/17).
- **Purity.** `lang` and `model` take clock, seed and host effects as
  parameters: no `Date.now()`, no `Math.random()`, no DOM. Determinism
  (CAR-P-04) and recorded replay (CAR-P-20) fell out almost for free, and dry
  runs cost nothing.
- **All-or-nothing transactions.** CAR-P-07/08 at 10 000 draws: a failed
  process leaves the stack identical; any operation sequence undone in
  reverse restores the exact starting stack, agent ink marks included
  (CAR-P-23).
- **Property-based testing found real bugs**, not just confidence. See below.
- **The guards held**: no secret, no trademark, no dangerous construct ever
  reached `main`; the published site loads nothing remote, so recorded mode
  works with zero network.
- **The phrase-to-script chain, measured with a real model.** 40 real tasks,
  judged on the final stack: **85 % at the first try**. And two of the six
  misses were refused by our own static check before anything was installed —
  the model invented a field, the gate said no.

## What was learned

- **The machine proof earns its keep.** CAR-P-06 (every script stops within
  `maxSteps`) found a genuine bug in the first days: `true`, `false`,
  `return`, `tab` and `comma` had been implemented as variables, so
  `repeat while true` never looped — and the shrinker handed us the exact
  four-line counterexample. They are constants now.
- **One reference for two AIs works.** A defect found by the development
  agent in `language.md` fixes the embedded model's drafting prompt at the
  same time — and vice-versa. The language-sync test makes drift impossible.
- **Rights from 1987 are properties.** "No agent oversteps its level" is a
  sentence in the notebook, an acceptance criterion, and a test against an
  adversary. Writing the adversarial generator forced every vague rule to
  become precise.
- **Idle infrastructure is free infrastructure.** Two self-hosted runners
  were doing nothing on another repository; relocated, they cut the CI queue
  to a 14-second verdict.
- **A merge queue removes the human bottleneck** without removing human
  control: protection rules and required checks do the gatekeeping.
- **Measure the measurer.** The first run of the game scored 70 %, and eight of
  the "failures" were the harness's fault: the demo stacks carry a field and a
  button with the same name, and the harness installed the script on the field
  and then clicked it. Fixing the harness (and a structured output truncated at
  2 000 tokens) took the score to 85 % **without touching the model**. A
  benchmark you have not audited is a number, not a measurement.
- Number of counterexamples found across all properties: TO MEASURE (the
  `repeat while true` one is documented in the build log).
- `stack-author` first-try-valid script rate (before/after each reference
  improvement): TO MEASURE.
- `no-live-model-guard` trigger count: TO MEASURE.
- Kiro credit cost of one complete spec: TO MEASURE.

## What remains

- **Accessibility, screen-reader pass.** ARIA attributes are in place across the
  seven screens, an automated audit runs in the suite (axe-core, WCAG 2.2 AA,
  plus a keyboard-only path), and one real defect was found and fixed by it —
  a hidden file field with no label. A human pass with a screen reader remains.
- **The evaluation's second target** (≥ 95 % after one repair) is not measured
  separately: the chain repairs once inside a task, so the task is scored once.
- **One deviation from the specification, documented.** The example 7.13 of the
  requirements expects two journal transactions and three model calls; the
  implementation gives three and four, because every agent turn is its own
  transaction and the agent is called once more after its tool calls to get the
  final sentence. The observable behaviour matches the specification (the guard
  ends *alarmed*, the cook *nervous*, and undoing restores the starting stack);
  the journal is finer-grained than the example assumed.
- **The video** (script delivered in `docs/video-script.md`): not filmed.

## What comes next

Wire the phrase-to-script chain into the builder screen (the last feature the
app announces but does not yet have), then freeze features. The evaluation game
now runs in one command and its rate is published; re-run it after any change
to the language reference or to the drafting prompt, and record the new number.
Film the three-minute video from the delivered script. Run the screen-reader
pass. Keep the site public and free at its current address at least until
29 January 2027 — the horizon the deployment workflow was written for.

The endgame is the promise of 1987, kept with 2026 defences: anyone can build
software from stacks of cards again — and this time, the agents inside the
cards provably cannot overstep.

## Measured, and what is not

| Item | Value |
|---|---|
| Evaluation game, 40 tasks, `combo/cheap` | **34/40 = 85 %** at the first try (2026-11-13, `docs/mesures/eval.json`) |
| Cost of one full pass | 54 calls, 269 385 input + 30 781 output tokens (the relay counts them; the provider's price is not verified here) |
| Performance, CAR-N-04 / CAR-N-05 | every target met; `docs/mesures.md` (regenerated by the bench) |
| Acceptance properties with a test id | **23 of 23** (`CAR-P-09` added last, as a fast-check property) |
| Merge queue | 33 PRs merged, no human click |
| Tests | 539 across 54 files |
| Accessibility | automated audit of the seven screens (axe-core, WCAG 2.2 AA) + keyboard-only path; one real defect found and fixed |
| Recette | rejouable point by point (`docs/recette.md`): 12 green, 1 documented deviation, 1 out of scope |
| License | MIT, `LICENSE` at the repository root |
| Counterexamples found by properties | 1 documented: `true`/`false` had been variables, so `repeat while true` never looped (CAR-P-06) |
| `stack-author` first-try-valid rate | not measured — the sample stacks were written by hand |
| `no-live-model-guard` triggers | not instrumented (the hook exists and is tested; no counter) |
| Kiro credit cost of one spec | not measured (credits are not exposed to the build log) |
| Accessibility audit | automated check in the suite; screen-reader pass still to do |
| Video | not filmed |
