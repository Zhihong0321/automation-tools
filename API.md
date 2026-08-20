# The gateway — agy, ChatGPT and Meta AI as one API

Three engines behind one HTTP surface, in the OpenAI chat-completions shape, so a
tool that already talks to an LLM only has to change a base URL.

```
Base URL   https://ee-auto.up.railway.app/v1
API key    the LAB_TOKEN of this service
Models     agy | chatgpt | chatgpt:<session> | meta | meta:<session>
```

| Engine | What it actually is | Typical |
|---|---|---|
| `agy` | the Antigravity CLI, signed in with a Google account, run with `-p` | ~14s for a one-line answer |
| `chatgpt` | a signed-in ChatGPT session in a real Chrome, typed into and read back | ~15s for a short answer |
| `meta` | a signed-in meta.ai session in a real Chrome, same way | ~10s for a short answer |

Neither is a hosted API. Every call is a real CLI run or a real browser doing what
a person would do, and the limits at the bottom of this page follow from that.

---

## Call it

```bash
curl -s https://ee-auto.up.railway.app/v1/chat/completions \
  -H "Authorization: Bearer $LAB_TOKEN" -H 'content-type: application/json' \
  -d '{"model":"agy","messages":[{"role":"user","content":"Capital of Malaysia? One word."}]}'
```

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "agy",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Kuala Lumpur" }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 11, "completion_tokens": 4, "total_tokens": 15, "estimated": true },
  "agy_lab": { "engine": "agy", "ms": 13708 }
}
```

With the OpenAI SDK, unchanged:

```python
from openai import OpenAI
client = OpenAI(base_url="https://ee-auto.up.railway.app/v1", api_key=LAB_TOKEN)
client.chat.completions.create(model="chatgpt", messages=[{"role": "user", "content": "..."}])
```

```ts
const client = new OpenAI({ baseURL: 'https://ee-auto.up.railway.app/v1', apiKey: LAB_TOKEN });
await client.chat.completions.create({ model: 'agy', messages: [{ role: 'user', content: '...' }] });
```

Set the client's timeout to at least 3 minutes. A default of 60s will cut off
answers this thing can produce.

---

## The endpoints

| Call | Does |
|---|---|
| `POST /v1/chat/completions` | the OpenAI shape, `stream: true` supported |
| `GET /v1/models` | what this box can currently route to, and whether each is signed in |
| `POST /api/ask` | the native shape: `{model, prompt}` in, `{answer, ms}` out |

`/api/v1/chat/completions` is the same route, for a client that insists on
appending `/v1` to a base URL that already has it.

### Models

| Name | Routes to |
|---|---|
| `agy`, `antigravity` | the agy CLI |
| `chatgpt`, `openai` | the default ChatGPT session |
| `chatgpt:<id>` | that ChatGPT session by name — one per account |
| `gpt-4o`, `gpt-*`, `o1*` … | the default ChatGPT session |
| `meta`, `metaai`, `llama-*` | the default Meta AI session |
| `meta:<id>` | that Meta AI session by name |
| *(empty)*, `auto` | `DEFAULT_MODEL`, which is `agy` unless set |

`gpt-*` maps to ChatGPT because tools hard-code a model id far more often than
they let you pick one. The response always names the model that actually ran, so
the substitution is never silent: check `.model` and `.agy_lab.engine`.

The default ChatGPT session is `CGPT_DEFAULT_SESSION` if set, otherwise the first
session whose last probe said `ready`.

### The native shape

```bash
curl -s https://ee-auto.up.railway.app/api/ask \
  -H "Authorization: Bearer $LAB_TOKEN" -H 'content-type: application/json' \
  -d '{"model":"chatgpt","prompt":"...","timeoutMs":240000}'

