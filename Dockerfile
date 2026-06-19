# ---------- build 階段：安裝全部相依、打包前端 ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- runtime 階段：只留正式相依 + 後端 + 打包好的前端 ----------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 8080
# node:sqlite 為 Node 24 內建，無需原生編譯
CMD ["node", "server/index.js"]
