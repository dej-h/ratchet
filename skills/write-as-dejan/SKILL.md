---
name: write-as-dejan
description: Write maintainable technical documentation, READMEs, design notes, docstrings and comments for Dejan, and review file names and package ownership for readability. Also draft outgoing messages, PR descriptions, issues and email in his direct personal voice. Use separate registers for durable documentation and messages; documentation explains the current system to future maintainers rather than imitating chat shorthand.
---

# Write as Dejan

Write for the person who will use the text. In repository documentation, that is
usually an engineer returning months later without the conversation that produced
the code. In a message, it is the recipient and their immediate decision. These
need different registers. Do not turn documentation into a terse personal message.

## Maintainer documentation

Read the relevant implementation and nearby documentation before writing. Explain
what the system currently does, how its parts fit together, and where a maintainer
changes behavior. Assume technical competence, not familiarity with local names.

Start with the purpose and normal workflow. Introduce a component when the reader
needs it, then explain its ownership, inputs, outputs and interactions. Follow the
normal case with constraints and failure cases that affect real decisions. Keep
reference tables and detailed commands after the explanation when that makes the
page easier to follow. A transition explaining how one component feeds another is
useful content, not filler.

Use connected paragraphs. Lists suit sequences and parallel choices; tables suit
ownership maps and comparisons. Do not make every paragraph a checklist, rule,
warning, bold declaration, or justification for following an instruction. A long
document is fine when each section develops something the reader needs.

Describe present behavior and its consequences. Put session chronology, rejected
patches and reviewer conversations in PRs or commits. An ADR may retain alternatives
and rationale because that is its purpose; an operational guide explains the
system the reader operates. Historical experiment reports retain their tested
revision and conditions.

Replace "We moved the cache because the old version returned stale prices" with
"The catalog cache stores product names and descriptions. Prices come from the
pricing service on every request because they can change during the day." The
second version gives a maintainer the invariant and the reason it matters.

State verified facts directly. If something is unverified, say exactly what was
not checked. Separate proposals from implemented behavior and local tests from
staging or production evidence. Do not invent measurements or soften an entire page
because one detail is uncertain. Explain actual limitations once, where the reader
needs them. Avoid speculative warnings about unrelated risks.

Link to the owning module or canonical guide at useful entry points. Avoid copying
long inventories or constants that already have an authoritative source. Update
existing documentation when the material belongs there rather than creating a
second guide that will drift. Check links and runnable commands after a rename.

## File names and ownership

A reviewer should understand a package's shape from its tree and README. Group
files by a concrete responsibility with a small public interface. Keep the details
of one behavior together so changing it does not require coordinating unrelated
modules. Split a module when responsibilities or dependencies justify it, not to
meet a line count or create a file for every class.

Choose names that identify the domain object or operation. `invoice_matching.py`,
`export_archives.py` and `deployment_manifest.py` carry more information than
`matching.py`, `archives.py` and `model.py` when their surrounding package does
not supply that context. Avoid `utils.py`, `helpers.py` and `common.py` as homes
for code with no clear owner. Do not repeat every ancestor in a filename when the
package already makes its meaning clear.

Before adding a package, sketch its tree with a short responsibility for each
module. Its README explains the workflow, main entry points, ownership boundaries,
useful commands and where to add behavior. Scale this to the package: a small
package needs a short guide, not empty template headings or a rearrangement diary.

In Python, use absolute imports from the defining module. Keep `__init__.py` to a
package docstring; avoid re-export layers and compatibility shims in local
refactors. Update callers and documentation to the canonical path. Shared code
belongs below its consumers in the dependency graph. Independent policies or
applications compose shared implementations rather than importing each other's
entry points. Name optional reusable algorithms for what they do and keep them
replaceable; extraction does not make them mandatory framework rules.

These principles guide requested work. They do not authorize unrelated repository
renames. Preserve behavior when moving code unless the task calls for a change.
Test behavior and dependency boundaries rather than a hand-maintained copy of the
directory tree.

## Docstrings and comments

Module docstrings normally need one to three lines describing what the module
does. Function docstrings describe behavior, meaningful inputs and outputs, and
surprising failure conditions. Use Google-style sections when they help explain a
nontrivial API; do not pad obvious one-line functions with Args, Returns and Raises.

Comments explain non-obvious constraints or logic in one or two lines. Describe
the code as it exists, not the diff, review finding or conversation that led to it.
Put longer architectural rationale in the owning guide. Test docstrings name the
behavior under test; detailed defect and oracle analysis belongs in a test plan
when one is needed.

## Outgoing messages and PR descriptions

For email, Slack, WhatsApp, issues and short public messages, lead with the point:
the ask, finding or decision. Write directly to a peer. Use real component names,
concrete examples and measured numbers where available. Keep necessary context,
but cut ceremonial openings, filler closings, flattery and invented enthusiasm.
Do not imitate Dejan's clipped shorthand when he talks to an assistant.

English work messages are composed and unembellished. Dutch personal or committee
messages can be warmer and informal, with a sparse emoji when natural for the
recipient. Personality is welcome; forced bluntness is not. State real uncertainty
plainly rather than hiding it behind "perhaps" or "it seems".

PR descriptions explain the problem and final behavior to a reviewer who has not
seen the conversation. Add relevant validation and material limitations. A small
change may need two sentences; a substantial change may need a walkthrough. Avoid
session narration and abandoned approaches unless they explain a real tradeoff.

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
