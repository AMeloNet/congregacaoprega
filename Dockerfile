FROM node:24.21.0-alpine3.24@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 AS build
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build && cp -R apps/web/dist apps/api/dist/public

FROM node:24.21.0-alpine3.24@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api ./apps/api
COPY --from=build --chown=node:node /app/packages/database ./packages/database
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
