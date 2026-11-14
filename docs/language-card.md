# Murmur — the one-page card

The complete reference follows this card. This page is the short version: the
shape of a script, the four recipes, and the traps that cost the most. Every
line of code below is copied from the reference; if the two ever seem to
differ, the reference wins.

## The shape

```text
on mouseUp
  <statements>
end mouseUp
```

One command per line. A block (`if`, `repeat`, a handler) closes with its own
`end` words. Comments start with `--`.

## The forms you need

| Need | Write |
|---|---|
| store a value | `put <value> into <container>` |
| read a value | `get <expression>` — the result is in `it` |
| write a field | `put <value> into field "X"` |
| one line of a field | `line 2 of field "X"` |
| one item of a line | `item 2 of row` |
| a line break | `return`, joined with `&` |
| count lines | `the number of lines in field "X"` |
| test | `if <condition> then` … `end if` |
| walk the lines | `repeat for each line row in field "X"` … `end repeat` |
| count | `repeat with n = 1 to 5` … `end repeat` |
| ask this card's agent | `consult agent with "<text>"` — the answer is in `it` |
| wake another card's agent | `tell agent of card "Cook" "<text>"` — no answer comes back |

## Recipe — add up a column

```text
on mouseUp
  put 0 into total
  repeat for each line row in field "Lines"
    add item 2 of row * item 3 of row to total
  end repeat
  put round(total, 2) into field "Subtotal"
end mouseUp
```

## Recipe — one value per line

```text
on mouseUp
  put empty into result
  repeat for each line amount in field "Amounts"
    if result is empty then
      put (amount * 2) into result
    else
      put result & return & (amount * 2) into result
    end if
  end repeat
  put result into field "Doubled"
end mouseUp
```

## Recipe — ask the card's agent

```text
on mouseUp
  consult agent with "Write a short thank-you note about this order: " & field "Notes"
  put it into field "Follow-up"
end mouseUp
```

## The traps that cost the most

1. **One rule for `put`, on every container.** `into` replaces; `before` and
   `after` insert — on a variable exactly as on a field. `put x after myVar`
   appends, `put x into myVar` replaces: there is no exception to learn.
2. **The agent's answer is in `it`**, not in a field:
   `consult agent with "…"` then `put it into field "Says"`.
3. **The chat goes straight to the card's agent.** Its persona answers; a
   script attached to a field never sees the chat. No `on chat` is needed.
4. **Only the names of the stack summary exist.** A field that is not listed
   there is refused: never invent one.
5. **`add 1 to total`, never `add total to 1`.** And one command per line.
