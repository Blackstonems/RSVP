import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import crypto from 'node:crypto'
import { createRsvp, updateRsvp, deleteRsvp, getByToken, getByPhone, getByLineUser, getById, setTableNo, checkInByLine, listAttendingLine, rowToPayload, listAll, stats, captureLineId, listLineIds, getSetting, setSetting } from './db.js'
import { notifyRsvp, lineConfigured, pushTo, buildGuestConfirmFlex, buildReminderFlex } from './notify.js'

const app = new Hono()
const isProd = process.env.NODE_ENV === 'production'

// 管理後台密碼：正式環境必須用 ADMIN_PASSWORD 設定；開發環境預設 'dev'
const ADMIN_PW = process.env.ADMIN_PASSWORD || (isProd ? '' : 'dev')

// 通知對象（新郎新娘）的 userId，用於「人數」指令的權限判斷
const COUPLE = (process.env.LINE_TO || '').split(',').map((s) => s.trim()).filter(Boolean)
// 賓客填表入口：有 LIFF 就用 LIFF（在 LINE 內開、可帶身分），否則用一般網址
const RSVP_URL = process.env.LIFF_ID ? `https://liff.line.me/${process.env.LIFF_ID}` : 'https://rsvp.blst.cc/'

async function lineReply(replyToken, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  }).catch(() => {})
}

function statsText() {
  const s = stats()
  return [
    '📊 目前 RSVP 統計',
    `・出席人數：${s.guests} 位`,
    `・出席組數：${s.partiesYes}`,
    `・婉謝：${s.partiesNo}`,
    `・素食：${s.veg} 位`,
    `・需寄喜帖：${s.invites}`,
    `・總回覆：${s.total} 筆`,
  ].join('\n')
}

function welcomeFlex() {
  return {
    type: 'flex',
    altText: 'Kyle & Sandy 婚禮邀請 — 點我回覆出席',
    contents: {
      type: 'bubble',
      hero: { type: 'image', url: 'https://rsvp.blst.cc/hero.jpg', size: 'full', aspectRatio: '2:3', aspectMode: 'cover' },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#fffdf9',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: 'Kyle & Sandy', weight: 'bold', size: 'xl', align: 'center', color: '#1f3a5f' },
          { type: 'text', text: '2026.08.01（六）· 台北萬豪酒店', size: 'sm', align: 'center', color: '#5f7384', wrap: true },
          { type: 'text', text: '誠摯邀請你出席我們的婚禮 ♡', size: 'sm', align: 'center', color: '#e8746a', wrap: true, margin: 'md' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'button', style: 'primary', color: '#2f7090', action: { type: 'uri', label: '填寫出席回覆', uri: RSVP_URL } }],
      },
    },
  }
}

// ── 功能 6：婚禮前提醒 ──
const REMINDER_DATE = process.env.REMINDER_DATE || '2026-07-30' // 台灣此日期起自動發送一次

async function sendReminders() {
  const guests = listAttendingLine()
  let sent = 0
  for (const g of guests) {
    const r = await pushTo(g.userId, [buildReminderFlex(g.name, g.tableNo)])
    if (r.ok) sent++
  }
  return { total: guests.length, sent }
}

const twDate = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)

async function maybeAutoRemind() {
  try {
    if (getSetting('reminder_sent') === '1') return
    if (twDate() < REMINDER_DATE) return
    const res = await sendReminders()
    setSetting('reminder_sent', '1')
    console.log('[reminder] auto-sent', JSON.stringify(res))
  } catch (e) {
    console.error('[reminder] auto error', e)
  }
}

// ── 桌次查詢開關（手動開/關，或婚禮前一天起自動開放）──
const SEATING_OPEN_DATE = process.env.SEATING_OPEN_DATE || '2026-07-31'
function tablesState() {
  const v = getSetting('tables_open') // '1'=開放, '0'=關閉, 其他=自動
  const mode = v === '1' ? 'on' : v === '0' ? 'off' : 'auto'
  const open = mode === 'on' ? true : mode === 'off' ? false : twDate() >= SEATING_OPEN_DATE
  return { open, mode }
}

