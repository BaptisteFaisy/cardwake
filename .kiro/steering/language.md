<!-- Murmur reference: this file and docs/language.md must stay byte-identical below this single line; a test enforces it (`packages/lang/test/language-sync.test.ts`). -->
# The Murmur Language — Complete Reference

Murmur is the language in which the behaviour of a Cardwake stack is written.
A script is plain text, visible in the editor, readable by the person who wrote
the card, and it keeps working when no model is available. This reference is
the single source printed for two readers at once: the assistant that drafts a
script, and the author who has to accept it. Both must find the same words,
and nothing here is optional: a form that is not written here is rejected.

## What Murmur is

- **Everything is text.** Fields, variables and computed values are text; a
  text that looks like a number is used as a number when arithmetic needs one.
- **Keywords are English and case-insensitive.** `put`, `Put` and `PUT` are
  the same word. Names you choose (`total`, `row`, `myTotal`) keep their case
  but are matched case-insensitively.
- **One command per line.** Only a block statement (`if`, `repeat`, a handler)
  spans several lines, and it closes with its own `end` words.
- **Comments start with `--`** and run to the end of the line. They may sit
  after a command on the same line.
- **Strings sit between double quotes.** `"Suivi"`, `"The visitor shows you a
  silver amulet."`
- **`it` is the automatic result.** `get`, `consult agent`, `ask` and `find`
  store their value in `it`; read it in an expression, write with `into it`.
- **No way out.** There is no command for the network, the files, the
  clipboard, or for running a text as a script: a stack cannot escape.

## Scripts and messages

A script is a list of blocks: handlers (`on`) and functions (`function`). Every
element — button, field, card, background, stack — carries its own script.

### Handlers

```text
on <message name> [<parameter>[, <parameter>…]]
  <statements>
end <message name>
```

The handler name is a message name. `mouseUp` fires when the button is
clicked; `openCard` fires when the card is shown; a message you `send` fires
whatever handler carries its name. The closing line repeats the name.

```text
on mouseUp
  put "Hello" into field "Greeting"
end mouseUp
```

### Functions

```text
function <name> [<parameter>[, <parameter>…]]
  <statements>
  return <expression>
end <name>
```

A function returns a value with `return`; the caller receives it as a value,
not as `it`. A function without `return` returns `empty`.

```text
function totalOf row
  return item 2 of row * item 3 of row
end totalOf
```

### How a message travels

A message climbs one level at a time: element, then card, then background,
then stack. The first handler found handles the message; `pass` hands it to
the next level. A message that nobody handles is dropped. That climb is also
the network between agents: a card that wants something from another card
sends a message, and the receiving card decides what to do with it.

## Statements

### put

```text
put <expression> into <container>
put <expression> before <container>
put <expression> after <container>
```

`into` replaces, `before` and `after` insert at the edges. A container is a
variable, `it`, or a field or button, optionally reduced to one chunk.

```text
put "Done" into field "Status"
put field "New" & return after field "Tasks"
put empty into field "New"
```

### set

```text
set [the] <property> of <object> to <expression>
```

The properties are `name`, `visible`, `enabled`, `locked`, `hilite`, `label`,
`style`, `rect`, `text`.

```text
set the visible of button "Next" to false
set the hilite of button "Done" to true
set the label of button "Pay" to "Paid"
```

### get

```text
get <expression>
```

Stores the value in `it`, without writing anywhere.

```text
get the number of lines in field "Tasks"
put it into field "Count"
```

### go

```text
go [to] <card reference>
```

```text
go to card "Kitchen"
go next card
go to card 3
go to card id 12
```

### send

```text
send <expression> [with <expression>[, <expression>…]] to <object>
```

The message name is an expression, so it can be computed. The message is
queued and handled once the current handler finishes.

```text
send "refresh" to this card
send "greet" with "Marie" to button "Welcome"
```

### pass

```text
pass [<message>]
```

Hands the current message to the next level of the hierarchy. With no name,
the message being handled is passed on.

```text
on mouseUp
  pass mouseUp
end mouseUp
```

