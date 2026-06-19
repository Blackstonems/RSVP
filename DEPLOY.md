# 部署手冊 — Kyle & Sandy RSVP 上線到 rsvp.blst.cc

## 架構
- **rsvp-app**：一個容器，內含「打包好的前端 + API + SQLite」，對外開 `8080`（可用 `APP_PORT` 改）。
- **對外連線**：用你 NAS 上**現成的 Cloudflare Tunnel**，在它 Routes 新增 `rsvp.blst.cc` → `http://localhost:8080`，TLS 由 Cloudflare 提供。
- 資料庫檔在 NAS 的 `data/` 資料夾，方便備份。
- （若沒有現成 tunnel 才需要 docker-compose 內建的 cloudflared，見 compose 檔註解。）

---

## 前置準備
1. Synology 已安裝 **Container Manager**（DSM 7.2 以上）。
2. **blst.cc 已加入你的 Cloudflare 帳號**（DNS 由 Cloudflare 代管）。
3. 想好 **後台密碼**；（選填）準備好 **LINE long-lived token**。

---

## 步驟一　把專案放到 NAS
把整個 `D:\RSVP` 專案複製到 NAS 上的一個資料夾，例如 **`/volume1/docker/rsvp`**
（用 File Station 上傳，或透過你已掛載的網路磁碟複製）。

**可以不用複製這幾個資料夾**（會自動重建）：`node_modules`、`dist`、`data`。
要包含的關鍵檔：`Dockerfile`、`docker-compose.yml`、`.dockerignore`、`package.json`、`package-lock.json`、`index.html`、`vite.config.js`、`svelte.config.js`、`src/`、`server/`、`public/`。

---

## 步驟二　在現成的 Cloudflare Tunnel 新增路由
你 NAS 已有 tunnel（Routes 裡已有多個 `*.blst.cc`），直接加一條：
1. Cloudflare Zero Trust → 你的 Tunnel → **Routes（Published application routes）→ Add / Edit**
2. Subdomain：`rsvp`、Domain：`blst.cc`（→ Full hostname `rsvp.blst.cc`）
3. Path：留空
4. **Service URL：`http://localhost:8080`**（要和 app 對外埠一致；**不是 5173**）
5. Save changes（會自動建立 `rsvp.blst.cc` 的 DNS）

> 為何是 `http://localhost:8080`：你現成的 cloudflared 是以 `http://localhost:<埠>` 連到 NAS 上的服務（其他路由也是這樣）；我們的 app 容器會把 8080 開在 NAS 上。
> 若你的 cloudflared 是橋接網路、localhost 連不到，改用 NAS 區網 IP（例如 `http://192.168.x.x:8080`）。
> ⚠️ 這條路由要等**步驟四把 app 容器跑起來**後才會通。

---

## 步驟三　建立 .env
在 NAS 的 `/volume1/docker/rsvp` 裡，把 `.env.deploy.example` 複製成 **`.env`**，填入：
```
ADMIN_PASSWORD=你的強密碼
LINE_CHANNEL_ACCESS_TOKEN=（有就填，沒有先留空）
LINE_TO=你的 LINE userId（必填才會發送；可逗號分隔讓新郎新娘都收到。本系統不使用 broadcast）
APP_PORT=8080  # app 對外埠，要和步驟二 Service URL 的埠一致；被占用就改別的
```
（用現成 tunnel 不需要 `TUNNEL_TOKEN`。）

---

## 步驟四　在 Container Manager 建立專案
1. **Container Manager → 專案(Project) → 新增**
2. 專案名稱：`rsvp`；路徑：選 `/volume1/docker/rsvp`
3. 來源選「**使用現有的 docker-compose.yml**」→ 它會讀到我們的設定
4. 下一步 → 它會**自動 build 映像並啟動**（第一次 build 約數分鐘）
5. 完成後應看到 **rsvp-app** 與 **rsvp-tunnel** 兩個容器都在執行

> 若你的 DSM 在 Project 內 build 失敗，可改用 SSH：
> `cd /volume1/docker/rsvp && sudo docker compose up -d --build`

---

## 步驟五　驗證
1. 瀏覽器開 **https://rsvp.blst.cc** → 應看到婚禮頁與表單
2. 填一筆測試 → 送出 → 應出現確認頁（若已設 LINE，手機應收到通知）
3. 開 **https://rsvp.blst.cc/admin** → 用 `ADMIN_PASSWORD` 登入 → 看得到那筆
4. 測試完，若想清空測試資料：停止專案 → 刪掉 `data/rsvp.db*` → 再啟動（會重建空資料庫）

---

## 步驟六　啟用 LINE 通知（取得 userId）
上線後才能設定（需要公開網址）。
1. LINE Developers Console → **BLST channel → Messaging API 分頁 → Webhook settings**：
   - Webhook URL 填 **`https://rsvp.blst.cc/api/line/webhook`**
   - **Use webhook：開啟**（可按 Verify 測試，應回 Success）
2. LINE Official Account Manager（manager.line.biz）→ 該帳號 → **設定 → 回應設定**：
   - **開啟 Webhook**、**關閉「自動回應訊息」**（這樣機器人才會用我們的程式回覆）
3. 用手機把 **BLST** 官方帳號**加好友**（Messaging API 分頁有 QR Code）
4. 用 LINE **傳任意訊息**給 BLST → 它會**自動回你一則「你的 userId 是 Uxxx…」**
5. 把那串 `Uxxx…` 填進 NAS `.env` 的 **`LINE_TO`**（要新郎新娘都收到 → 兩個 userId 用逗號分隔）
6. 重啟 `rsvp-app` 容器 → 完成。之後每筆 RSVP 就會 push 到你 LINE。

> 備援：若自動回覆沒出現，登入後台用 `GET /api/admin/line-ids`（帶 `Authorization: Bearer <你的後台密碼>`）也能看到擷取到的 userId。

## 更新（之後改了內容要重新上線）
1. 把更新後的檔覆蓋到 `/volume1/docker/rsvp`
2. Container Manager → 專案 `rsvp` → **停止 → 重新建置(Build) → 啟動**
   （或 SSH：`sudo docker compose up -d --build`）

## 備份
- 要備份的就是 **`/volume1/docker/rsvp/data/`** 資料夾（裡面是 SQLite）。
- 建議用 **Hyper Backup** 排程備份這個資料夾；或婚禮前後手動複製一份。

## 疑難排解
- **開網站 502/連不上**：確認 `rsvp-app` 在跑、tunnel 的 Public Hostname 指到 `app:8080`、兩個容器同屬 `rsvp` 專案。
- **LINE 沒收到通知**：確認 `.env` 的 token 沒填錯、已用手機把官方帳號**加好友**；看 `rsvp-app` 容器 log。
- **log 出現 `ExperimentalWarning: SQLite`**：正常現象（node:sqlite 為實驗性但穩定），可忽略。
- **改了 LINE token**：更新 `.env` 後，重啟 `rsvp-app` 容器即可生效。
