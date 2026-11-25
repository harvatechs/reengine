FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /workspace
RUN addgroup -S reengine && adduser -S reengine -G reengine
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/bin ./bin
COPY --from=build /app/schemas ./schemas
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
USER reengine
ENTRYPOINT ["node", "/workspace/bin/reengine.js"]
