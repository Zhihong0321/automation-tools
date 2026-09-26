# Contact research worker

Contact research does not use the removed cloud AGY account pool. A Gemini model id is not a chat-gateway model.

With `GEMINI37_API_KEY` set, the hub starts `gemini37-contact` and assigns contact jobs as `research.contact.gemini`. That worker is a contact-research worker: two Gemini searches in the hub process, first for public pages from the company name and address, then for the people, phones, and emails printed on those pages. It does not hand the job to local-worker. A leftover `CONTACT_RESEARCH_MODEL=agy-web`, or a Gemini model id, uses this worker. Without the key, contact jobs stay on a live `research.contact` worker.

`AGY_WEB_AUTO_QUEUE=true` queues companies that have never had a legacy contact report, and companies whose legacy contact reports all failed, while `research.contact.gemini` or `research.contact` is live. Completed and in-progress reports are left alone. The queue stays off for a leftover `agy-web` setting until that flag is true.
