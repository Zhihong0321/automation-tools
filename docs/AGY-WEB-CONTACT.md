# Contact research worker

Contact research runs on the normal `research.contact` worker. The in-process cloud worker (`cloud-agy-contact-1`, job type `research.contact.cloud`) is removed. It called agy-web, and with no active account every report failed.

A leftover `CONTACT_RESEARCH_MODEL=agy-web` is treated as `research.contact`. The hub does not start a cloud contact worker and does not create `research.contact.cloud` jobs. Automatic queueing of untouched companies still stays off unless `AGY_WEB_AUTO_QUEUE=true`, and then it uses the normal research worker.
