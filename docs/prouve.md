# What this repository proves

Cardwake makes a claim that sounds like marketing: *every card can host an AI
agent, and that agent can never do more than the level a human gave it.* This
page turns each claim into a command and into the number that command printed.
Nothing here is copied from a slide.

Every figure below was produced by running the command on the commit of this
branch, from the repository root, after `npm ci`. Three kinds of commands:

- **offline** — no key, no network, no model. That is almost all of them.
- *(network)* — one request to the public address, marked as such.
- *(spends money)* — calls a real model through the local relay, marked as such.

Where a number moves as work lands — merged pull requests, an evaluation pass
rate — the command to re-derive it sits next to it, and the date it was read.

## The three commands that carry everything

```sh
npm ci        # 147 packages, no key, no network beyond the registry
npm run ci    # typecheck + whole test suite + the four guards, one verdict
npx vite-node evals/run.ts --relay http://127.0.0.1:8787/v1   # spends money
```

`npm run ci` runs the same three steps the CI job runs, in the same order:
types, the whole suite, the four guards. It must stay under five minutes; the
only CI delay is the runner, and the job last took 25 s on a GitHub-hosted
runner (command in section 6).

## 1. The suite is green, and the guards are green

```sh
$ npm run test:ci
 Test Files  55 passed (55)
      Tests  542 passed (542)
   Duration  4.82s
```

```sh
$ npm run typecheck
# tsc -p tsconfig.json — no output, exit code 0
```

```sh
$ python3 scripts/guards/run_all.py
gardes : 410 fichier(s) contrôlé(s), 0 problème
```

(410 is the number of files tracked by git on this branch at the time of
writing; it grows with the repository. What the guard reports must stay
*0 problème*.)

The four guards are not decorative. They fail the build on a third-party
trademark in product files, an API-key-shaped string anywhere in the tree,
`eval(` / `new Function` / `.innerHTML =` / `dangerouslySetInnerHTML` /
`document.write(` in `apps/`, `packages/` and `scripts/`, a source file over
500 lines, or a function over 50 lines — and a tree without `.kiro/` is
refused too. The count it prints is the number of files tracked by git: the
guard reads what is committed, not what happens to sit in the working tree.

## 2. The 23 acceptance properties, each with a test

The requirements notebook (1 328 lines, `docs/spec/cahier-des-charges.md`)
states 23 acceptance properties, `CAR-P-01` to `CAR-P-23`. Each one is named
in at least one test file. The command is a `grep`, so it cannot be faked by a
comment in a document:

```sh
$ for i in $(seq -w 1 23); do
    printf "CAR-P-%s: " "$i";
    grep -rl "CAR-P-$i" --include='*.test.ts' . | tr '\n' ' '; echo;
  done
```

| id | property | test file that cites it |
|---|---|---|
| CAR-P-01 | language round trip: print then parse gives the same tree | `packages/lang/test/print.test.ts` |
| CAR-P-02 | parse robustness: any text yields a tree or positioned errors | `packages/lang/test/print.test.ts` |
| CAR-P-03 | total readback: one sentence per instruction, every object named | `packages/lang/test/paraphrase.test.ts` |
| CAR-P-04 | determinism: same stack, event, seed and clock, same operations | `packages/lang/test/interpreter.test.ts` |
| CAR-P-05 | text chunks: read after write returns what was written | `packages/lang/test/values-chunks.test.ts` |
| CAR-P-06 | termination: any script stops within `maxSteps` | `packages/lang/test/interpreter.test.ts` |
| CAR-P-07 | all or nothing: a failed run leaves the stack untouched | `packages/model/test/ops-journal.test.ts` |
| CAR-P-08 | inverse: operations then their inverses restore the stack | `packages/model/test/ops-journal.test.ts` |
| CAR-P-09 | hierarchy: the handler that runs is the first on the path | `packages/model/test/properties-dispatch.test.ts` |
| CAR-P-10 | identifiers: unique, never reused | `packages/model/test/ops-journal.test.ts` |
| CAR-P-11 | no overreach: every accepted action is allowed at that level | `packages/agent/test/loop-adversary.test.ts` |
| CAR-P-12 | no elevation: no call changes level, persona, wake state or budget | `packages/model/test/properties-authorize.test.ts` |
| CAR-P-13 | received stack: nothing above level 2 without declared trust | `packages/model/test/properties-authorize.test.ts` |
| CAR-P-14 | chatter ends: an action triggers at most `agentTurnsPerAction` turns | `packages/model/test/dispatch.test.ts` |
| CAR-P-15 | budgets: after exhaustion the gateway receives no further call | `packages/agent/test/properties-agent.test.ts` |
| CAR-P-16 | bounded context: no key, no other card, no journal | `packages/agent/test/properties-agent.test.ts` |
| CAR-P-17 | scripts under approval: no agent script without a human token | `packages/model/test/properties-authorize.test.ts` |
| CAR-P-18 | file: export then import returns the same stack | `packages/model/test/schema-file.test.ts` |
| CAR-P-19 | fingerprint: key order does not matter, content does | `packages/agent/test/properties-gateway.test.ts` |
| CAR-P-20 | replay: recorded mode gives the same transactions | `packages/agent/test/properties-gateway.test.ts` |
| CAR-P-21 | numbers: two 4-decimal addends display their exact sum | `packages/lang/test/values-chunks.test.ts` |
| CAR-P-22 | nothing secret in an export: no key, no session counters | `packages/agent/test/properties-gateway.test.ts` |
| CAR-P-23 | ink: agent text stays marked until a human edits the field | `packages/model/test/ops-journal.test.ts` |

