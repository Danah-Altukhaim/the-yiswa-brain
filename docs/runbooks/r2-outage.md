# Cloudflare R2 Outage

## Symptoms
- `POST /api/v1/media/upload` and `/voice/transcribe` fail with S3 errors.
- Image URLs in preview cards 404.

## Triage
1. Check Cloudflare status page.
2. Grep logs for `NoSuchBucket` / `AccessDenied`; may indicate creds rotated, not outage.

## Mitigation
- Flip `MEDIA_UPLOADS_DISABLED=true` env var; web surfaces a banner.
- Voice: queue audio in Redis (key `voice:queue:{tenantId}`); transcribe + upload on recovery.
- `/api/v1/knowledge-base` is unaffected; media IDs return even if URLs can't be presigned.

## Root-cause fix
- Rotate creds if 403. Clear env + redeploy.
- If upstream outage: wait, then drain voice queue.
