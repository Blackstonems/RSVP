# Kyle & Sandy 婚禮 RSVP — 規格書

> 最後更新：2026-06-15 ｜ 狀態：開發中
> ✅ Phase 1 表單 UI ｜ ✅ Phase 2 後端+資料庫+LINE 通知 ｜ ✅ Phase 3 全台郵遞區號(22縣市/371區) ｜ ✅ Phase 4 管理後台(/admin，統計/寄帖名單/CSV，密碼保護)
> ✅ Phase 5 PWA（manifest／service worker／可安裝／離線看資訊／K&S 圖示）
> ✅ Phase 6 視覺「海洋假期 Ocean」（海軍藍/海洋藍綠/細沙米/珊瑚粉），婚紗照主視覺 hero（壓縮為 1200×1800、365KB → public/hero.jpg）
> ✅ Phase 7 部署包就緒：Dockerfile、docker-compose.yml（app+cloudflared）、.env.deploy.example、DEPLOY.md；正式 runtime 已驗證。待在 NAS 上實際部署。

> 開發埠：前端 Vite `PORT`(預設 5173)、後端 `API_PORT`(預設 8787)；正式環境後端用 `PORT` 並同時服務前端。

## 1. 專案概述
- **網址**：`rsvp.blst.cc`（Cloudflare）
- **架設**：公司 Synology NAS → **Container Manager (Docker)**，單一容器
- **對外**：**Cloudflare Tunnel**（不開 port、不暴露 NAS IP、免費 TLS）
- **型態**：**PWA**（可加到主畫面、離線可看婚禮資訊、App 般動畫質感）
- **語言**：中文為主（保留之後加英文切換的彈性）
- **專案根目錄**：`D:\RSVP`

## 2. 婚禮資訊
- 新人：**Kyle & Sandy**
- 日期：**2026/08/01（六）**
- 證婚儀式：**17:30**
- 婚宴開始：**18:30**
- 地點：**台北萬豪酒店 8F Garden Villa**
- 地址：**台北市中山區樂群二路 199 號**

## 3. 技術棧
| 層 | 選用 | 理由 |
|---|---|---|
| 前端 | Vite + Svelte + Svelte transitions / GSAP | 體積小、載入快、動畫漂亮 |
| PWA | vite-plugin-pwa | manifest／service worker／離線快取 |
| 後端 | Node + Hono | 輕量 API，存報名資料 |
| 資料庫 | **node:sqlite**（Node 24 內建，免原生編譯）+ 掛載 volume | 自包、好備份、Docker 映像更精簡 |
| 郵遞區號 | 內建全台縣市/區/3 碼對照表（離線 JSON） | 不靠外部 API |

## 4. 表單流程與欄位

**頂部固定**：婚禮資訊卡 ＋ 即時「您的出席人數：X 位」（隨下拉跳動）。

1. **出席意願**：出席 ／ 不克參加
   - 不克參加 → 收合其餘，只留「姓名 + 想說的話 + 送出」
2. **身分**：我是（新郎 ／ 新娘）的（親友 ／ 同學 ／ 朋友 ／ 其他）
3. **出席人數**
   - ☐ 我會攜伴出席（不勾 = 1 位）
   - 勾選 → 出現出席人數下拉 **2～6** ＋ 對應數量姓名欄
   - 姓名欄 ①＝主要聯絡人（姓名・手機・Email 選填）
   - ②之後＝姓名 ＋ 關係標籤〔配偶／親友／其他〕
   - 人數變動 → 姓名欄平滑展開／收合、頂部人數即時更新；調少時保留已填名字並確認
4. **郵寄正式喜帖**：☐ 需要郵寄
   - 展開：收件人姓名・縣市(下拉)・區(下拉連動)・郵遞區號(自動帶入,可反查)・詳細地址
   - 縣市→篩區→選區帶郵遞區號；或輸入郵遞區號→帶縣市＋區
5. **素食**：☐ 需要素食餐
   - 素食人數（預設 1，最少 1，**上限 = 出席人數**）；不勾 = 0
6. **想對我們說的話**（選填）
7. **送出** → 確認頁（摘要、可回來修改提示、加入行事曆、地圖連結）

**決策備註**：不設兒童/嬰兒欄位（保持表單乾淨）；要帶 1–2 歲 baby 的賓客寫在留言即可。

## 5. 動態互動（與一般表單的差異）
逐題淡入、選項微動、姓名欄高度展開、頂部人數滾動、條件區塊滑順過場、送出後慶祝動畫、婚紗照背景視差。

## 6. 資料結構（SQLite `rsvp` 表）
`id, created_at, updated_at, attending, side(groom/bride), relation, party_size,
contact_name, contact_phone, contact_email, companions(JSON [{name, relation}]),
need_invitation, mail_recipient, mail_zip, mail_city, mail_district, mail_address,
vegetarian, vegetarian_count, message, edit_token`

## 7. 管理後台（`/admin`，密碼保護）
- 統計卡：總出席人數 / 出席組數 / 不克參加 / 素食總數 / 需郵寄喜帖數
- 全部回覆清單（搜尋、排序）
- 寄帖名單（篩出需郵寄者，方便列印標籤）
- CSV／Excel 匯出

## 8. 賓客連結
- **公開連結**（一個網址 + QR Code）
- 防呆：提交後可回來修改（存賓客手機本機）、手機號碼防重複

## 9. 部署架構
- 單一 Docker 容器：API + 靜態 PWA + SQLite volume
- `cloudflared` 容器做 Tunnel → `rsvp.blst.cc`
- 資料庫掛 NAS 目錄，方便備份

## 10. 開發階段
1. 專案骨架 + 表單 UI（含動畫，靜態可預覽）
2. 後端 API + SQLite + 送出/防重複/可修改
3. 郵遞區號連動・素食邏輯・驗證
4. 管理後台 + 匯出
5. PWA（manifest/SW/離線/可安裝）
6. 套用婚紗照 + 選定視覺概念
7. Docker 打包 + Cloudflare Tunnel 部署 + 測試

## 11. 開工前/部署前待確認
- 婚紗照放 `D:\RSVP\photos`（已有 1 張，建議多放幾張橫/直幅）
- Synology 型號（確認 Container Manager 已安裝）
- `blst.cc` 是否已在 Cloudflare 帳號下（建 Tunnel 用）
- 是否每筆 RSVP 即時通知（Email／LINE）？預設：只進後台、不通知
- 管理後台密碼（部署時設定）
