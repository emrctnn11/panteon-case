---
name: wtf-log
description: >-
  Records an AI-workflow moment into docs/ai-workflow.md — what just happened, which
  suggestion was rejected and why, and what replaced it. Use right after you reject or
  correct a suggestion, catch a problem the user missed, choose between real
  alternatives, or make a product/budget call; or when the user says "wtf-log", "log
  this", "workflow'a ekle". Feeds README §5, which is graded and cannot be reconstructed later.
---

# wtf-log

Append one short, dated entry to `docs/ai-workflow.md`. This log feeds README §5 (a
graded criterion) and must be written **while the work happens** — it cannot be
reconstructed afterwards, so its only value is that it is true.

## Steps

1. **Ensure the file exists.** If `docs/ai-workflow.md` is missing, create it (and the
   `docs/` directory) with a minimal header, e.g.:

   ```markdown
   # AI workflow log

   Chronological record of AI-assisted development moments. Feeds README §5.
   Newest entries on top. Dated, factual, 2–3 lines each — no embellishment.
   ```

2. **Reconstruct the moment from the recent conversation.** Capture, concretely:
   - **what just happened** (the situation / trigger),
   - **which suggestion was rejected or corrected, and why it was wrong**,
   - **what replaced it**.

   If any of these is genuinely unclear from context, ask the user **one** short
   question rather than guessing — an invented entry defeats the purpose.

3. **Classify the trigger** (per `CLAUDE.md` "Append an entry whenever"): reject/correct
   a suggestion · flagged a problem the user hadn't considered · chose between real
   alternatives · a product/budget call rather than a technical one. Let the wording make
   the type obvious.

4. **Write the entry** at the **top** of the list (newest first), matching CLAUDE.md's
   format: **today's date, 2–3 lines, factual, no embellishment.** Example shape:

   ```markdown
   ## 2026-07-25
   Proposed X. Rejected: <one-line reason it was wrong>. Replaced with Y.
   ```

5. **Append only.** Never rewrite, reorder, or delete existing entries.

## Rules

- **Always write entries in English**, regardless of the conversation language. This log
  feeds README §5 and is read by reviewers in English.
- Keep it to two or three lines. This document is read by someone who can ask follow-up
  questions, so every claim must be defensible.
- Use the actual current date. Convert any relative date ("today", "yesterday") to an
  absolute one.
- Facts only — no marketing tone, no filler.
