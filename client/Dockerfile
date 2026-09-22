FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
# scripts/copy-tree-sitter-wasm.mjs runs as postinstall — it must exist
# before `npm ci` fires, so it's copied here rather than waiting for the
# full `COPY . .` below (which would run after install already failed).
COPY scripts ./scripts
RUN npm ci
COPY . .
ENV VITE_API_URL=""
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