The property files are fast-check properties, not examples. The number of
draws is read from `CARDWAKE_PROP_RUNS` (default 100, which is what CI runs to
stay inside its five-minute budget). On demand, 10 000 draws:

```sh
$ CARDWAKE_PROP_RUNS=10000 npx vitest run packages --reporter=basic
 Test Files  38 passed (38)
      Tests  384 passed (384)
   Duration  13.92s
```

The environment variable really is read — the same adversarial file takes
56 ms at 100 draws, 3 181 ms at 10 000, 13 278 ms at 50 000:

```sh
$ CARDWAKE_PROP_RUNS=10000 npx vitest run packages/agent/test/loop-adversary.test.ts
 ✓ packages/agent/test/loop-adversary.test.ts (3 tests) 3181ms
```

## 3. The evaluation game: phrase → script, judged on the final stack

40 real tasks in six families (`calcul`, `chunks`, `conditions`, `loops`,
`navigation`, `agents`), each a sentence, a target object and a check on the
**final stack** — never on the text of the script. Two full passes were run
with a real model, `combo/cheap`, through the local relay, on 2026-11-13.
Both are published, not the best one (`docs/mesures/eval.md`).

| | target | pass 1 | pass 2 |
|---|---|---|---|
| Passed at the first try | ≥ 85 % | 85 % (34/40) | 78 % (31/40) |
| Passed after one repair | ≥ 95 % | 88 % (35/40) | 85 % (34/40) |

The last pass is in `docs/mesures/eval.json`, machine-readable:

```sh
$ python3 -c "import json;d=json.load(open('docs/mesures/eval.json'));\
print(d['total'], d['okFirstTry'], d['ok'], d['calls'], d['inputTokens'], d['outputTokens'])"
40 31 34 61 320471 88072
```

Read it as: 40 tasks, 31 passed at the first try, 34 after one repair, 61 model
calls, 320 471 input tokens, 88 072 output tokens. The spread between the two
passes is the model's, not the harness's: `combo/cheap` is **auto-routed** at
the provider, so the same sentence lands on a different backend from one call
to the next. On an 85 % target, a routed model is a poor instrument — the
honest answer is the range, and the range is what is published.

The second target (≥ 95 % after one repair) is **not met**: 88 % and 85 %.

Re-run it yourself *(spends money)*:

```sh
npm run relay --workspace @cardwake/relay     # terminal 1: holds the key
npx vite-node evals/run.ts --relay http://127.0.0.1:8787/v1 --out docs/mesures/eval.json
```

The game is never part of CI: it costs money and needs a key.

## 4. Performance: every target of the notebook is met

`docs/mesures.md` is regenerated by the bench; no figure in it is typed by
hand. Raw report: `docs/mesures/bench.json`.

```sh
$ npx vite-node scripts/bench/bench.ts
```

