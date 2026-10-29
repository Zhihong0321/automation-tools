GMAP LOCAL WORKER
=================

Turns this Windows PC into a Google Maps scan worker for the EE Auto hub.
The hub hands it a Maps job (for example "business in Taman Daya"), the PC
searches Google Maps on its own internet line, and posts the businesses back.
The scans are free: they do not use the scraper.tech budget.

START
  1. Unzip this folder somewhere it can stay (for example C:\GmapWorker).
  2. Double-click "Start Gmap Worker.cmd". A window opens and shows what the
     worker is doing. If Windows asks whether to run the file, choose Run.
  3. Double-click "Enable autostart.cmd" so the worker starts by itself each
     time you sign in to Windows. "Disable autostart.cmd" undoes it.

The first start downloads the scraping engine from the hub (about 45 MB), and
the first job downloads a headless Chromium (about 150 MB). Both happen once.

NEEDS
  Windows 10 or 11, 64-bit. About 1.5 GB of free memory while a scan runs.
  Nothing to install: it uses Windows PowerShell, which Windows already has.

HOW IT WORKS
  The engine is gosom/google-maps-scraper (MIT licence,
  github.com/gosom/google-maps-scraper), built by the hub for Windows with one
  fix: Chromium's --single-process flag is used on Linux only, because it
  crashes Chromium on Windows (gosom issue #322). The fix is
  gosom-windows.patch in the hub's source.

  For each job the worker runs the hub's sweep: "<word> in <place>" for each
  word of the keyword's family, pinned to the place on the map, then, for a
  Business scan, "shop in <street>" and "company in <street>" for the streets
  it found. It stops at the hub's deadline and posts what it has.

  It keeps the PC awake only while a job runs. If it is switched off, the hub
  gives its jobs to its other workers.

SETTINGS (worker.env)
  LAB_URL            the hub
  GMAP_WORKER_KEY    this worker's key. It can only take Maps jobs.
  WORKER_NAME        optional; default pc-<computer name>
  GMAP_CONCURRENCY   optional; parallel searches, default 2. Each one adds
                     roughly 0.5 GB of memory.

FILES ON THIS PC
  %LOCALAPPDATA%\GmapWorker\worker.log   what the worker did
  %LOCALAPPDATA%\GmapWorker\runs\        the last few jobs' raw results
  %LOCALAPPDATA%\GmapWorker\unsaved\     results the hub could not take