### answer

```text
answer <expression>
```

Shows a short dialogue with one button.

```text
answer "The amulet is warm."
```

### ask

```text
ask <expression> [into <container>]
```

Asks a question and puts the typed text in `it`, or straight into the given
container.

```text
ask "Client name?" into clientName
```

### show and hide

```text
show <object>
hide <object>
```

```text
hide field "Hint"
show button "Next"
```

### add, subtract, multiply, divide

```text
add <expression> to <container>
subtract <expression> from <container>
multiply <container> by <expression>
divide <container> by <expression>
```

`add` and `subtract` name the value first; `multiply` and `divide` name the
container first. The asymmetry is on purpose, and it is the first pitfall below.

```text
add 1 to field "Count"
subtract item 3 of row from field "Remaining"
multiply total by 1.1
divide field "Points" by 2
```

### create

```text
create card ["<name>"] [with background "<background name>"]
create background ["<name>"]
create field ["<name>"]
create button ["<name>"]
```

The name, when given, is a string.

```text
create card "Day 2"
create card "Order" with background "Invoice"
create field "Notes"
```

### delete

```text
delete <object>
```

```text
delete button "Old layout"
delete this background
```

### sort

```text
sort <chunk> of <container>
sort <container> [by <chunk> [<number>]] [ascending | descending] [numeric]
```

`by` names the element used as the sort key; `numeric` compares numbers.

```text
sort lines of field "Tasks"
sort field "Tasks" by line 1 descending
sort lines of field "Prices" numeric
```

### find

```text
find <expression>
```

Searches the stack for the text and reports the cards that contain it in `it`.

```text
find "amulet"
put it into field "Hits"
```

### wait

```text
wait <expression> [seconds | ms]
```

The default unit is milliseconds. `wait 5` waits five milliseconds; to wait
five seconds, write `wait 5 seconds`. The total waiting of one processing is
capped (see Limits).

```text
wait 250
wait 2 seconds
```

### consult

```text
consult <agent reference> with <expression>
```

Asks the agent of a card and waits for its answer, which lands in `it`. The
agent sees its own card, writes only there, and answers within its level.

```text
consult agent with "The visitor shows you a silver amulet."
put it into field "Says"
```

### tell

```text
tell <agent reference> <expression>
```

Tells an agent something without waiting: it is woken later, nothing returns.

```text
tell agent of card "Cook" "A guest is waiting."
```

### if

```text
if <condition> then <statement>
if <condition> then
  <statements>
[else
  <statements>]
end if
```

The single-line form carries one statement and no `end if`. The block form
closes with `end if`; `else` is optional.

```text
if field "New" is empty then exit mouseUp
```

```text
if total > 100 then
  set the hilite of button "Discount" to true
else
  set the hilite of button "Discount" to false
end if
```

### repeat

```text
repeat with <name> = <from> to <to> [step <step>]
repeat for each <chunk> <name> in <expression>
repeat while <condition>
repeat <count> times
end repeat
```

Every form closes with `end repeat`. `step` defaults to 1 and may be negative.

```text
repeat for each line row in field "Lines"
  add item 2 of row * item 3 of row to total
end repeat
```

### exit

```text
exit repeat
exit <handler name>
```

Leaves the innermost loop, or the named handler, immediately.

```text
if field "New" is empty then exit mouseUp
if total > 1000 then exit repeat
```

### return

```text
return [<expression>]
```

Ends a function and hands its value to the caller. With no expression, the
function returns `empty`.

```text
return round(total, 2)
```

### global

```text
global <name>[, <name>…]
```

Declares variables shared by all handlers; each handler using one declares it.

```text
global visitCount
add 1 to visitCount
```

### Calling a function

```text
<function name> [<argument>[, <argument>…]]
```

A word that is not a keyword calls a function of the same script; inside an
expression, the same function takes its arguments in parentheses.

```text
showTotal
put myTotal(2, 3) into field "Result"
```

## Expressions

### Values