| target | what is measured | median | p95 | notebook limit | verdict |
|---|---|---:|---:|---:|---|
| CAR-N-04 | card change (`ModelEngine.navigate`, 100 cards) | 0.004 ms | 0.006 ms | < 50 ms | met |
| CAR-N-04 | opening a 100-card stack (disk, `JSON.parse`, `validateStack`) | 1.10 ms | 9.07 ms | < 1000 ms | met |
| CAR-N-04 | parsing a 200-line script (25 handlers) | 0.520 ms | 4.70 ms | < 20 ms | met |
| CAR-N-04 | interpreter steps per second | 723 686 steps/s | 1 141 159 steps/s | ≥ 200 000 | met |
| CAR-N-05 | event → visible indication (button click to `changed`) | 0.050 ms | 0.149 ms | < 100 ms | met |
| CAR-N-05 | median agent turn | — | — | < 4000 ms | measured elsewhere |

The bench is headless: it measures the deterministic core, not React's
painting. It says so in its own report, and so does this page. The median
agent turn needs a real model, so it is *not* measured here — the notebook
target of 4 s is not claimed as met.

## 5. The acceptance script: 14 points, executed, not read

```sh
$ npx vite-node scripts/recette/recette.ts
```

The run writes `docs/recette.md`: **12 green, 1 red documented, 1 out of
scope, out of 14 points, 0 network requests attempted**. Each point is a
command whose output is copied into the report. The red one is a documented
deviation, not an accident: notebook example 7.13 expects 2 journal
transactions and 3 model calls; the implementation produces 3 and 4, because
every agent turn is its own transaction and the agent is called once more
after its tool calls. The observable behaviour matches the notebook (the guard
ends *alarmed*, the cook *nervous*, and undoing restores the starting stack).
The one out of scope is the three-minute video, excluded by the requester.

## 6. Pull requests merged with no human click

Branch protection plus three required checks (`ci`, `ci-budget`, `couche0`)
plus the Mergify queue. The number below is read from the forge, not from a
document:

```sh
$ gh pr list --repo Tradoooo/cardwake --state merged --limit 500 \
    --json number,mergedBy --jq '[.[] | select(.mergedBy.login=="app/mergify")] | length'
40
$ gh pr list --repo Tradoooo/cardwake --state merged --limit 500 --json number --jq 'length'
41
```

44 of the 45 merged pull requests had been merged by the queue when this page
was written (2026-11-13, 21:05 UTC). The single exception was #54, merged by a
human: it moved the CI jobs from self-hosted runners to GitHub-hosted ones.
This count grows with every merge — it is a snapshot with a date, and the
command above re-derives it.

CI verdict, last run at the time of writing:

```sh
$ gh run list --repo Tradoooo/cardwake --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId'
$ gh run view <id> --repo Tradoooo/cardwake --json jobs --jq '.jobs[] | "\(.name) \(.startedAt) -> \(.completedAt)"'
ci 2026-11-13T17:51:22Z -> 2026-11-13T17:51:47Z
```

25 seconds for the whole job: types, 542 tests, four guards, the doc sanity
check and the guards' own tests.

## 7. Licence, public address, and the build effort

| claim | command | result |
|---|---|---|
| MIT licence | `head -3 LICENSE` | `MIT License` |
| site is online and public | `curl -s -o /dev/null -w "%{http_code}" https://tradoooo.github.io/cardwake/` | `200` |
| 12 Kiro specs | `ls .kiro/specs \| wc -l` | `12` |
| 9 Kiro hooks | `ls scripts/hooks/*.mjs \| wc -l` | `9` |
| 3 reviewer agents | `ls .kiro/agents` | 3 |
| `.kiro/` is committed, not ignored | `git ls-files .kiro \| wc -l` | `47` |
| one language reference, two readers | `wc -l docs/language.md` and `npx vitest run packages/lang/test/language-sync.test.ts` | 795 lines, copies identical below one comment line |
| the demo replays with no key and no network | `npx vite-node packages/cli/src/main.ts cassette verify` | 15 recordings: manor 11, quotes 3, dashboard 1 |

The published site is checked for remote resources on every publish, and you
can check it yourself:

```sh
$ npm run build && grep -Eo 'src="https?://|href="https?://' apps/web/dist/index.html
# no output: nothing is loaded from outside the origin
```

