# Cloud AGY contact research

The contact research report runner can use the separate [agy-web API](https://agy.up.railway.app/docs) account pool. Set these variables on the **agy-lab** service:

```text
CONTACT_RESEARCH_MODEL=agy-web
AGY_WEB_TOKEN=<service bearer token>
AGY_WEB_URL=https://agy.up.railway.app
# Optional: AGY_WEB_AUTO_QUEUE=true
```

`AGY_WEB_URL` is optional; the URL above is the default. Keep the token in the deployment secret store. Do not put it in a tracked file.

Once configured, the cloud worker claims `research.contact.cloud` jobs whose report slots are saved before dispatch. It uses `POST /api/ensure-active` and `POST /api/prompt` with browsing tools and `sandbox:true`. On an auth or quota failure, the client rotates accounts and retries once. The report has no clock-based deadline; timeout results return to the queued state for another attempt. The existing parser and contact ledger handle completed answers. To work through untouched companies automatically, also set `AGY_WEB_AUTO_QUEUE=true`. The automatic queue admits up to three reports at a time.

For a live check, first request one company from the existing contact research report UI and verify its report reaches `completed` with cited decision makers or contact routes. If sources expose no such information, an empty but valid ledger is an acceptable research outcome.
