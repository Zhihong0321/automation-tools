# agy-lab: install, authenticate and drive the Antigravity CLI and signed-in
# ChatGPT browser sessions inside a container.
#
# Lives at the repo root, not next to the app it builds. Railway's builder looks
# for a Dockerfile at the root of the build context and falls back to language
# autodetection when it finds none — which is how a Dockerfile one directory down
# gets silently ignored and the deploy fails claiming it cannot tell what the app
# is. Keeping it here means the service needs no Root Directory setting to work.
#
# agy is NOT installed at build time. It installs at runtime into $HOME/.local/bin,
# which is the Railway volume, for three reasons:
#   1. the credential the login produces lands under the same $HOME, so binary and
#      token share one persistence story instead of two;
#   2. `agy update` self-modifies the binary — on an image layer that either fails
#      or silently drifts from what the Dockerfile claims is installed;
#   3. this is a research harness. Re-running the installer must not cost a rebuild.
#
# Chrome IS installed at build time, because the opposite reasoning applies: it is
# 400MB nobody wants re-downloaded on every cold start, nothing here self-updates
# it, and the browser profiles that matter live on the volume separately from it.
FROM node:24-slim

# curl        - fetches the agy installer
# util-linux  - provides `script`, which is how we give agy a real TTY (see src/pty.ts)
# procps      - ps/kill, for looking at what agy actually spawns
# xvfb        - a display for headed Chrome. Headless is a different fingerprint and
#               a worse one; ChatGPT sits behind bot detection that reads it.
# fonts-*     - without CJK and emoji fonts a page renders as boxes, which makes
#               every screenshot of the login unreadable
# tini      - a real init. Without one, node is PID 1, and PID 1 must reap orphaned
#             children. Chrome spawns and kills subprocesses constantly; unreaped
#             they pile up as zombies (visible as chrome entries with RSS 0) until
#             the process table is exhausted and nothing can fork at all.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates util-linux procps git less gnupg xvfb tini \
      fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Real Google Chrome, not Chromium. patchright's stealth patches assume the real
# build, and these profiles are meant to be interchangeable with the ones the
# gmap-recon pipeline already runs on the desktop — where the vault enrolled them
# with channel "chrome". A profile whose browser build changes between machines is
# a fingerprint change, which is precisely what a bot check looks for.
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# HOME is the volume mount point. agy derives everything from it: the install path
# (~/.local/bin/agy), the app data dir (~/.gemini/antigravity-cli) holding settings,
# conversations and — with no D-Bus in a container — the credential store itself.
# Browser profiles go under $HOME/profiles for the same reason: one volume, one
# persistence story, and a redeploy that keeps every login it already had.
ENV HOME=/data \
    PATH=/data/.local/bin:/usr/local/bin:/usr/bin:/bin \
    NODE_ENV=production \
    DISPLAY=:99 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN mkdir -p /data

WORKDIR /app
COPY agy-lab/package.json ./
# patchright drives system Chrome through `channel`, so there is no browser binary
# to download — the npm package is the driver only. The skip flag states that
# rather than leaving a 300MB surprise in the build log.
RUN npm install --omit=dev --no-audit --no-fund
COPY agy-lab/src ./src
COPY agy-lab/entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8080
# tini reaps the zombies Chrome leaves behind and forwards signals, so SIGTERM on
# a redeploy still reaches the app and its browsers close cleanly.
ENTRYPOINT ["/usr/bin/tini", "--", "./entrypoint.sh"]
CMD ["node", "src/server.ts"]