| Written | Meaning |
|---|---|
| `"text"` | a string |
| `42`, `3.5` | a number, kept as text |
| `empty` | the empty text |
| `it` | the result of the last command that produced one |
| `field "X"` | the text of that field |
| `word 2 of field "X"` | one chunk of that text |
| `the visible of button "B"` | one property of an object |
| `total` | a variable |
| `the date`, `the time`, `the long date` | the clock, supplied by the host |

A line break is the constant `return`: `put field "A" & return & field "B"`.

### Arithmetic

`+`, `-`, `*`, `/`, `^` (power), `div` (integer quotient), `mod` (remainder),
and unary `-`. Multiplication and division bind tighter than addition and
subtraction; parentheses override the order, as in `round(total * 1.1, 2)`.

```text
put (2 + 3) * 4 into field "Result"
put 17 mod 5 into field "Rest"
```

### Concatenation

`&` joins two texts with nothing between them; `&&` joins them with a single
space. Both convert numbers to text on the way.

```text
put field "First" & " " & field "Last" into field "Full"
put "Total:" && total into field "Caption"
```

### Comparisons

`=`, `<>`, `<`, `>`, `<=`, `>=` compare two values and yield `true` or `false`.
When both sides are numbers the comparison is numeric; otherwise it is textual
and case-insensitive.

```text
if field "Country" = "France" then answer "Bonjour"
```

### Logic and tests

`and`, `or`, `not` combine conditions. `contains`, `is in`, `is not in`,
`is empty` and `is not empty` test texts.

```text
if field "Note" contains "urgent" then set the hilite of button "Flag" to true
if "payé" is in field "Tasks" then answer "Found"
if field "Email" is not empty then go next card
```

### Built-in functions

`length(text)`, `offset(needle, haystack)`, `round(x [, digits])`,
`min(a, b)`, `max(a, b)`, `sum(list)`, `average(list)`, `upper(text)`,
`lower(text)`, `random()`. `sum` and `average` read a list separated by
commas. `random()` returns a number in `[0, 1[` drawn from a seeded generator
that is written to the log, so a run can be replayed.

```text
put upper(field "Code") into field "Code"
put round(total / 3, 2) into field "Share"
```

### Counting

```text
the number of chars in <expression>
the number of words in <expression>
the number of items in <expression>
the number of lines in <expression>
the number of cards
```

`of` works wherever `in` works.

```text
put the number of lines in field "Tasks" into field "Count"
```

### Properties as values

```text
the <property> of <object>
```

Every property listed under `set` can be read: `the name of this card`,
`the text of field "Notes"`, `the visible of button "Pay"`.

## Chunks of text

A chunk is one piece of a text: one character, one word, one item, or one
line. Words are separated by spaces, items by commas, lines by line breaks.

```text
<char|word|item|line> <number> [to <number>] of <container>
```

The count starts at 1. `-1` means the last chunk, `-2` the one before. A range
reads or replaces several chunks at once. Chunks nest, so a word inside a line
is written `word 2 of line 3 of field "Suivi"`.

```text
put item 2 of line 1 of field "Lines" into field "Qty"
put "payé" into word 2 of line 3 of field "Follow-up"
put "x" into item -1 of field "Codes"
put empty into word 1 of field "Title"
put line 2 to 4 of field "Address" into field "Short address"
```

Writing a single chunk replaces it and leaves the rest untouched; writing a
range replaces the whole range. The script names the piece it means, so the
author can check the sentence against the field.

## Referring to objects

| Written | Refers to |
|---|---|
| `me` | the object holding the script |
| `the target` | the object that received the message |
| `this card` | the card being displayed |
| `next card`, `previous card` | the neighbours in the stack order |
| `first card`, `last card` | the ends of the stack |
| `card "Kitchen"`, `card 3`, `card id 12` | one card, by name, rank or identifier |
| `field "Total"`, `field 2`, `field id 7` | one field, on the current card |
| `field "Total" of card "Kitchen"` | one field, on another card |
| `button "Next"` | one button, same three ways |
| `agent` | the agent of the current card |
| `agent of card "Cook"` | the agent of another card |
| `this background` | the background shared by several cards |
| `this stack` | the stack |

