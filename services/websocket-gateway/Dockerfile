FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/api/package.json services/api/package.json
COPY services/websocket-gateway/package.json services/websocket-gateway/package.json
COPY lib/package.json lib/package.json
COPY shared/package.json shared/package.json
COPY types/package.json types/package.json
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/services ./services
COPY --from=deps /app/lib/package.json ./lib/package.json
COPY --from=deps /app/shared/package.json ./shared/package.json
COPY --from=deps /app/types/package.json ./types/package.json
COPY package.json package-lock.json ./
COPY services/websocket-gateway ./services/websocket-gateway
COPY lib ./lib
COPY shared ./shared
COPY types ./types
RUN npm run build --workspace=websocket-gateway

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/websocket-gateway ./services/websocket-gateway

WORKDIR /app/services/websocket-gateway
EXPOSE 4001
CMD ["node", "dist/services/websocket-gateway/src/server.js"]