function validate(d) {
  const e = []
  if (d.attending !== 'yes' && d.attending !== 'no') e.push('缺少出席狀態')
  const name = d.attendees?.[0]?.name?.trim()
  if (!name) e.push('請填寫姓名')
  if (d.attending === 'yes') {
    if (!d.side) e.push('請選擇新郎方或新娘方')
    if (!d.relation) e.push('請選擇你與新人的關係')
    if (!d.contactPhone?.trim()) e.push('請填寫聯絡手機')
    const n = d.partySize || 1
    for (let i = 1; i < n; i++) {
      if (!d.attendees?.[i]?.name?.trim()) e.push(`請填寫同行者 ${i} 的姓名`)
    }
    if (d.needInvite) {
      if (!d.mail?.recipient?.trim()) e.push('請填寫喜帖收件人姓名')
      if (!d.mail?.city) e.push('請選擇縣市')
      if (!d.mail?.district) e.push('請選擇鄉鎮市區')
      if (!d.mail?.address?.trim()) e.push('請填寫詳細地址')
    }
  }
  return e
}

app.get('/api/health', (c) => c.json({ ok: true, line: lineConfigured }))

// 前端啟動時取得 LIFF 設定 + 相簿連結
app.get('/api/config', (c) =>
  c.json({ liffId: process.env.LIFF_ID || null, albumUrl: process.env.ALBUM_URL || null, tablesOpen: tablesState().open }),
)

// 新增回覆（手機號碼相同則視為同一人，自動更新避免重複）
app.post('/api/rsvp', async (c) => {
  let d
  try {
    d = await c.req.json()
  } catch {
    return c.json({ ok: false, errors: ['資料格式錯誤'] }, 400)
  }
  const errors = validate(d)
  if (errors.length) return c.json({ ok: false, errors }, 400)

  const now = new Date().toISOString()
  // 優先用 LINE 身分對到既有回覆（在 LINE 內填表），否則用手機號碼
  const lineUid = d.lineUserId?.trim()
  let existing = lineUid ? getByLineUser(lineUid) : undefined
  if (!existing && d.contactPhone?.trim()) existing = getByPhone(d.contactPhone.trim())
  let token
  let updated = false
  if (existing) {
    token = existing.edit_token
    updateRsvp(token, d, now)
    updated = true
  } else {
    token = crypto.randomUUID()
    createRsvp(token, d, now)
  }

  notifyRsvp(d, updated).catch(() => {})
  // 功能 5：賓客本人收到確認卡（在 LINE 內填、有 userId 才發）
  if (lineUid) {
    const row = getByLineUser(lineUid)
    pushTo(lineUid, [buildGuestConfirmFlex(d, row?.table_no)]).catch(() => {})
  }
  return c.json({ ok: true, editToken: token, updated })
})

// 修改既有回覆
app.put('/api/rsvp/:token', async (c) => {
  const token = c.req.param('token')
  if (!getByToken(token)) return c.json({ ok: false, errors: ['找不到回覆紀錄'] }, 404)
  let d
  try {
    d = await c.req.json()
  } catch {
    return c.json({ ok: false, errors: ['資料格式錯誤'] }, 400)
  }
  const errors = validate(d)
  if (errors.length) return c.json({ ok: false, errors }, 400)

  const now = new Date().toISOString()
  updateRsvp(token, d, now)
  notifyRsvp(d, true).catch(() => {})
  return c.json({ ok: true, editToken: token, updated: true })
})

// 取回既有回覆（回訪時預填表單）
app.get('/api/rsvp/:token', (c) => {
  const row = getByToken(c.req.param('token'))
  if (!row) return c.json({ ok: false }, 404)
  return c.json({ ok: true, data: rowToPayload(row) })
})

// 以 LINE userId 取回（LIFF 在 LINE 內開啟時預填賓客自己的回覆）
app.get('/api/rsvp/by-line/:userId', (c) => {
  const row = getByLineUser(c.req.param('userId'))
  if (!row) return c.json({ ok: false }, 404)
  return c.json({ ok: true, data: rowToPayload(row) })
})

// ─── LINE webhook：歡迎卡、人數指令、擷取 userId ──
app.post('/api/line/webhook', async (c) => {
  let body
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }
  const now = new Date().toISOString()
  for (const ev of body.events || []) {
    const uid = ev.source?.userId
    if (uid) captureLineId(uid, now)
    if (!ev.replyToken) continue
    if (ev.type === 'follow') {
      lineReply(ev.replyToken, [welcomeFlex()]) // 新朋友加入 → 歡迎卡
    } else if (ev.type === 'message' && ev.message?.type === 'text') {
      const text = (ev.message.text || '').trim()
      if (COUPLE.includes(uid) && /人數|統計|報名|出席/.test(text)) {
        lineReply(ev.replyToken, [{ type: 'text', text: statsText() }]) // 指令查詢（限新人）
      } else if (/^(id|myid|userid)$/i.test(text)) {
        lineReply(ev.replyToken, [{ type: 'text', text: `你的 LINE userId：\n${uid}` }])
      } else {
        lineReply(ev.replyToken, [welcomeFlex()])
      }
    }
  }
  return c.json({ ok: true })
})

