# Cardwake

**Programmable card stacks in natural language — every card can host an AI
agent, and that agent can never do more than the level a human gave it.**

Cardwake is a small desktop-grade application you build out of cards: a shelf
of stacks, a card you can click, fields you can type in, and buttons that carry
a script. The script is written in **Murmur**, a small language you can read,
edit and keep. When a card needs judgement rather than a rule, its agent
answers — inside its own card, inside its own level.

> Inspired by a 1987 card-stack tool that let anyone build software; not
> affiliated with or endorsed by its publisher.

**Try it, no account, no key, nothing to install:**
<https://tradoooo.github.io/cardwake/>

## Judge in three minutes

Three clicks, no account, no key:

1. Open the shelf and pick the stack **The Manor**.
2. The first card is the hall. A character is standing there.
3. Click **Show the amulet**.

The character's agent answers in its own field — read it, then open the
**journal**: every write is listed, with the message that caused it, the object
it touched, and an undo button. Nothing the agent did is hidden, and nothing it
did is irreversible.

The two other sample stacks show the everyday side: a task list you can add
to, and a quote whose total, VAT and grand total are computed by a script of
nine lines.

Then, in the builder, open the **Script** tab and type a sentence: a model
drafts a Murmur script, the result is read back in plain English, rehearsed on
a copy of the stack, and shown as a diff. Nothing installs until you press
**Accept**.

## Reproduce my numbers

Three commands. The first two are the whole verification and cost nothing;
the third one calls a real model and spends money.

```sh
npm ci        # 147 packages, no key
npm run ci    # types + 542 tests + 4 guards, one verdict, well under 5 min
npx vite-node evals/run.ts --relay http://127.0.0.1:8787/v1   # 40 tasks, spends money
```

The third command needs the local relay running (`npm run relay --workspace
@cardwake/relay`), which holds the key — the script only knows an address. If
you do not want to spend anything, the two free commands below reproduce every
other measured number:

```sh
npx vite-node scripts/bench/bench.ts        # rewrites docs/mesures.md
npx vite-node scripts/recette/recette.ts    # rewrites docs/recette.md, 14 points
```

What comes out, as measured on the commit of this branch (no image, just the
numbers — every one of them has a command and a file behind it in
[`docs/prouve.md`](docs/prouve.md)):

```text
+----------------------------------------------------------+----------------+----------------+
| claim                                                    | measured       | source         |
+----------------------------------------------------------+----------------+----------------+
| test suite                                               | 542 tests      | npm run ci     |
|                                                          | 55 files       |                |
|----------------------------------------------------------+----------------+----------------+
| acceptance properties cited in a test                    | 23 of 23       | grep CAR-P-*   |
| property draws on demand (100 in CI)                     | 10 000         | CARDWAKE_PROP_ |
|----------------------------------------------------------+----------------+----------------+
| evaluation game, 40 tasks, first try (2 passes)          | 85 % / 78 %    | eval.md        |
| evaluation game, after one repair (target >= 95 %)       | 88 % / 85 %    | eval.json      |
|----------------------------------------------------------+----------------+----------------+
| card change (target < 50 ms)                             | 0.004 ms       | bench.json     |
| open a 100-card stack (target < 1 s)                     | 1.10 ms        | bench.json     |
| parse a 200-line script (target < 20 ms)                 | 0.520 ms       | bench.json     |
| interpreter steps per second (target >= 200 000)         | 723 686 /s     | bench.json     |
| event -> visible indication (target < 100 ms)            | 0.050 ms       | bench.json     |
|----------------------------------------------------------+----------------+----------------+
| acceptance script, 14 points                             | 12 OK          | recette.md     |
|                                                          | 1 documented   |                |
|                                                          | 1 out of scope |                |
|----------------------------------------------------------+----------------+----------------+
| pull requests merged by the queue, no human click        | 44 of 45       | gh pr list     |
| repository guards                                        | 410 files      | npm run guards |
|                                                          | 0 problems     |                |
+----------------------------------------------------------+----------------+----------------+
```

Two counts move as the work lands: the pull requests merged by the queue
(snapshot of 2026-11-13, 21:05 UTC) and the number of files the guards
control. Both are re-derived by the commands shown; what must not move is
*0 problems*.

Two of those numbers are ranges on purpose. The evaluation game is run with an
**auto-routed** model (`combo/cheap`): the same sentence lands on a different
provider backend from one call to the next, so a single score would be a
flattering lie. The measured range is 78–85 % at the first try. The second
target of the notebook (≥ 95 % after one repair) is **not met** — 88 % and
85 % — and `docs/mesures/eval.md` lists the six tasks that fail and why.

## Run it locally

Requires Node 22 or newer (the repository is a plain npm workspace).

```bash
npm install
npm run dev --workspace @cardwake/web     # the site, live reload
```

Then, before opening a pull request:

```bash
npm run typecheck     # TypeScript strict, every workspace
npm run test:ci       # the whole suite, CI reporter, no network, no model call
npm run guards        # the four repository guards, ~1 s
```

`npm run ci` runs the three in a row — that is exactly what the continuous
integration job does, and it must stay under five minutes.

## The packages