{"model":"chatgpt:openai-waynecollins","engine":"chatgpt","answer":"...","ms":15389,"settled":true}
```

`settled: false` means the answer stopped growing because the clock ran out, not
because ChatGPT had finished — the text is real but partial. In the OpenAI shape
the same fact appears as `finish_reason: "length"`.

`tools: true` on either shape runs agy with `--dangerously-skip-permissions`, so
it can touch the filesystem inside the container. Off by default, per call, never
inherited.

---

## What the OpenAI shape promises and this cannot keep

- **Sampling parameters do nothing.** `temperature`, `top_p`, `max_tokens`, `seed`,
  `stop`, `response_format` — a browser session has no such knobs and agy's `-p`
  takes none. They are accepted, ignored, and listed back in `agy_lab.ignored` so
  a caller can see they had no effect rather than assume they worked.
- **Token counts are an estimate**, characters ÷ 4, marked `"estimated": true`.
  Neither engine reports real usage.
- **`n > 1` is refused**, not faked. Each call is one real model run.
- **No function calling, no logprobs, no image input.** An image part in a message
  is replaced with `[unsupported content part: image_url]` rather than dropped, so
  a prompt that depended on it fails visibly.
- **History is flattened into one prompt.** Neither engine takes a message array:
  system messages come first verbatim, then `User:` / `Assistant:` turns. A single
  user message is passed through unlabelled.
- **Every ChatGPT call is a new temporary chat.** There is no server-side
  conversation to continue — send the history you want considered.

Streaming is real for ChatGPT (the answer is polled as it renders, ~1.5s
granularity) and single-shot for agy, which prints only when it is done.

---

## Limits that will bite you

**One browser at a time.** `MAX_OPEN_BROWSERS=1`, LRU-evicted, closed after five
minutes idle. Concurrent ChatGPT calls serialise; a cold one also pays the Chrome
launch. agy runs up to `AGY_MAX_CONCURRENT` (2) at once. This is a pipeline
back-end, not a fan-out one.

**Answers are read from `innerText`.** A long fenced code block does not always
read back whole, and asking for one big JSON blob is the shape most likely to come
back truncated. Ask for line records instead.

**A Meta AI session cannot be re-logged-in from here.** meta.ai refuses a login
from this container's address — "Meta AI isn't available in your region" — while
the same account signs in fine from a residential connection, and a session minted
there replays from here without complaint. So the session is minted locally and
imported: `node scripts/meta-login.mjs --token $LAB_TOKEN` in the eter-browser
project. Full measurements in [META-AI.md](META-AI.md).

**A signed-out ChatGPT session is a 503, deliberately.** The logged-out page still
has a working composer, so a naive wrapper types into it and returns an anonymous
answer that looks fine and is worthless. The gateway checks for a sign-in wall and
refuses instead. Fix it with `POST /api/cgpt/:id/login`.

**Nothing re-logs-in on its own.** `GET /v1/models` reports each session's last
probe; a monitor that cares should probe and re-login rather than wait for a 503.

### Status codes

| Code | Means |
|---|---|
| 401 | bad or missing token |
| 404 | unknown model, or a session that does not exist |
| 400 | a request the gateway will not fake (`n>1`, empty messages) |
| 503 | the engine exists but is not signed in / not installed |
| 504 | the engine took longer than `timeoutMs` |
| 502 | the engine ran and failed — the message says how |

In a stream the status line is already sent, so a failure arrives as a final
`data: {"error":{...}}` chunk before `data: [DONE]`.

---

## Environment

| Variable | Default | |
|---|---|---|
| `LAB_TOKEN` | — | required; the API key for everything under `/api` and `/v1` |
| `DEFAULT_MODEL` | `agy` | what an empty or `auto` model resolves to |
| `CGPT_DEFAULT_SESSION` | first `ready` | which account a bare `chatgpt` means |
| `META_DEFAULT_SESSION` | first `ready` | which account a bare `meta` means |
| `META_ASK_TIMEOUT_MS` | `CGPT_ASK_TIMEOUT_MS` | |
| `AGY_ASK_TIMEOUT_MS` | 300000 | |
| `CGPT_ASK_TIMEOUT_MS` | 180000 | |
| `AGY_MAX_CONCURRENT` | 2 | agy runs in flight at once |
| `MAX_OPEN_BROWSERS` | 1 | Chrome profiles open at once |

The rest of the service — installing agy, driving a login, the DOM observation
layer — is in [agy-lab/README.md](agy-lab/README.md) and
[CHATGPT-PROGRESS.md](CHATGPT-PROGRESS.md).