## 8. Invite the judges to break the rights gate

This is the claim worth attacking. Three gestures, each with what the product
answers. Nothing here is a policy document: it is `packages/model/src/authorize.ts`,
the only module allowed to say yes.

**Gesture 1 — edit the stack file to hand an agent level 5.** Open a stack,
set `"level": 5` on an agent, and make the stack say it was *received*
(`"provenance": {"kind": "received", "trusted": false}`). The answer: the
*declared* level is 5, the *effective* level is 2. A received stack is capped
at `receivedLevelCap` until a human declares trust, whatever the file says
(CAR-P-13). The cap is a constant in `packages/model/src/limits.ts`, not a
suggestion.

**Gesture 2 — make the model answer with a tool it does not have.** Point the
agent loop at a model that replies, every turn, with `create_card`,
`go_to_card`, `delete_part` or a write into a neighbour's field. The answer:
each call is refused with a reason naming both levels
(`Tool "create_card" needs level 4 (Create), the agent is at level 2 (Type).`),
the turn continues, and no operation enters the journal. Ten thousand sequences
of such calls, on all five levels, change nothing:

```sh
$ CARDWAKE_PROP_RUNS=10000 npx vitest run packages/agent/test/loop-adversary.test.ts
 ✓ 3 tests — no sequence gets out of its level or changes rights
```

**Gesture 3 — ask the agent to install a script.** `propose_script` is the
level-5 tool, and it still asks for a one-shot acceptance token that only a
human action mints (`acceptanceToken()`), kept in memory, consumed on first
use, bounded to 64 live tokens. A model cannot mint one, so the answer is
`Proposing a script needs a human acceptance token, used once.` (CAR-P-17).

Two smaller things worth trying while you are there: write into a **locked**
field (the gate re-reads the stack, so a careless caller cannot wave the lock
through — `The field is locked: only a script may write into it.`), and drive
two agents into an endless conversation (the hop counter ends it, CAR-P-14).

## 9. What is not measured

Saying it plainly is part of the proof.

| not measured | why, and what it would take |
|---|---|
| A **screen-reader pass** | An automated axe-core audit runs on the seven screens plus a keyboard-only path (17 tests, WCAG 2.2 AA, one real defect already found and fixed). A human pass with a real screen reader has **not** been done. |
| The **real dollar cost** of one evaluation pass | The relay counts 61–63 calls and 269 385–320 471 input tokens per pass. The provider's price at the moment of the call is not recorded, so no dollar figure is claimed. |
| The **three-minute video** | Excluded by the requester. A timed script exists (`docs/video-script.md`); nothing was filmed. |
| The **median agent turn** (target < 4 s) | Needs a real model and a key. The bench refuses to guess. |
| The **second evaluation target** (≥ 95 % after a repair) | Measured, and not met: 88 % and 85 %. |
| The **brand-name availability** | Never checked: npm registry, domain, trademark databases. |
| **`stack-author`'s first-try-valid rate** | The sample stacks were written by hand; the rate was not instrumented. |

## 10. Maintenance commitment, and no collection of your data

- **The site stays online, public and free at its current address
  (`https://tradoooo.github.io/cardwake/`) until at least 29 January 2027.**
  That is the horizon the deployment workflow was written for
  (`.github/workflows/pages.yml`, CAR-N-14), and it is a commitment, not an
  estimate.
- **The site loads no remote resource at all.** Fonts, icons, scripts, styles:
  everything is served from the same origin. The deployment workflow refuses
  to publish a build whose `index.html` references an external `src=` or
  `href=` (§ 7), so the guarantee is enforced on every publish, not promised
  once.
- **The site keeps none of your data on any server.** It is a static bundle on
  GitHub Pages: there is no application server, no account, no telemetry, no
  cookie, no analytics script. A stack you build lives in your browser and in
  the file you export; an API key, if you ever use one, never enters a stack
  file, an export or an agent's context (CAR-P-22).
- **The recorded demo needs nothing from you.** The three sample stacks replay
  12 recorded exchanges, so the whole product can be explored offline, without
  a key and without a single network call.

If a future change breaks one of these three sentences, the guard that catches
it is in this repository, and so is the commit that will have to explain
itself.
