# agy-lab: install, authenticate and drive the Antigravity CLI inside a container.
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
FROM node:24-slim

# curl        - fetches the official installer
# util-linux  - provides `script`, which is how we give agy a real TTY (see src/pty.ts)
# procps      - ps/kill, for looking at what agy actually spawns
# ca-certificates, git, less - agy's own runtime expectations
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates util-linux procps git less \
    && rm -rf /var/lib/apt/lists/*

# HOME is the volume mount point. agy derives everything from it: the install path
# (~/.local/bin/agy), the app data dir (~/.gemini/antigravity-cli) holding settings,
# conversations and — with no D-Bus in a container — the credential store itself.
# One volume at /data therefore persists the whole installation across redeploys.
ENV HOME=/data \
    PATH=/data/.local/bin:/usr/local/bin:/usr/bin:/bin \
    NODE_ENV=production
RUN mkdir -p /data

WORKDIR /app
COPY agy-lab/package.json ./
COPY agy-lab/src ./src

EXPOSE 8080
CMD ["node", "src/server.ts"]
