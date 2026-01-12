---
"wrangler": minor
"@cloudflare/workers-utils": patch
---

Automatically retry HTTP 429 rate limit responses from the Cloudflare API

When deploying multiple workers in sequence, the Cloudflare API may return HTTP 429 responses due to rate limiting. Previously, these would cause immediate deployment failures.

Now, all Cloudflare API requests automatically retry on:

- HTTP 429 (rate limit) with exponential backoff
- HTTP 5xx (server errors)
- Network failures

The retry behavior:

- Respects `Retry-After` headers when present
- Uses exponential backoff (1s, 2s, 4s...) with jitter
- Maximum 3 retry attempts
- Maximum 30 second delay between retries

A user-visible warning is displayed when rate limited:

```
Rate limited by Cloudflare API. Retrying in 5s (attempt 1/3)...
```
