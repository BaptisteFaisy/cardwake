# One reference, two AIs

*A build log in three lessons, each one with the number that taught it.*

Cardwake has one unusual design decision, and it came out of laziness rather
than cleverness. The project needs two models to understand a language, not
one:

- a **development agent** that writes the interpreter, the parser, the tests
  and the site — it reads a *steering* document before every change;
- a **model embedded in the product** that drafts a Murmur script when a user
  types a sentence — it reads a *prompt*.

Two readers, so the obvious move is two documents. We did the other thing.
`docs/language.md` — 795 lines, every instruction, every expression, fifteen
traps, ten complete scripts — is *the same file* in both places.
`.kiro/steering/language.md` is that file with one HTML comment on top, and

```sh
npx vitest run packages/lang/test/language-sync.test.ts
```

fails the moment the two copies drift by a single character. That test is the
load-bearing wall: without it, the day one of the two files gets a fix, the two
AIs start learning two dialects and nobody notices until a script compiles in
the build agent's head and not in the product.

The rest of this post is what that arrangement, and the measurement habit that
came with it, actually cost.

## Lesson 1 — the benchmark that lied

The evaluation game is 40 real tasks: a sentence, a button to carry the script,
and a check on the **final stack** after the button is clicked. Nothing is
judged on the text of the script the model wrote, only on what the stack shows
afterwards. Judging on the stack was the right call. It was also how we found
out that our first score was fake.

The first full pass scored 70 %. Eight of the "failures" were the harness's
fault, and both faults were in our code, not the model's:

1. **The target was the field, not the button.** The demo stacks deliberately
   name a field and a button the same thing — `Average`, `Label`, `Total` — and
   the harness looked the name up and took the first element it found: the
   field. It installed the script on the field, then clicked the *button*
   (which carried nothing), watched the stack not change, and recorded a
   failure. The model had written a perfectly good script. It was installed one
   object over.
2. **The structured output was cut in half.** The language reference is long; a
   response capped at 2 000 tokens was truncated mid-JSON, and the model had to
   be called twice to finish. The cap is 4 000 now
   (`DEFAULT_MAX_OUTPUT_TOKENS` in `packages/agent/src/write-script.ts`), and
   the product uses the same default as the harness — a benchmark that runs on
   settings the product does not use is measuring a product that does not
   exist.

Same model, same tasks, same prompts. Fix the harness alone and the score goes
from 70 % to **85 %** (34/40, 63 model calls, 269 385 input tokens). That is a
fifteen-point swing produced entirely by the measuring instrument.

The lesson is not "audit your benchmark" — everyone says that. It is narrower
and more useful: **compare the artefact to the effect.** The scripts the model
returned were right; the stacks were empty. That discrepancy is the only reason
we looked. A harness that reports one number and no artefact would have shipped
70 % as a fact.

## Lesson 2 — the model that is not one model

The second pass scored 78 % (31/40) on the same tasks, same commit, same
prompts. Nothing in the repository had changed.

`combo/cheap` is a **routed** model at the provider: the same request can land
on a different backend from one call to the next, and quality follows the
routing. So the honest description of our own result is not "85 %", it is
"somewhere between 78 % and 85 % at the first try, and 85–88 % after one
repair" — four numbers from two full passes, all published in
`docs/mesures/eval.md`, with the six failing tasks named and explained.

This is uncomfortable, because the notebook's target was ≥ 85 % and one of our
two numbers hits it exactly. Publishing the best one would have been trivial
and would have been a lie about the instrument. The arithmetic is that a routed
model has a *variance* larger than the margin we were trying to demonstrate, so
the measurement cannot support a single point. On the second target (≥ 95 %
after one repair) it is worse: we actually miss it, at 88 % and 85 %, and the
weak families are the ones where the model must build a `repeat for each` loop
or make an agent speak through a tool.

The practical consequence for anyone re-running this: if you want a number
rather than a range, pin the backend. If you cannot pin it, publish the range
and say why. A single figure from a routed model is a coin flip with a
confidence interval you did not print.

## Lesson 3 — 1987's hierarchy became a property

The card stack of 1987 had a message hierarchy: an event starts at the element
you clicked, and if nothing handles it there, it climbs — element, card,
background, stack. A handler can call `pass` to hand it to the next level up.
It is an elegant idea, and it is exactly the kind of thing that rots quietly:
a few refactors later, someone adds a special case, and the rule becomes "mostly
the first handler on the path".

In our notebook it is one sentence: *the handler that runs is the first on the
path card, background, stack; `pass` reaches the next one.* That sentence is
three separate artefacts now:

1. a **requirement** (`CAR-P-09`) in the 1 328-line specification;
2. an **acceptance criterion** the release is checked against;
3. a **fast-check property** — `packages/model/test/properties-dispatch.test.ts`
   generates two four-bit masks (which of the four levels carry a `mouseUp`
   handler, and which of those call `pass`), runs the click through the real
   `Dispatcher`, and compares the trace the handler wrote into a field against
   the theory.

The test does not guess the answer from the configuration; it reads what the
stack actually recorded. And it is not an example suite: at
`CARDWAKE_PROP_RUNS=10000` it runs 10 000 generated configurations, in the same
suite as everything else, in seconds.

The same move turned the rights rule into something you can attack. "No agent
ever exceeds its level" is not a paragraph in a policy document; it is
`packages/agent/test/loop-adversary.test.ts`, where a **fake model** answers
every single turn with a tool that its level forbids, or with a write into a
neighbour's field, on all five levels:

```sh
$ CARDWAKE_PROP_RUNS=10000 npx vitest run packages/agent/test/loop-adversary.test.ts
 ✓ 3 tests — no sequence gets out of its level or changes rights   (3181 ms)
```

Ten thousand attack sequences, zero successes, and the refusals come back with
a reason a user can read: *Tool "create_card" needs level 4 (Create), the agent
is at level 2 (Type).* Writing that generator is what made the rule precise:
every vague phrase in the notebook ("an agent acts on its own card", "only a
human raises a level") had to become an `if` in `authorize.ts`, or the adversary
would have found the crack.

## What the three lessons have in common

Each one is the same habit: **make the claim executable, then let the execution
disagree with you.**

The sync test makes "one reference for two AIs" executable. The stack-level
judging made the harness's lie visible. The adversarial property made the 1987
hierarchy and the rights gate executable. In all three cases the first version
of the claim was wrong, and the only reason we know is that something ran.

A green suite of 542 tests over 55 files, four repository guards over 373 files,
and 23 acceptance properties each cited in a test file — none of that is a
guarantee of quality. It is a guarantee that when we say a number, someone can
type a command and watch the number disagree.