| Package | What it owns | Purity |
|---|---|---|
| `@cardwake/lang` | Murmur: lexer, parser, syntax tree, step-by-step interpreter, static checks, plain-language reading | pure: no browser, no network, no clock it did not receive |
| `@cardwake/model` | the stack format, the reversible operations, the journal and undo, `authorize` (the single gate for rights), `dispatch` (the message hierarchy) | pure: no browser, no network |
| `@cardwake/agent` | the card view given to an agent, its tools, its turn loop and budgets, and the three model gateways | pure except the gateway it is handed |
| `@cardwake/web` | the site: shelf, card, editor, journal, settings | the only place with a DOM |

Three more workspaces sit alongside them: `@cardwake/cli` (validate a script,
run a stack headless, read it back in plain English, verify cassettes), and two
apps that give a developer a handle on the engine — `@cardwake/mcp`, a stdio
MCP server exposing six read-and-simulate tools with no model, no key and no
network, and `@cardwake/relay`, a local server that holds the API key so the
key never leaves the machine.

## What is different

**An agent per card, bounded by its level.** Five levels, from *browse* to
*program*, and each tool has a minimum level. Only a human sets a level: no
tool, no script, and no incoming message can raise it. An agent writes on its
own card and nowhere else; to act elsewhere it sends a message, and the
receiving card decides.

**The message hierarchy is the network.** A message climbs element → card →
background → stack, and `pass` hands it to the next level. That same climb
carries what one card says to another, so "several agents cooperating" needs no
orchestrator, no server and no queue you cannot see: it is the same four levels
the human already uses.

**The card is the whole memory.** An agent's knowledge is written in the fields
of its card — there is no hidden conversation history and no side store. What
you see on the card is what it knows, and the journal shows how it got there.

**Sentence → script → reading → rehearsal.** You describe what a button should
do in your own words; a model drafts a Murmur script; the result is parsed and
checked without any model, translated back into plain English by a separate
module, and rehearsed on a copy of the stack so you can see what the click would
change — the dry run of the quote button reads
`field Total: "" -> "165"` before anything is installed. The installed script
keeps your sentence as its first comment, and it runs with no model at all
afterwards.

**A trial with no key.** The sample stacks ship their recorded exchanges — 15
of them — so the whole product can be explored offline. A key is only needed to
write a new script or to make an agent answer something that was never
recorded.

**Nothing is executed that was not read.** A model's output is text: it is
parsed by the Murmur parser, checked, read back, and installed only when a human
presses Accept. No model output is ever run as code, and there is no command in
the language for the network, the files or the clipboard.

## If you want to break it

The claim worth attacking is the rights gate. Three ways to try, and what the
product answers, are written out in
[`docs/prouve.md` § 8](docs/prouve.md#8-invite-the-judges-to-break-the-rights-gate):
raise an agent's level in the stack file, make the model answer with a tool it
does not have, ask the agent to install a script. All three are refused, with a
reason, and the tenth-thousand adversarial sequence still changes nothing.

## Documentation

- [`docs/prouve.md`](docs/prouve.md) — what this repository proves: each claim,
  the command that proves it, the number it printed, and what is *not* measured.
- [`docs/language.md`](docs/language.md) — the complete Murmur reference. It is
  the text handed to the model that writes scripts, and the same text handed to
  the in-IDE agent; a test keeps the two copies identical.
- [`docs/architecture.md`](docs/architecture.md) — the packages, the single
  gate for rights, the single gateway, and how a message travels.
- [`docs/1987-2026.md`](docs/1987-2026.md) — the idea of 1987 next to its 2026
  equivalent, line by line, and what 2026 adds.
- [`docs/mesures.md`](docs/mesures.md) and [`docs/mesures/eval.md`](docs/mesures/eval.md)
  — performance and the evaluation game, regenerated by their own tooling.
- [`docs/recette.md`](docs/recette.md) — the notebook's 14 acceptance points,
  executed one by one.
- [`docs/journal.md`](docs/journal.md) — the build log, with what is measured
  and what is still to measure.
- [`docs/soumission.md`](docs/soumission.md) — the submission text.
- [`docs/blog.md`](docs/blog.md) — "One reference, two AIs", the three lessons
  the build paid for.
- `.kiro/` — the specs (12), the steering files, the command hooks (9) and the
  reviewer agents (3) used to build the project itself.

## Contributing rules that are not negotiable

- Code files stay under 500 lines, functions under 50, and logic is never
  duplicated: one implementation, shared helpers.
- Every operation goes through `model/authorize`; every model call goes through
  the gateway. A module that does otherwise is a bug, not a shortcut.
- No test ever calls a real model, and no key ever enters the repository.
- A change that touches behaviour comes with the test that proves it.

## Keep it online, and what it does with your data

- The site stays **public, free and at this address** —
  <https://tradoooo.github.io/cardwake/> — at least until **29 January 2027**.
  That is the horizon the deployment workflow was written for, and it is a
  commitment, not an estimate.
- The site loads **no remote resource**: no font, no icon, no analytics, no
  third-party script. Everything is served from the same origin, and the
  publish workflow refuses a build whose `index.html` points anywhere else.
- It keeps **none of your data on any server**: it is a static bundle with no
  application server, no account, no telemetry and no cookie. A stack you build
  lives in your browser and in the file you export. An API key, if you use one,
  never enters a stack file, an export or an agent's context (property
  `CAR-P-22`).

## Licence

MIT. Every workspace in this repository is MIT licensed, and so are the sample
stacks, the Murmur reference and the evaluation tasks.
