---
name: writing-house-style
description: House style for maintainable technical documentation (READMEs, guides, ADRs, design notes, docstrings, comments, file and package naming) and outgoing messages (PR descriptions, issues, review comments, email, Slack, WhatsApp). Use whenever writing or revising either; the skill routes to the documentation or the message register so durable docs explain the current system instead of reading like a terse message.
---

# Writing house style

Write for the person who will use the text. In repository documentation, that is
usually an engineer returning months later without the conversation that produced
the code. In a message, it is the recipient and their immediate decision. These
need different registers, kept in separate references.

## Choose the register

Read only the reference for the text you are writing now.

| Writing | Read |
|---------|------|
| READMEs, guides, ADRs, design notes, docstrings, comments, file and package names | [documentation.md](references/documentation.md) |
| PR descriptions, issues, review comments, email, Slack, WhatsApp | [messages.md](references/messages.md) |

A task that produces both, such as a change with a README update and a PR
description, reads each reference when it writes that piece. Do not carry one
register's habits into the other: documentation is not a terse message, and a
message is not a guide.

## Editing pass

Read for understanding before checking style. Can the reader follow the normal
workflow, find the code that owns a behavior, and tell what was actually verified?
Does each section build on the previous one? Remove repeated claims and replace
abstract adjectives with concrete information without deleting the explanations
that connect the facts.

Use plain language. Avoid em dashes, corporate phrasing, adjective stacks and
announcements such as "the key insight" or "this changes everything". Do not force
sentences into a pattern merely to demonstrate compliance with these instructions.
The result should read like useful documentation or a human message, not a writing
checklist.
