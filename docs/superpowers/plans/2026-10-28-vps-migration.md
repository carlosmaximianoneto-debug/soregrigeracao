# Só Refrigeração VPS Migration Implementation Plan

> For agentic workers: use subagent-driven-development for the independent runtime and image adapter tasks; root owns deployment and DNS.

**Goal:** Move sorefrigeracao.com from Netlify to an isolated Docker container on the existing Hostinger VPS, preserving all current routes, catalogue refresh, SEO fixes and aggregate click collection.

**Architecture:** Reuse the current Fetch API SEO and click handlers behind a bounded Node HTTP adapter. Serve only the built dist allowlist. The existing Caddy proxies the public domains to127.0.0.1:3190; no bot, database, admin service or existing container is restarted. Keep Netlify DNS/deploy references for rollback until the migration is verified.

**Tech Stack:** Node22, Docker Compose, existing Caddy, existing sanitized Supabase JSON and click Edge Function.

**Spec:** User request in this thread: create a container and complete the migration; preserve the production bots. Current main f59a390 includes the approved Product Offer and compact-card fixes.

## Global Constraints
- No PM2 mutations or Docker daemon restart; existing services remain intact.
- Container port8080; host bind127.0.0.1:3190 only. Site directory/srv/sorefrigeracao-site.
- Nonroot runtime, read-only filesystem, drop all capabilities, no-new-privileges, bounded CPU/memory/PIDs and logs.
- No service-role keys, SSH keys or auth sessions in image/build context/repository/static dist.
- Existing affiliate and WhatsApp links/tracking events must remain unchanged.
- Missing/dead products404; stale catalogue503; old/seo routes301; clean canonicals and sitemap preserved.
- DNS changes only for sorefrigeracao.com and www; retain mail and unrelated records.

## Review Focus
- Encoded traversal/symlink/source requests must never expose runtime files or credentials.
- Oversized, slow or unsupported click requests must fail before exhausting resources.
- Image adaptation must not become an open proxy/SSRF endpoint or unbounded transformer.
- The Git-managed invitation publisher must still reach the live site after future main commits.
- DNS propagation/TLS/canonical redirects must not route admin/bots to the new service.

### Task1: Node runtime and container
Files: server/http-server.mjs, server/main.mjs, Dockerfile, compose.yaml, .dockerignore, tests/vps-server.test.mjs.
- [ ] Add integration tests for static allowlist, methods, traversal, body limits, SEO routing, click adapter and health.
- [ ] Implement adapter reusing createSeoHandler and createSiteClickRelay, expose onlydist+health+known dynamic paths.
- [ ] Add hardened container config and check tests/build.

### Task2: Image/build portability
Files: server/image-handler.mjs, tests/vps-images.test.mjs, scripts/build-site.mjs, catalogue-images.js, package.json/lock if a pinned imaging dependency is needed.
- [ ] Preserve browser thumbnail contract while removing Netlify infrastructure dependency for VPS builds.
- [ ] Test host/path allowlist, request bounds, concurrency/cache bounds and content rejection.
- [ ] Add vps-production build mode with production metadata, snapshot refresh and provider setting; preserve existing Netlify behavior for rollback.

### Task3: Deployment and durable publishing
Files: deployment/vps scripts and local operations evidence.
- [ ] Snapshot only affected proxy/DNS configuration, record bot PIDs/uptimes and current containers.
- [ ] Build/start only the new container with runtime click credential sourced securely from existing server configuration.
- [ ] Validate local HTTP, catalogue, schema, images, click validation and health before domain changes.
- [ ] Provide guarded main-release synchronization so invitation commits continue publishing without Netlify credits.
- [ ] Add Caddy site blocks and TLS, change apex/www DNS, validatepublicHTTPSandredirects.

### Task4: Final verification and documentation
- [ ] Verify production UI mobile/desktop, Product rich results, sitemap, old301 anddead404.
- [ ] Verify aggregate click path and existing bots/admin unchanged.
- [ ] Record rollback, deployment ownership, resource limits and evidence in Obsidian.
- [ ] Submit sitemap/update Google only after production is serving the corrected version.

## Progress
- Read-only VPS audit: Docker+Caddy active;80/443ownedbyCaddy,3190free;6.2GiB availableRAM/89GiBfreedisk.
- Ruling: use existing Caddy instead of a second public proxy; it avoids port conflicts and only needs a graceful validated reload.
- User has explicitly authorized the migration and requested continuous execution. No new service purchase is authorized or required.
