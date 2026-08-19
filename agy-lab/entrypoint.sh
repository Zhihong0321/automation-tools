#!/bin/sh
# Start a display, then hand over to the app.
#
# Chrome runs headed here. Headless is a materially different fingerprint — a
# different user-agent, no window chrome, a documented set of behavioural tells —
# and ChatGPT sits behind bot detection that reads exactly those. Xvfb costs a few
# MB and removes the whole category of problem.
#
# -screen 0 1280x900x24 matches the viewport the remote-control UI assumes, so a
# click at (x, y) in the browser lands at (x, y) in the page.
set -e

if [ -z "$SKIP_XVFB" ]; then
  Xvfb :99 -screen 0 1280x900x24 -nolisten tcp -nolisten unix &
  # Wait for the socket rather than sleeping a fixed amount: on a cold Railway
  # container Xvfb can take longer than any number you would guess, and a Chrome
  # that launches one moment too early fails with a bare "Missing X server".
  i=0
  while [ ! -e /tmp/.X11-unix/X99 ] && [ "$i" -lt 100 ]; do
    i=$((i + 1))
    sleep 0.1
  done
  echo "[entrypoint] Xvfb on :99 after ${i} tenths"
fi

exec "$@"
