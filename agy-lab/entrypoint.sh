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
  # Clear the stale lock BEFORE starting. Measured 2026-08-20: a Railway *restart*
  # (as opposed to a fresh deploy) keeps the container's writable layer, so
  # /tmp/.X99-lock and /tmp/.X11-unix/X99 survive from the previous boot. The lock
  # records the pid that held the display — pid 3, because pid assignment in this
  # container is deterministic (tini=1, this shell=2, Xvfb=3). On the next boot
  # Xvfb is handed pid 3 again, reads a lock naming a live pid 3, concludes the
  # display is already in use, and exits immediately. It then sits as a zombie
  # while every Chrome launch fails with "you launched a headed browser without
  # having a XServer running" — an error that names neither Xvfb nor the lock.
  #
  # Same failure shape as the Chrome SingletonLock cleanup in browser.ts: a lock
  # naming a pid from a previous life of the container.
  rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

  # -nolisten tcp only. NOT -nolisten unix: the UNIX socket at /tmp/.X11-unix/X99
  # is the only channel a local Chrome uses, so disabling it leaves Xvfb running
  # and unreachable. Chrome then exits instantly and Playwright reports "Target
  # page, context or browser has been closed" — which reads like a crash rather
  # than like a display nothing is able to connect to.
  Xvfb :99 -screen 0 1280x900x24 -nolisten tcp &
  XVFB_PID=$!
  # Wait for the socket rather than sleeping a fixed amount: on a cold Railway
  # container Xvfb can take longer than any number you would guess, and a Chrome
  # that launches one moment too early fails with a bare "Missing X server".
  i=0
  while [ ! -e /tmp/.X11-unix/X99 ] && [ "$i" -lt 100 ]; do
    i=$((i + 1))
    sleep 0.1
  done
  # The socket FILE existing is not proof the server is running — that is exactly
  # what fooled this check before, because a leftover socket from the previous
  # boot satisfied it while Xvfb was already dead. Check the process too.
  if [ -e /tmp/.X11-unix/X99 ] && kill -0 "$XVFB_PID" 2>/dev/null; then
    echo "[entrypoint] Xvfb ready on :99 (pid $XVFB_PID) after ${i} tenths"
  else
    # Loud, because every browser operation will fail and the error it produces
    # names neither Xvfb nor the display.
    echo "[entrypoint] WARNING: Xvfb is NOT running (socket=$([ -e /tmp/.X11-unix/X99 ] && echo yes || echo no), pid $XVFB_PID dead) - Chrome will not start"
  fi
fi

exec "$@"
