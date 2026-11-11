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
  and the embedded model drafts the script for you.
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
are traced from it down to individual tests.

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

**MCP.** The project's MCP server (`validate_script`, `simulate`,
`paraphrase`) is specced (`cli-mcp`) but **not built yet**; the CLI package
is a stub today. The hooks and guards above cover the same ground in the
meantime.

**Infrastructure, real numbers.** 11 PRs merged **without a single human
click** by the merge queue (branch protection + three required checks,
auto-boarding when green). CI verdict in **14 s** on 3 self-hosted runners
(two of them relocated from a repository where they idled). 262 tests green
across the repo. 20 of the 23 acceptance properties proved by fast-check;
the property suite runs **10 000 draws per property in 66.56 s** (239 tests,
0 failures — see `docs/rapport-proprietes.md`).

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
- Number of counterexamples found across all properties: TO MEASURE (the
  `repeat while true` one is documented in the build log).
- `stack-author` first-try-valid script rate (before/after each reference
  improvement): TO MEASURE.
- `no-live-model-guard` trigger count: TO MEASURE.
- Kiro credit cost of one complete spec: TO MEASURE.

## What remains

- **Message dispatch and script effects in the app** (`host.ts`,
  `dispatch.ts`): the hop-counted routing, handler hierarchy (CAR-P-09) and
  chatter limits (CAR-P-14) — the last two uncovered properties besides
  CAR-P-03 (total readback), which awaits `paraphrase.ts`.
- **The agent loop** (`loop.ts`) and the **phrase-to-script pipeline**
  (`write-script.ts`, `check.ts`): drafts, repairs, questions, acceptance
  tokens end to end.
- **Cassettes for the three demo stacks** (recorded model answers) so the
  manor, quotes and dashboard run with no key and no network.
- **The CLI and MCP server** (`validate`, `run`, `paraphrase`,
  `cassette verify`, `eval compile`).
- **The evaluation game**: 40 phrase-to-script tasks in `evals/compile/`
  (six families), run on demand with a real key, never in CI. Current pass
  rate: TO MEASURE.
- **A LICENSE file** at the repository root: TO MEASURE (license choice).
- **Accessibility audit** (ARIA attributes are in place across screens; a
  full audit and screen-reader pass remain): TO MEASURE.
- **Performance measurements** (stack open time, operations per second,
  site load): TO MEASURE.
- **The video** (script delivered in `docs/video-script.md`): to be filmed.

## What comes next

Finish dispatch and the agent loop, record the three cassettes, then wire the
web app to the real engine. Run the 40-task evaluation game with a real key
(estimated ≈ $2.40 per full pass — actual cost: TO MEASURE) and publish the
rate. Record the three-minute video from the delivered script. Add the
license file, run the accessibility and performance passes, and keep the site
public and free at its current address at least until 29 January 2027 — the
horizon the deployment workflow was written for.

The endgame is the promise of 1987, kept with 2026 defences: anyone can build
software from stacks of cards again — and this time, the agents inside the
cards provably cannot overstep.

## TO MEASURE — consolidated list

| Item | Where it is needed |
|---|---|
| Counterexample count across all properties | "What was learned" |
| `stack-author` first-try-valid script rate | "What was learned" |
| `no-live-model-guard` trigger count | "What was learned" |
| Kiro credit cost of one complete spec | "How it was built" |
| Evaluation game (40 tasks) pass rate | "What remains" |
| Real cost of one full evaluation pass | "What comes next" |
| License choice + LICENSE file | "What remains" |
| Accessibility audit result | "What remains" |
| Performance measurements | "What remains" |