A plain `field "X"` means the field on the displayed card. A field that
belongs to the background has one content per card, so the same name on two
cards is two different texts. A locked field can be written by a script, but
never by an agent.

## Numbers

- Numbers are computed in floating point.
- A result is displayed with at most six decimals, trailing zeros removed:
  `0.1 + 0.2` shows `0.3`.
- `round(x, n)` fixes the number of decimals; `round(x)` gives a whole number.
- `div` gives the integer quotient, `mod` the remainder.
- Arithmetic on a text that is not a number is a script error, not a zero. The
  error names the object, the line, the column, and a hint.

## Limits

Every run is bounded. Going over a limit stops the processing, restores the
state as it was before, and shows an error: nothing half-done is kept.

| Guard | Default | On exceeding |
|---|---|---|
| Steps per processing, everything it triggers included | 100 000 | stopped, rolled back, error |
| Depth of message sending | 50 | stopped, rolled back, error |
| Cumulative `wait` per processing | 5 seconds | stopped, rolled back, error |
| Size of one text | 100 000 characters | refused, error |
| Size of one script | 20 000 characters | refused, error |
| Cards in a stack | 500 | refused, error |
| Elements on one card | 100 | refused, error |

An author may lower these values in the stack settings; nobody can raise them
above the application ceilings, and a received stack never gets a bigger
budget than a created one.

There is **no command** for the network, the files, the clipboard, or for
executing a text as a script. A script that needs something outside the stack
sends a message instead.

## Agents and levels

Each card may host one agent. Two statements talk to it:

- `consult agent with "<text>"` — synchronous: the answer arrives in `it`.
- `tell agent <text>` — asynchronous: the agent is woken later; nothing comes
  back.

An agent acts through a small set of tools, and each tool has a minimum level.
The level is fixed by a human and by nobody else:

| Level | Name | What the agent may do |
|---|---|---|
| 1 | Browse | read its card, reply, send a message to another card |
| 2 | Type | level 1, plus write in the unlocked fields of its own card |
| 3 | Paint | level 2, plus change the appearance of its elements (visible, label, style, hilite) |
| 4 | Create | level 3, plus create, move and delete elements of its card, create a card, change the displayed card |
| 5 | Program | level 4, plus **propose** a script for an object of its card |

Rules without exception:

- Only a human sets a level. No agent tool, no script command changes a level,
  a persona or a budget.
- An agent writes only on its own card. To act elsewhere it sends a message,
  and the receiving card decides.
- At level 5, a proposed script is installed only after a human accepts it, in
  view of the plain-language reading and the difference with the old script.
- In a received stack, every agent is capped at level 2 until the human
  declares the stack trusted. New agents start at level 2.
- The card is the whole memory of the agent: no hidden history, no other store.

## Recipes

Four complete recipes, one per job that comes up most often. Each one is
copyable: replace only the names between quotes by names that appear in the
stack summary, keep every other word.

### Recipe 1 — Walk the lines of a field and add up a column

```text
-- Button "Total": add up quantity x price for every line of field "Lines"
on mouseUp
  put 0 into total
  repeat for each line row in field "Lines"
    -- one turn per line; "Paper,3,4" gives item 2 = 3 and item 3 = 4
    add item 2 of row * item 3 of row to total
  end repeat
  put round(total, 2) into field "Subtotal"
end mouseUp
```

`repeat for each line row in field "X"` gives `row` the whole line, then the
next one, and stops by itself: there is no counter to watch. To read one value
inside a line, take an item: `item 2 of row`. Counting starts at 1, and `item 1`
is the first item.

### Recipe 2 — One value per line: build the list, then write it once

This is the recipe for "one number per line", "a table of results", "the
doubled amounts". Build the text in a variable, then write the variable once.

```text
-- Button "Double": double every line of field "Amounts", one per line
on mouseUp
  put empty into result
  repeat for each line amount in field "Amounts"
    if result is empty then
      -- first line: no line break before it
      put (amount * 2) into result
    else
      -- all the others: a line break, then the value
      put result & return & (amount * 2) into result
    end if
  end repeat
  put result into field "Doubled"
end mouseUp
```

