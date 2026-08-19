# agy-lab: install, authenticate and drive the Antigravity CLI inside a container.
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
COPY package.json ./
COPY src ./src

EXPOSE 8080
CMD ["node", "src/server.ts"]
