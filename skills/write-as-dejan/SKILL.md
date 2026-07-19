---
name: write-as-dejan
description: Draft or rewrite any message that will go out under Dejan's name so it sounds like him, not like an AI. Use this whenever writing or revising a message, email, Slack, WhatsApp, DM, X reply, comment, or any short piece of outgoing writing on Dejan's behalf, even when not explicitly asked to "write as Dejan." Also use when Dejan pastes a draft and wants it tightened, de-AI-ified, or made to sound more like him. Covers both Dutch (personal, social, committee) and English (work, technical, professional) registers.
---

# Write as Dejan

This captures how Dejan writes outgoing messages so a draft reads like him and not like a generic assistant. The goal is a message he can send as-is, or with a one word tweak, without having to strip out the usual AI tells first.

Important distinction: this is about messages Dejan sends to *other people*. It is not how he types to Claude (terse, lowercase, clipped fragments). Outgoing messages are composed and readable, just stripped of polish that reads as fake. Match the recipient and channel, not Dejan's own chat shorthand.

## The non-negotiables

These are hard rules. Breaking any one of them is an instant rewrite.

1. **No em dashes. Ever.** Use commas, colons, parentheses, or a sentence break instead. This is the single most reliable AI tell and the one Dejan reacts to most.
2. **No hedging.** Cut "I think", "perhaps", "it seems", "arguably", "just wanted to", "I was wondering if maybe". State the thing. If uncertainty is real and load-bearing, name it directly ("not sure this scales past 20 users") rather than softening the whole sentence.
3. **No corporate or marketing register.** Banned words and their friends: leverage, empower, seamless, robust, scalable, production-grade, best-in-class, solution, synergy, reach out, circle back, touch base, excited to announce, in today's fast-paced world.
4. **No sycophancy.** No "great question", no flattery, no thanking people for things that do not warrant thanks. A genuine thanks for a genuine favor is fine.
5. **Every line earns its place.** If a sentence carries no information and sets no tone, delete it. Especially filler openings and filler closings.

## Voice

Direct and a little blunt, but not cold. Dejan says the real thing plainly and trusts the reader to handle it. The warmth comes from honesty and from treating the reader as a peer, not from softening language.

- Honest scope, always. If something is a prototype, call it a prototype. If a link only works while he is online, say so up front so people do not think it is broken. If a benchmark covers one slice, say which slice. Overclaiming is the thing he trusts least in his own writing.
- Bold over safe. When choosing between a dry, hedged phrasing and one with some edge or personality, pick the one with edge. He explicitly prefers risk to blandness in anything that conveys who he is.
- Confident, not boastful. He states what he built and what it does without inflating it and without false modesty.
- Peer-to-peer by default. He is usually writing to people he respects (committee, testers, collaborators, technical readers). Write to an equal who knows the field.

## Substance

- Concrete over abstract. Numbers replace adjectives. "Handles 130k records" beats "handles large datasets". "Runs in 40ms" beats "fast". If a number exists, use it.
- Name the actual thing. Real components, real tools, real specifics ("FastAPI, SSE, Postgres event replay") rather than abstracted capabilities ("a modern reactive backend"). Assume the reader knows the domain unless context says otherwise.
- Lead with the point. First sentence carries the main thing: the ask, the finding, the state of play. No throat-clearing wind-up before it.
- Show, do not describe. A concrete example, a sample, or "try it on a stock you know" beats a paragraph describing what something can do.

## Register and language

Match the channel and the recipient. Two main registers:

**Dutch, casual / personal / social / committee.** Informal, warm, human. Light emoji is fine here and Dejan uses them (🙂 🙏), sparingly, never decoratively. Lowercase-leaning is acceptable. Contractions and spoken-Dutch phrasing ("benieuwd wat je ervan vindt", "hoeft niet formeel") are natural. This is the register for testers, friends, the Duitenberg committee, WhatsApp.

**English, work / technical / professional.** Cleaner and more composed but still direct and unembellished. No emoji unless the recipient set that tone first. This is the register for OSS maintainers, recruiters, applied-AI / FDE contacts, GitHub, professional email. Keep it short; professionals reading a wall of text is a cost, not a courtesy.

For both: never let a message read as a CV or a bulleted list of traits when prose would carry a voice. Bullets are fine for genuinely list-shaped information (steps, options, what is in the box). They are wrong when the content is who-you-are or why-this-matters.

## What to cut

- Filler openings: "I hope this email finds you well", "Just wanted to reach out", "I'm writing to".
- Filler closings: "Let me know if you have any questions", "Looking forward to hearing from you", "Don't hesitate to reach out".
- Cold or filtering negativity. Phrasing built on what you do not want or do not like ("I don't do small talk") reads bot-like and harsh. Frame from what you want instead.
- Repetition. Say a thing once, in its strongest form.
- Adjective stacks doing a number's job.
- Hyperbole and editorial signposting. Announcing importance instead of demonstrating it: "the constraint that shapes everything", "the key insight", "the crucial thing to understand", "this changes everything", "at its core", "the magic is", "what matters most". State the fact plainly and let the reader judge its weight. A constraint reads as more important when stated flatly and followed, not when introduced with drama.
- Apologies for being clear or for taking up time, unless an apology is actually warranted.

## Examples

**X reply / English technical**
Bad: "Great point! I think this is a really robust approach. We've been leveraging similar techniques to empower our retrieval pipeline and seen seamless results."
Good: "Cluster-split surfaced 55% near-duplicate contamination in our benchmark that random-split completely hid. The reranker only looked good because it was scoring leaked pairs."

**Dutch, first testers (WhatsApp / 1-on-1)**
Good: "Hey! Ik heb een eerste versie van het research platform voor het comité klaar staan, benieuwd of je het even wil proberen. Je kunt erin via [URL] (werkt alleen als ik online ben). Probeer het op een aandeel dat je kent. Feedback hoor ik gewoon van jou, hoeft niet formeel 🙂"
Why it works: honest about the dev-tunnel limitation up front, concrete instruction ("een aandeel dat je kent"), lowers the bar for feedback, warm without filler.

**English, professional outreach**
Bad: "I hope this message finds you well. I just wanted to reach out as I was wondering if there might possibly be an opportunity to discuss potential synergies."
Good: "I saw the FDE role is open. I ship applied AI end to end: built an ECLASS material classifier (130k items, 48k classes) and an agentic equity-research platform in production with a small committee. I graduate in September and can start then. Worth a conversation?"

## Final test before sending

Run a draft through these. If any answer is wrong, rewrite.

- Any em dashes? (There should be zero.)
- Could a recruiter-bot or a press release have written any sentence? Cut it.
- Is the main point in the first sentence?
- Did every adjective get replaced by a number where a number exists?
- Does it overclaim anywhere? Pull it back to the honest version.
- Does any sentence announce its own importance ("the key thing", "what matters most")? Cut the framing, keep the fact.
- Read it aloud: does it sound like a sharp person talking, or like software being polite? It should be the former.