Two points make this recipe work, and both are easy to get wrong:

- **`return` is the line break.** Join with `& return &`, never with a comma:
  `","` would make one single line.
- **A variable grows with `into`, not with `after`.** `put x after myVar`
  REPLACES `myVar` with `x`: only a field and a chunk are appended with
  `after`. To add to a variable, write the whole new value:
  `put myVar & return & x into myVar`.

Writing straight into the field also works: it appends to the field and drops
the last line break.

```text
on mouseUp
  put empty into field "Doubled"
  repeat for each line amount in field "Amounts"
    put (amount * 2) & return after field "Doubled"
  end repeat
  put char 1 to -2 of field "Doubled" into field "Doubled"
end mouseUp
```

### Recipe 3 — A numbered table with `repeat with`

```text
-- Button "Draw": the five times table, one row per line
on mouseUp
  put empty into table
  repeat with n = 1 to 5
    if n = 1 then
      put (n & " x 5 = " & (n * 5)) into table
    else
      put table & return & (n & " x 5 = " & (n * 5)) into table
    end if
  end repeat
  put table into field "Table"
end mouseUp
```

`repeat with n = 1 to 5` counts by itself. Piece the line together with `&`,
and put an arithmetic expression in parentheses: `(n * 5)`.

### Recipe 4 — Make the card's agent speak, and wake another card's agent

```text
-- Button "Draft": ask this card's agent and keep its answer
on mouseUp
  consult agent with "Write a short thank-you note about this order: " & field "Notes"
  put it into field "Follow-up"
end mouseUp
```

`consult agent with <text>` waits for the answer, and the answer is in `it` —
nowhere else. Never read a field to find it: `put it into field "X"` is the
whole hand-over. Give the agent the material it needs inside the text: it only
sees its own card.

```text
-- Button "Send to kitchen": hand the order to ANOTHER card's agent
on mouseUp
  tell agent of card "Kitchen" "ORDER " & field "Order"
  put "Sent." into field "Log"
end mouseUp
```

`tell` does not wait and returns nothing: the other card's agent runs after the
current handler ends, writes on its own card, and its answer cannot be read.
`consult` when you need the answer, `tell` to hand work to another card.

When the human types in the **chat bar**, the message goes straight to the
card's agent: the persona answers and writes by itself, and a script attached to
a field never sees that message. So a request like "when the visitor chats,
greet them" needs no chat handling at all — keep the script minimal and let the
persona work.

```text
on mouseUp
  -- the chat goes straight to the card's agent: nothing to do here
end mouseUp
```

## Mistakes to avoid

1. **Putting the value after the target in `add`.**
   Wrong: `add field "Count" to 1` — Right: `add 1 to field "Count"`.
2. **Using the `add` order with `multiply`.**
   Wrong: `multiply 2 by total` — Right: `multiply total by 2`.
3. **Forgetting the quotes around an element name.**
   Wrong: `put "hi" into field Notes` — Right: `put "hi" into field "Notes"`.
4. **Two commands on one line.**
   Wrong: `put 1 into total put 2 into other` — Right: one command per line.
5. **Reading `it` when nothing produced a value.**
   Wrong: `add 1 to total` then `put it into field "T"` — Right:
   `put total into field "T"`, or `get total` first.
6. **Believing `=` assigns.**
   Wrong: `if bonus = 10` written to set a value — Right: `put 10 into bonus`,
   and `=` only compares.
7. **Forgetting `end if` on the block form.**
   Wrong: `if x > 1 then` … `end repeat` — Right: `if x > 1 then` … `end if`.
   The single-line form `if x > 1 then exit mouseUp` needs no `end if`; the
   block form does.
8. **Reading `wait 5` as five seconds.**
   Wrong: `wait 5` (five milliseconds) — Right: `wait 5 seconds`.
9. **Reading the agent's answer from a field.**
   Wrong: `consult agent with "…"` then `put field "Says" into it` — Right:
   the answer is already in `it`: `put it into field "Says"`.
