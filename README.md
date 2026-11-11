# Cardwake

**Programmable card stacks in natural language — every card can host an AI
agent, and that agent can never do more than the level a human gave it.**

Cardwake is a small desktop-grade application you build out of cards: an
shelf of stacks, a card you can click, fields you can type in, and buttons
that carry a script. The script is written in **Murmur**, a small language you
can read, edit and keep. When a card needs judgement rather than a rule, its
agent answers — inside its own card, inside its own level.

> Inspired by a 1987 card-stack tool that let anyone build software; not
> affiliated with or endorsed by its publisher.

## Judge in three minutes

Three clicks, no account, no key:

1. Open the shelf and pick the stack **The Manor**.
2. The first card is the hall. A character is standing there.
3. Click **Show the amulet**.

The character's agent answers in its own field — read it, then open the
**journal**: every write is listed, with the message that caused it, the
object it touched, and an undo button. Nothing the agent did is hidden, and
nothing it did is irreversible.

The two other sample stacks show the everyday side: a task list you can add
to, and a quote whose total, VAT and grand total are computed by a script of
nine lines.

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

## The four packages

| Package | What it owns | Purity |
|---|---|---|
| `@cardwake/lang` | Murmur: lexer, parser, syntax tree, step-by-step interpreter, static checks, plain-language reading | pure: no browser, no network, no clock it did not receive |
| `@cardwake/model` | the stack format, the reversible operations, the journal and undo, `authorize` (the single gate for rights), `dispatch` (the message hierarchy) | pure: no browser, no network |
| `@cardwake/agent` | the card view given to an agent, its tools, its turn loop and budgets, and the three model gateways | pure except the gateway it is handed |
| `@cardwake/web` | the site: shelf, card, editor, journal, settings | the only place with a DOM |

A fifth workspace, `@cardwake/cli`, holds the optional command line: validate a
script, run a stack headless, read it back in plain English.

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
change (`Total: 120 → 132`) before accepting it. The installed script keeps your
sentence as its first comment, and it runs with no model at all afterwards.

**A trial with no key.** The sample stacks ship their recorded exchanges, so the
whole product can be explored offline. A key is only needed to write a new
script or to make an agent answer something that was never recorded.

**Nothing is executed that was not read.** A model's output is text: it is
parsed by the Murmur parser, checked, read back, and installed only when a human
presses Accept. No model output is ever run as code, and there is no command in
the language for the network, the files or the clipboard.

## Documentation

- [`docs/language.md`](docs/language.md) — the complete Murmur reference. It is
  the text handed to the model that writes scripts, and the same text handed to
  the in-IDE agent; a test keeps the two copies identical.
- [`docs/architecture.md`](docs/architecture.md) — the packages, the single
  gate for rights, the single gateway, and how a message travels.
- [`docs/journal.md`](docs/journal.md) — the build log, with what is measured
  and what is still to measure.
- `.kiro/` — the specs, steering files, hooks and reviewer agents used to build
  the project itself.

## Contributing rules that are not negotiable

- Code files stay under 500 lines, functions under 50, and logic is never
  duplicated: one implementation, shared helpers.
- Every operation goes through `model/authorize`; every model call goes through
  the gateway. A module that does otherwise is a bug, not a shortcut.
- No test ever calls a real model, and no key ever enters the repository.
- A change that touches behaviour comes with the test that proves it.

## Licence

MIT. Every workspace in this repository is MIT licensed, and so are the sample
stacks, the Murmur reference and the evaluation tasks.
