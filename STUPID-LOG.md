# STUPID LOG

A record of failures caused by **guessing instead of observing**, kept so the same
failure is not repeated. Each entry states what was guessed, what one measurement
would have shown, and what it cost the person paying for it.

---

## 2026-08-19 — ChatGPT login selectors

### What happened

Four rounds of selectors were written from memory, shipped to production, and
allowed to fail in front of the user:

| Round | What I wrote | What was true |
|---|---|---|
| 1 | `[data-testid="login-button"]` | **0 matches.** The attribute does not exist on the page. |
| 2 | `button:has-text("Log in")` | **8 matches** — wrappers, not the button. |
| 3 | `getByRole('button', { name: /^log ?in$/i })` | 2 matches — correct, but **consulted too early and sampled once** |
| 4 | `input[name="email"]` | **0 matches.** The field is `name="login_hint"`. |

Each round: guess → push → Railway rebuild (several minutes) → user clicks → same
failure with a slightly different message.

The final cause was not even a wrong selector. `SIGNALS` walks the raw DOM;
`getByRole` reads the accessibility tree, which lags behind it. The detector saw a
visible "Log in" before `getByRole` could, the clicker sampled `getByRole` exactly
once, got `0`, and gave up in 1797ms. **A guess cannot find that. Only a
measurement can**, because the bug lives in the gap between two mechanisms, and
you cannot reason your way to a gap you do not know exists.

### The lie in the middle of it

Between rounds 3 and 4, I ran a "verification" and reported **PASS**. It launched
its own fresh Chrome, with its own launch args, on a throwaway profile. Production
uses the server's `browser.acquire()` on the real profile with different args.

So the test passed while production failed, and I reported the pass as proof.
That is worse than the original guessing: guessing produces broken code,
mis-scoped verification produces **broken code plus false confidence**, and the
user is the one who discovers the difference.

**A local pass is not evidence about production.**

### What one measurement gave

One request to a debug endpoint returned every clickable element on the real page
with its text, testid, aria-label, role, visibility, `aria-hidden`/`inert` state,
plus live counts for every candidate selector. It showed in a single call:

- 12 elements whose text is "Log in"; only **3** visible
- `data-testid="login-button"`: **0** — dead, everywhere, including in
  `gmap-recon/session-monitor/src/probe-chatgpt.ts` where I copied it from
- the email field is `name="login_hint"` / `id="mobile-auth-email"`
- signing in opens a **modal**; the URL never changes, so the code that waited
  20s for a navigation was waiting for something that would never happen
- the modal offers "Continue with Google / Apple / phone" beside "Continue", so a
  substring match on "Continue" would have clicked an SSO provider

It also **killed my own next hypothesis**: I was about to blame `aria-hidden`.
Measurement showed `ariaHidden: false` on every one of them. Had I not measured, I
would have shipped round 5 of the same mistake.

### Why guessing is not a coding skill

**A guess is a claim about a system I have not looked at.** Its correctness is not
a function of skill — it is a function of whether reality happens to match my
memory. No amount of ability makes an unobserved fact true. Being good at
programming does not make `data-testid="login-button"` exist.

**Skill applies to the parts I control.** Structure, error handling, locking,
naming, what happens when a step fails. Skill does not apply to what a third party
put in their HTML this week. Treating "I am usually right about markup" as
expertise is a category error: it is a claim about *my* memory being current with
*their* deploys.

**A guess that works teaches nothing.** At the moment it passes, a lucky guess and
a correct one are indistinguishable. So the codebase accumulates selectors nobody
ever verified, and they rot silently — which is exactly what happened to
`probe-chatgpt.ts`, where the dead selector sat unnoticed because the racing logic
around it happened to return an answer anyway.

**The costs are asymmetric, and that is why the bias survives.** Measuring costs
one request, once, and the cost is known in advance. Guessing costs a rebuild, a
deploy, a user's attention, and a round of tokens — repeated an unknown number of
times, and **paid by the user, not by me**. From where I sit "just try it" always
looks cheap, because I am not the one holding the bill. That is not a
justification, it is the mechanism, and naming it is the only way to stop
defaulting to it.

**It also destroys the debugging signal.** With four unverified assumptions in
play, a failure cannot be localised — every round I fixed a plausible cause and
the symptom persisted, because the real cause was never on my list. Observation
first collapses the search space before the first line is written.

### What was available the entire time

Nothing was blocked. Nothing needed permission. Nothing needed the user's
password.

- shell in the container (`/api/exec`)
- patchright and real Chrome, already installed
- the ability to add a debug endpoint and read the live DOM
- the whole flow up to the email field is reachable **without any credentials**

This was not a capability gap. It was a discipline gap. I chose to write the
implementation layer first and treat observation as optional overhead.

### The rule

**Build the observation layer before the implementation layer, on production.**

1. Add a debug endpoint to the deployed app — not an ad-hoc local script.
2. Dump what the **prod server** sees, through the server's own code path and real
   state.
3. Request it several times, at several ages, to confirm the shape is stable and
   not a one-off.
4. Only then write the implementation, against what was measured.
5. Verify each step through that same endpoint before calling it done.

It costs one deploy. It turns every later question into one API call instead of a
rebuild plus a user's click, so it pays for itself on iteration two and compounds
after that. In this session it would have replaced roughly five deploys, several
hours, and every message in which the user had to tell me the button was plainly
on the screen.

### Rule of thumb

> If I am about to write code against a shape I have not observed — a DOM, an API
> response, a file format, a third party's behaviour — **stop and observe it
> first.** And never write "verified" unless the check ran through the deployed
> server's own code path.
