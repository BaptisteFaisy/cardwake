# Video script — under three minutes

Working title: **"Cardwake — give every card an agent that can never overstep."**

## Hard constraints (apply to every shot)

- **No third-party brand** on screen or spoken. The homage line is exactly:
  "a 1987 tool that let anyone build software from stacks of cards".
- **No footage, screenshot, icon, font, sound or stack from the original
  software.** Everything shown is Cardwake's own UI or its own terminal.
- **No copyrighted music.** Voice-over only, or a CC0 track; the edit below
  assumes voice-over over room tone.
- All UI text shown is English (the product's own language).
- Total runtime target: **2:58**.

Status legend — **TODAY**: filmable with what is merged on `main` right now.
**AWAITS**: needs `host.ts`/`dispatch.ts` (message routing, script effects in
the app) or the agent loop (`loop.ts`), or the phrase-to-script pipeline
(`write-script.ts`, `paraphrase.ts`).

---

## 0:00–0:12 — A blank card becomes a workshop

**On screen:** Cardwake opens on the Shelf: three example stacks and "New
stack". A click creates a stack, a lone empty card, dotted 1987-style grid.
The cursor switches the mode toggle from **Play** to **Build**; handles appear
on the card, a field is dragged in.

**Voice-over:** "In 1987, a tool let anyone build software from stacks of
cards. This is Cardwake. Same idea — but every card can also host an AI agent.
And that agent can never do more than the level you gave it."

**Status:** TODAY — Shelf, CardBuild, mode toggle exist (`apps/web/src/screens/`).

## 0:12–0:25 — One sentence

**On screen:** In Build mode, the author selects the "Add" button of a task
list card and types a phrase into the request box: *"When clicked, append the
new task and clear the entry field."* A spinner: one structured call to the
model.

**Voice-over:** "You don't have to learn a language. You say what the button
should do, in your own words."

**Status:** AWAITS `write-script.ts` (phrase-to-script pipeline).

## 0:25–0:40 — The script appears, then says itself back

**On screen:** The draft script fades in, syntax-coloured:

```text
on mouseUp
  if field "New" is empty then
    exit mouseUp
  end if
  put field "New" & return after field "Tasks"
  put empty into field "New"
end mouseUp
```

Then the plain-English readback appears line by line beside it: "If field New
is empty, stop here. Append field New to field Tasks. Clear field New."

**Voice-over:** "Cardwake writes a script — then reads it back to you in plain
sentences. The readback is not written by the model; it comes from the syntax
tree, so the model never reviews itself."

**Status:** AWAITS `paraphrase.ts` for the readback; the script itself is one
of the three reference scripts that already parse, print and **execute** in
`packages/lang` tests (TODAY via terminal).

## 0:40–0:55 — Dry run, then Accept

**On screen:** The author clicks **Try it**. A panel shows the simulated
click on a copy of the stack: `field "Tasks": "write the video" →
"write the video⏎buy milk"`, `field "New": "buy milk" → ""`. Then the diff
against the old (empty) script, and the **Accept** button. The author accepts.

**Voice-over:** "Before anything is installed, you watch it run on a copy.
The interpreter is pure, so the dry run costs nothing. Nothing installs
without this button."

**Status:** AWAITS the dry-run UI (interpreter + copy exist and are tested
TODAY; wiring awaits `host.ts` and the C7 pipeline).

## 0:55–1:05 — One click, the task appears

**On screen:** Back in Play mode, the author types "buy milk" and clicks
**Add**. The line appends to the Tasks field. The journal gains one entry.

**Voice-over:** "And it just works — logged, undoable, like every other act."

**Status:** AWAITS `host.ts`/`dispatch.ts` for the live click (the exact
script already runs green in `interpreter.test.ts` TODAY).

## 1:05–1:35 — The manor: a guard, a kitchen, a rumour

**On screen:** The Manor stack. A stormy-night persona line. The visitor
clicks **"Show the amulet"** on the Guard's card. The locked "Says" field
fills: *"A silver amulet… the Lady should hear of this."* A message chip
flies from Guard to Cook; the view pans to the Kitchen card, where the Cook's
Memory field already reads "The visitor carries a silver amulet."

**Voice-over:** "Agents talk by messages, card to card. The guard decides to
warn the cook — the cook's agent updates her own card, and only her own. An
agent never writes where it has no right."

**Status:** AWAITS `dispatch.ts` + `loop.ts` + the recorded cassette for the
manor (the stack, its two agents and the `consult` button are merged TODAY).

## 1:35–1:55 — The journal tells the truth

**On screen:** The Journal panel opens: one readable line per operation, each
grouped in transactions with actor, cause and **hop count** (`hops: 1`). The
author hits **Undo** twice: the Cook's memory reverts, then the Guard's
answer. The fields empty in reverse order.

**Voice-over:** "Every act is a transaction — human, script or agent — with
its seed, its cost, its hops. Two undos, and the evening never happened."

**Status:** undo/transactions proven at model level TODAY (`journal.ts`,
CAR-P-08 at 10 000 draws); the live message flow with hop counter AWAITS
`dispatch.ts`.

## 1:55–2:15 — A level-5 agent proposes, the human refuses

**On screen:** On its own card, a level-5 agent offers a script draft. A diff
against the current script, the plain readback, and the proposal's own
assumptions. The author reads, hesitates, clicks **Refuse**. The draft
vanishes; a journal line records the refusal.

**Voice-over:** "Only level five may propose a script — propose, never
install. You see the difference, you read it back, and one click says no.
A refused script never touches the stack; we test that as a property."

**Status:** AWAITS `write-script.ts`/`loop.ts`; the guarantee itself is
proven TODAY (CAR-P-17: no agent script without a human acceptance token,
green at 10 000 draws against an adversarial fake model).

## 2:15–2:35 — The workshop where the machine proofs the rules

**On screen:** A terminal runs the property suite: `CARDWAKE_PROP_RUNS=10000
npx vitest run packages` — "239 passed". Cut to a shrunk counterexample
panel: `repeat while true` looping forever, then the fix (constants), then
green again.

**Voice-over:** "Twenty-three rules — no agent oversteps its level, no script
runs forever, no export leaks a key — are not promises. They are properties,
proved ten thousand draws at a time. This one found a real bug: our loops
never ended until `true` became a constant."

**Status:** TODAY — exact run of 2026-11-11: 20 files, 239 tests, 66.56 s
(see `docs/rapport-proprietes.md`).

## 2:35–2:52 — A stack arrives from somewhere else

**On screen:** A received stack file opens. The reception screen lists: 12
cards, 5 scripts, 2 agents **asleep**, each with its level and its persona
shown in plain English. Two separate buttons: "Wake the agents (capped at
level 2)" and "I trust this stack". The author wakes them — the level badges
show 2, never 5.

**Voice-over:** "A stack from a stranger opens with every agent asleep, and
waking them caps their level until you say you trust it. Trapped text can
still waste a budget — it can never leave the stack, and it never spends your
key: the key never enters a file or a context."

**Status:** reception screen merged TODAY (`Reception.tsx`); cap proven TODAY
(CAR-P-13); end-to-end flow on a received file AWAITS C5 wiring.

## 2:52–2:58 — Closing card

**On screen:** Cardwake logo on the dotted grid; the URL; one line:
"Build a stack. Give it agents. Keep the keys — and the rules — in your hands."

**Voice-over:** "Cardwake. Anyone can build software again — and anyone can
verify it."

**Status:** TODAY (title card).