// ─── 管理後台 API（密碼保護） ──────────────────────────────
const adminAuth = async (c, next) => {
  if (!ADMIN_PW) return c.json({ ok: false, error: 'admin 尚未設定密碼' }, 503)
  const auth = c.req.header('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== ADMIN_PW) return c.json({ ok: false, error: '密碼錯誤' }, 401)
  await next()
}
app.use('/api/admin/*', adminAuth)

app.get('/api/admin/data', (c) => {
  const t = tablesState()
  return c.json({ ok: true, stats: stats(), rows: listAll().map(rowToPayload), tablesOpen: t.open, tablesMode: t.mode })
})

// 透過 LINE webhook 擷取到的 userId 清單（用來設定 LINE_TO）
app.get('/api/admin/line-ids', (c) => {
  return c.json({ ok: true, ids: listLineIds() })
})

// 功能 7：設定某筆回覆的桌號
app.post('/api/admin/table', async (c) => {
  let d
  try {
    d = await c.req.json()
  } catch {
    return c.json({ ok: false }, 400)
  }
  if (!d.id) return c.json({ ok: false }, 400)
  setTableNo(d.id, (d.tableNo ?? '').toString().trim())
  return c.json({ ok: true })
})

// 刪除某筆回覆
app.delete('/api/admin/rsvp/:id', (c) => {
  const ok = deleteRsvp(Number(c.req.param('id')))
  return c.json({ ok })
})

// 桌次查詢開關：on / off / auto
app.post('/api/admin/tables-open', async (c) => {
  let d
  try {
    d = await c.req.json()
  } catch {
    return c.json({ ok: false }, 400)
  }
  setSetting('tables_open', d.mode === 'on' ? '1' : d.mode === 'off' ? '0' : '')
  return c.json({ ok: true, ...tablesState() })
})

// 功能 6：手動發送婚禮前提醒給所有出席賓客
app.post('/api/admin/send-reminder', async (c) => {
  const res = await sendReminders()
  setSetting('reminder_sent', '1')
  return c.json({ ok: true, ...res })
})

function csvEscape(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

app.get('/api/admin/export.csv', (c) => {
  const head = [
    '建立時間', '出席', '身分', '關係', '人數', '主要聯絡人', '電話', 'Email',
    '同行者', '素食人數', '需寄帖', '收件人', '郵遞區號', '縣市', '區', '地址', '留言', 'LINE名稱',
  ]
  const lines = [head.join(',')]
  for (const r of listAll().map(rowToPayload)) {
    const comp = r.attendees.slice(1).map((a) => a.name + (a.relation ? `(${a.relation})` : '')).join('、')
    lines.push(
      [
        r.createdAt,
        r.attending === 'yes' ? '出席' : '不克參加',
        r.side === 'groom' ? '新郎' : r.side === 'bride' ? '新娘' : '',
        r.relation || '',
        r.attending === 'yes' ? r.partySize : 0,
        r.attendees[0]?.name || '',
        r.contactPhone,
        r.contactEmail,
        comp,
        r.isVeg ? r.vegCount : 0,
        r.needInvite ? '是' : '否',
        r.mail.recipient,
        r.mail.zip,
        r.mail.city,
        r.mail.district,
        r.mail.address,
        r.message,
        r.lineDisplayName,
      ].map(csvEscape).join(','),
    )
  }
  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', 'attachment; filename="rsvp.csv"')
  return c.body('﻿' + lines.join('\r\n'))
})

// 正式環境：由後端直接服務打包好的前端
if (isProd) {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

// 正式環境用 PORT（容器埠）；開發環境用 API_PORT，與 Vite 的 PORT 分開避免搶埠
const port = isProd ? Number(process.env.PORT) || 8787 : Number(process.env.API_PORT) || 8787
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`RSVP server on http://localhost:${info.port}  (LINE ${lineConfigured ? 'on' : 'off'})`)
})

// 每 6 小時檢查一次是否該自動發送婚禮前提醒（到 REMINDER_DATE 且尚未發過）
maybeAutoRemind()
setInterval(maybeAutoRemind, 6 * 3600 * 1000)
