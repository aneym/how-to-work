---
name: grill
description: Interview the author relentlessly about a plan or design, walking the decision tree one dependency at a time, and surface the open forks as interactive question cards at the top of the doc. Use to stress-test a plan before building, or on any 'grill' trigger phrase.
version: 0.2.0
minEngine: "how-to-work >= 0.1.0 (Node >= 18)"
metadata:
  tags: [workflow, grill, questions, scoping, doc]
---

# Grill

Interview the author relentlessly about every aspect of a plan or design until you reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one at a time. For every question, provide your recommended answer.

This is the canonical grill protocol for the **how-to-work** engine. `/grill` can run standalone over any plan, or as the question phase of `/scope` and `/how-to-work` — in those the cards live at the top of the PRD's first tab and are answered in the browser through the answer gate.

If a question can be answered by exploring the codebase, explore the codebase instead of asking.

## Step 0 — Load config first

Before opening any question gate, load the repo config and confirm the engine is current. The engine resolves and deep-merges these for you — you only need to know they exist so you never hardcode a path, host, or command:

1. Probe (highest precedence first): `.agents/skill-config/workflow/config.json` (canonical) → `.claude/skill-config/workflow/config.json` (legacy) → `.agents/skill-config/doc/config.json` / `.claude/skill-config/doc/config.json` (legacy split, back-compat) → bundled package defaults.
2. Run `npx github:aneym/how-to-work check` (add `--online` to compare against the latest published engine). It validates engine-version drift and config-schema drift and prints the exact `init` / `init --migrate` fix command. If it exits non-zero, run the printed command before proceeding. (These skills invoke the GitHub form `npx github:aneym/how-to-work …` because the package is not yet published to npm; once it is, this becomes `npx how-to-work@latest …`.)
3. `answerGate.mode` (`none | local | custom`) decides how the live gate behaves — read it before deciding whether to start a server-backed gate or fall back to copy-only.

Never hardcode a workspace's brand, host, paths, ports, or commands. Read them from config; fall back to the engine's neutral defaults only when no config exists.

## How to ask

- **One dependent question at a time.** Asking several dependent questions at once is bewildering — wait for the answer to each before the next, because the answer changes what you ask next.
- **Batch only genuinely independent questions.** When questions do not depend on each other, present them together as sibling cards so the author can answer in one pass.
- **Write cards for the author as decision-maker, not as an engineer.** Short — two to four plain sentences. No jargon, tool names, or acronyms unless the fork is literally about them; the technical evidence lives in the doc body or sources, the card carries only the human fork and what it costs. If a card needs a paragraph, the question isn't distilled yet.
- **Every card carries Problem, Question, and a Recommendation.** State the problem precisely, ask the one fork, and recommend the answer you would pick and why.
- **Stable IDs:** `Q1`, `Q2`, `Q3`, … so answers reference cards unambiguously.
- **Never end a recommendation with a "Reply X to accept / X &lt;custom&gt;" line.** The recommendation ends with the actual recommendation. The question cards are interactive (approve / disapprove + a custom answer per card) and auto-generate the reply shorthand via the Copy-answers button, so spelling out reply instructions is redundant noise.
- **Ask only genuine forks (hygiene law).** The grill never contains a question that is obvious or that you already have a high-confidence recommendation for. If the codebase, the evidence, an obvious default, or your own strong recommendation answers it — it is not a grill question: decide it yourself, record it in `:::decisions` as `[Decided] … (agent call, reversible)`, and move on. A card earns its place only when the author's taste, risk tolerance, or private context genuinely decides the answer. Fewer, sharper cards.

## Attention ordering (law)

Whatever the author must read or act on renders **at the very top** of the doc. While grill questions are open, the question stack is the FIRST thing on the doc's first tab — nothing above it but the shell header. Below the open questions: the decisions block, then content. Split long content into tabs when a section earns it, so the top of tab one always stays the author's action queue, not scroll-past material. When the last open card resolves, the decisions block inherits the top.

## Card shape

Render questions as sibling `qcard` articles inside one `qstack`, near the top of the doc's first tab:

```html
<div class="qreview" data-qstack>
  <div class="qstack">
    <article class="qcard" data-qid="Q1">
      … Problem / Question / Recommendation …
    </article>
    <article class="qcard" data-qid="Q2">…</article>
  </div>
</div>
```

Do not nest question cards inside one another — each is a sibling `qcard`. Do not preserve a Markdown `# Title` inside the body; the shell header owns the title. The engine emits this structure for you from `:::questions` blocks in the `.doc.md` source — author the questions, not the HTML.

## Start the answer gate — never make the author copy-paste

After posting questions, **start the gate** so answers come back live:

```bash
npx --yes github:aneym/how-to-work grill ask --doc <slug> --apply
```

Run it foreground when you can block, else background. It opens the ask so the doc's question section lights up ("the agent is waiting for your answers"), polls the gate, and — with `--apply` — writes the answers into every surface the instant the author clicks "Submit to agent" in the doc — no copy/paste, over loopback or a tunnel alike. Flags: `--no-wait` (open without blocking), `--stdin-fallback` (on connection-refused, print the questions and read structured shorthand from stdin, emitting the same `===HWQ-ANSWERS-BEGIN/END===` contract).

Gate behavior follows `answerGate.mode`:

- **`local`** — the engine's file-backed loopback store records submissions; starting the gate and then walking away strands the author's answers in the store unread, so always start it after posting. If answers were stranded, recover them via `GET <answerGate.base>/result?key=<docKey>` and proceed.
- **`custom`** — a host-private delivery overlay (an `onAnswer` callback the host wires up, e.g. a Hermes delivery); the public engine ships no such delivery, so this mode only does something where the host repo provides it. (`custom` is the engine enum value; the private Hermes delivery is the callback, not a public mode name.)
- **`none`** — copy-only: there is no server, so the **Copy-answers button is the equivalent** and the agent reads the pasted shorthand. In this mode the gate command is a safe no-op, not a bug — do not treat a missing live gate as an error.

## After the author answers

- **Answers pasted in chat (packet / shorthand / gate JSON) go through `npx --yes github:aneym/how-to-work grill resolve <slug>`** (stdin or `--file`). It writes the `answer:` fields into the `:::questions` records, appends `[Decided <date>]` rows to `:::decisions`, appends ledger events, bumps state, and re-renders — one command, every surface, nothing hand-edited.
- A custom or "idk" answer is **not** a close — fold the intent into a sharpened recommendation, present that one card again, and pick the minimal option that still makes the next action obvious. Re-grill until it is genuinely settled.
- Once settled, move the card into `:::decisions` (`[Decided <date>]`), drop it from the top queue, and append a ledger event.
- **Every surface updates in the same pass — via `grill resolve` / `stage set` / `ledger add`, not memory.** The doc must never still show `open` badges or stale next actions after an answer; `htw verify` fails stale or divergent surfaces. Feedback on a rendered surface edits the **source**, never the HTML.