10. **Doing arithmetic on text that is not a number.**
    Wrong: `add field "Name" to 1` — Right: check first, or convert what you
    know: `add item 2 of row to total`.
11. **Counting chunks from zero.**
    Wrong: `char 0 of field "Code"` — Right: `char 1 of field "Code"`, and
    `char -1` for the last one.
12. **Writing `exit` alone.**
    Wrong: `exit` — Right: `exit repeat` or `exit mouseUp`.
13. **Sharing a variable between handlers without declaring it.**
    Wrong: `put 0 into visits` in one handler, `add 1 to visits` in another —
    Right: `global visits` at the top of both handlers.
14. **Concatenating with `+`.**
    Wrong: `put "Total: " + total into field "C"` — Right:
    `put "Total: " & total into field "C"`.
15. **Expecting a sent message to run at once.**
    Wrong: `send "compute" to this card` then reading the result on the next
    line — Right: the message is handled after the current handler ends; to
    get an answer immediately, call a function or `consult`.
16. **Appending to a variable with `after`.**
    Wrong: `put x after myVar` (this replaces `myVar` with `x`) — Right:
    `put myVar & x into myVar`. Only fields and chunks are appended with
    `after`.
17. **Handling the chat with a script.**
    Wrong: `on chat` … — Right: the chat bar talks to the card's agent, whose
    persona answers; a script attached to a field never receives it.

## Ten complete examples

### 1. Add a task to a list

```text
-- Button "Add" of a task list
on mouseUp
  if field "New" is empty then
    exit mouseUp
  end if
  put field "New" & return after field "Tasks"
  put empty into field "New"
end mouseUp
```

### 2. Total, VAT and grand total of a quote

```text
-- Button "Total" of a quote
on mouseUp
  put 0 into total
  repeat for each line row in field "Lines"
    add item 2 of row * item 3 of row to total
  end repeat
  put round(total, 2) into field "Subtotal"
  put round(total * 0.1, 2) into field "VAT"
  put round(total * 1.1, 2) into field "Total"
end mouseUp
```

### 3. Ask the card's agent

```text
-- Button "Show the amulet" on a character's card
on mouseUp
  consult agent with "The visitor shows you a silver amulet."
  put it into field "Says"
end mouseUp
```

### 4. Count the tasks and flag the list

```text
on mouseUp
  put the number of lines in field "Tasks" into field "Count"
  if field "Count" is empty then
    put 0 into field "Count"
  end if
  if field "Count" > 10 then
    set the hilite of button "Review" to true
  else
    set the hilite of button "Review" to false
  end if
end mouseUp
```

### 5. Walk the stack and announce each card

```text
on openCard
  answer "You are in " & the name of this card
  if the name of this card = "Cellar" then
    show button "Take the key"
  else
    hide button "Take the key"
  end if
end openCard
```

### 6. One card warns another card's agent

```text
on mouseUp
  tell agent of card "Cook" "The guest asks for the menu."
  put "The cook has been warned." into field "Log"
end mouseUp
```

### 7. Multiplication table with a step

```text
on mouseUp
  put empty into field "Table"
  repeat with n = 1 to 10
    put n & " x 7 = " & (n * 7) & return after field "Table"
  end repeat
end mouseUp
```

### 8. Sort the prices, then show the cheapest

```text
on mouseUp
  sort lines of field "Prices" numeric
  put line 1 of field "Prices" into field "Cheapest"
  put the number of lines in field "Prices" into field "How many"
end mouseUp
```

### 9. A function shared by two buttons

```text
function withVat amount
  return round(amount * 1.1, 2)
end withVat

on mouseUp
  put withVat(item 2 of line 1 of field "Lines") into field "Gross"
end mouseUp
```

### 10. Ask a name, then create a card for it

```text
on mouseUp
  ask "Client name?" into clientName
  if clientName is empty then
    answer "No name, no card."
    exit mouseUp
  end if
  put clientName into field "Full name"
  create card "New client"
  go to card "New client"
end mouseUp
```
