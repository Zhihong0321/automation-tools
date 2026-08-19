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
  # -nolisten tcp only. NOT -nolisten unix: the UNIX socket at /tmp/.X11-unix/X99
  # is the only channel a local Chrome uses, so disabling it leaves Xvfb running
  # and unreachable. Chrome then exits instantly and Playwright reports "Target
  # page, context or browser has been closed" — which reads like a crash rather
  # than like a display nothing is able to connect to.
  Xvfb :99 -screen 0 1280x900x24 -nolisten tcp &
  # Wait for the socket rather than sleeping a fixed amount: on a cold Railway
  # container Xvfb can take longer than any number you would guess, and a Chrome
  # that launches one moment too early fails with a bare "Missing X server".
  i=0
  while [ ! -e /tmp/.X11-unix/X99 ] && [ "$i" -lt 100 ]; do
    i=$((i + 1))
    sleep 0.1
  done
  if [ -e /tmp/.X11-unix/X99 ]; then
    echo "[entrypoint] Xvfb ready on :99 after ${i} tenths"
  else
    # Loud, because every browser operation will fail and the error it produces
    # names neither Xvfb nor the display.
    echo "[entrypoint] WARNING: no X socket at /tmp/.X11-unix/X99 after 10s - Chrome will not start"
  fi
fi

exec "$@"
