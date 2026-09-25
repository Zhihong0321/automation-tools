# Contact research worker

Contact research runs on the normal `research.contact` worker. The in-process cloud worker (`cloud-agy-contact-1`, job type `research.contact.cloud`) is removed. It called agy-web, and with no active account every report failed.

A leftover `CONTACT_RESEARCH_MODEL=agy-web` is treated as `research.contact` unless `GEMINI37_API_KEY` is set. With that key, the hub starts `gemini37-contact` and assigns contact jobs as `research.contact.gemini`. That worker runs two Gemini 3.7 searches in the hub process. It does not call agy-web and it does not hand the job to local-worker. Automatic queueing of untouched companies still stays off for `agy-web` unless `AGY_WEB_AUTO_QUEUE=true`.
