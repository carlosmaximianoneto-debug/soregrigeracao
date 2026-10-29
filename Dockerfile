# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY index.html site-clicks.js styles.css mobile-refinements.css carousel.css floating-join.css seo-pages.css ./
COPY blog-clicks.js blog.css ./
COPY catalogue.js categories.js catalogue-images.js carousel.js site-identity.mjs ./
COPY privacidade/index.html ./privacidade/index.html
COPY assets/produto_149.jpg assets/produto_263.jpg assets/produto_1980.jpg assets/produto_2164.jpg ./assets/
COPY assets/favicon.svg assets/favicon.ico assets/apple-touch-icon.png assets/icon-192.png assets/icon-512.png assets/compartilhamento.png ./assets/
COPY scripts/build-site.mjs ./scripts/build-site.mjs
RUN CONTEXT=vps-production npm run build

FROM node:22-bookworm-slim@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2 AS runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/netlify/generated/catalogue-config.mjs ./netlify/generated/catalogue-config.mjs
COPY --chown=node:node package.json seo-runtime.mjs seo-netlify-function.mjs site-identity.mjs site-click-handler.mjs ./
COPY --chown=node:node blog-runtime.mjs blog-click-handler.mjs ./
COPY --chown=node:node blog/articles-a.mjs blog/articles-b.mjs ./blog/
COPY --chown=node:node operations/blog-clicks/handler.mjs ./operations/blog-clicks/handler.mjs
COPY --chown=node:node operations/clicks/handler.mjs ./operations/clicks/handler.mjs
COPY --chown=node:node server/http-server.mjs server/main.mjs server/image-handler.mjs ./server/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD ["node", "--input-type=module", "-e", "const r=await fetch('http://127.0.0.1:8080/healthz',{signal:AbortSignal.timeout(2000)});process.exit(r.ok?0:1)"]
CMD ["node", "server/main.mjs"]
