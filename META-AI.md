# Meta AI — the third engine, and the one thing that is different about it

`model: "meta"` drives meta.ai in a signed-in Chrome profile, exactly like the
ChatGPT engine. One difference matters, and it is structural:

> **The login cannot happen in the container. The session has to be minted on a
> residential connection and imported.**

Everything else — profiles, the mutex, the idle sweeper, ask/probe, the OpenAI
shape — is the machinery that was already here.

---

## What was measured, 2026-08-20

Same account, same sequence, two addresses.

**From the container** (egress `208.77.246.6`, AS400940 Railway, geolocating to
Singapore):

| Step | Result |
|---|---|
| `https://www.meta.ai/` signed out | loads normally, full chat UI, no bot check |
| click `[data-testid="login-button"]` | navigates to `auth.meta.com` (same tab) |
| "Continue with Facebook" | reaches `facebook.com/login.php` |
| email + password | **accepted** — no checkpoint, no 2FA, facebook.com stays signed in |
| the OIDC hop back to Meta AI | **"Meta AI isn't available in your region."** |

Reproduced twice, including with Facebook already signed in (where Meta shows a
"Join using your Meta Account" consent screen first — the refusal comes after
accepting it).

**From a residential connection in Malaysia:** the identical sequence signs in and
chats.

So the gate is on the **address the login comes from**. It is not the account, not
the credentials, not the browser, and not a bot check.

**And the gate is evaluated once.** The cookies minted at the residential IP were
exported, imported into the container, and answered a prompt from Singapore with
no region error:

```
> Reply with exactly two lines. Line 1: PING. Line 2: the capital of Malaysia.
PING
Kuala Lumpur
```

That asymmetry is the whole design. A proxy would also work and costs money every
month; this costs one local browser run.

---

## Signing in

On a machine on a residential connection, in the `eter-browser` project:

```bash
node scripts/meta-login.mjs --token <LAB_TOKEN> --email <fb-email> --password <fb-password>
```

It opens Chrome on a local profile, drives meta.ai → Continue with Facebook →
the Facebook form → the consent screen, exports the `storageState`, POSTs it to
`/api/cgpt/metaai/import` with `kind: "meta"`, and probes.

The local profile keeps the login, so **every run after the first needs no
password** — it re-exports and re-imports. Run it again whenever `/v1/models`
reports the meta session as anything but `ready`.

`POST /api/cgpt/<id>/login` refuses a meta session on purpose: a scripted login
from this container cannot end in a session, so accepting a password for one
would only trade a credential for a failure.

---

## Selectors, all read off the live page

Meta AI ships stable `data-testid`s — unlike ChatGPT, where the testid this
codebase inherited had been dead for months.

| Thing | Selector |
|---|---|
| signed in | `[data-testid="user-menu-button"]` |
| signed out | `[data-testid="login-button"]` |
| composer | `div[contenteditable="true"][role="textbox"]` |
| answer | `[data-testid="assistant-message"]` |

**The trap:** `[data-testid="composer-input"]` is a **zero-sized `<textarea>`
mirror**, not the editor. Filling it reads back correct and types into nothing.
The contenteditable beside it is what takes text.

**The other trap:** `locator.click()` times out after 20s on Meta's auth buttons
("Continue with Facebook", "Continue") though the element is visible, enabled, and
its own child sits at its centre. A viewport mouse click at the same point works
every time. `scripts/meta-login.mjs` clicks by bounding box for that reason —
do not "simplify" it back.

Entry is `insertText` then `Enter`, never `fill()` and never `keyboard.type` as
the primary path: Enter sends, so the first newline of a multi-line prompt would
submit half a question. The composer is read back to confirm the text landed.

---

## Differences from the ChatGPT engine

| | ChatGPT | Meta AI |
|---|---|---|
| signed-out composer | works, and answers anonymously — so it is a trap | opens a login modal, sends nothing |
| probe signal | a visible sign-in control outranks a live composer | account menu vs login button, genuinely two-sided |
| login | scripted in-container, email + password + TOTP | **import only** |
| fresh chat | `?temporary-chat=true` | `https://www.meta.ai/` |

A session is one site. `kind` on the session record is what keeps a meta profile
from being probed against chatgpt.com or published as `chatgpt:<id>`; records
written before the field existed are ChatGPT.
