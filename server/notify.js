// LINE 通知（LINE Messaging API；LINE Notify 已於 2025-03-31 停用）
// ⚠️ 只用 push / multicast 推給「指定的人」，刻意不使用 broadcast，
//    以免誤發給官方帳號的所有好友（例如公司 OA 的全部顧客）。
//   - 需同時設定 LINE_CHANNEL_ACCESS_TOKEN 與 LINE_TO 才會發送，否則自動略過（不影響送出）。
//   - LINE_TO 可填多個 userId 以逗號分隔（例如新郎、新娘都收到）。

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
const RECIPIENTS = (process.env.LINE_TO || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const lineConfigured = !!(TOKEN && RECIPIENTS.length)

// 推給設定好的通知對象（新郎/新娘）。messages 為 LINE 訊息物件陣列。
async function send(messages) {
  if (!TOKEN || !RECIPIENTS.length) return { skipped: true }
  const single = RECIPIENTS.length === 1
  const url = single
    ? 'https://api.line.me/v2/bot/message/push'
    : 'https://api.line.me/v2/bot/message/multicast'
  const body = single ? { to: RECIPIENTS[0], messages } : { to: RECIPIENTS, messages }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[LINE] send failed', res.status, detail)
      return { ok: false, status: res.status }
    }
    return { ok: true }
  } catch (err) {
    console.error('[LINE] error', err)
    return { ok: false, error: String(err) }
  }
}

export const notifyLine = (text) => send([{ type: 'text', text }])

// ── 發給「特定賓客」用（功能 5 確認卡 / 6 提醒）──
const LIFF_URL = process.env.LIFF_ID ? `https://liff.line.me/${process.env.LIFF_ID}` : 'https://rsvp.blst.cc/'
export const guestPushEnabled = !!TOKEN

async function lineApi(url, body) {
  if (!TOKEN) return { ok: false, skipped: true }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      console.error('[LINE] api fail', res.status, t.slice(0, 160))
      return { ok: false, status: res.status }
    }
    return { ok: true }
  } catch (e) {
    console.error('[LINE] api err', e)
    return { ok: false }
  }
}

export const pushTo = (userId, messages) =>
  lineApi('https://api.line.me/v2/bot/message/push', { to: userId, messages })

// multicast 一次最多 500 人，超過自動分批
export async function multicastTo(userIds, messages) {
  if (!TOKEN || !userIds?.length) return { sent: 0 }
  let sent = 0
  for (let i = 0; i < userIds.length; i += 500) {
    const batch = userIds.slice(i, i + 500)
    const r = await lineApi('https://api.line.me/v2/bot/message/multicast', { to: batch, messages })
    if (r.ok) sent += batch.length
  }
  return { sent }
}

const SIDE = { groom: '新郎', bride: '新娘' }

export function buildNotifyText(d, isUpdate) {
  const name = d.attendees?.[0]?.name || '(未填名)'
  if (d.attending === 'no') {
    return ['💌 RSVP（婉謝出席）', `姓名：${name}`, d.message ? `留言：${d.message}` : null]
      .filter(Boolean)
      .join('\n')
  }
  const companions = (d.attendees || [])
    .slice(1)
    .map((a) => a.name)
    .filter(Boolean)
    .join('、')
  return [
    `💍 新的 RSVP${isUpdate ? '（更新）' : ''}`,
    `姓名：${name}（${SIDE[d.side] || ''}的${d.relation || ''}）`,
    `出席：${d.partySize || 1} 位${companions ? `（同行：${companions}）` : ''}`,
    d.isVeg ? `素食：${d.vegCount} 位` : null,
    d.needInvite
      ? `寄帖：${d.mail?.zip || ''} ${d.mail?.city || ''}${d.mail?.district || ''}${d.mail?.address || ''}（收件：${d.mail?.recipient || ''}）`
      : '寄帖：不需要',
    d.contactPhone ? `電話：${d.contactPhone}` : null,
    d.message ? `留言：${d.message}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

// ── Flex 卡片版通知（給新郎新娘）──
const ACCENT = '#1f3a5f'
const TEAL = '#2f7090'

function infoRow(label, value, opts = {}) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: '#5f7384', size: 'sm', flex: 2 },
      { type: 'text', text: value, color: opts.color || '#22303f', size: 'sm', flex: 5, wrap: true, weight: opts.weight || 'regular' },
    ],
  }
}

export function buildRsvpFlex(d, isUpdate) {
  const name = d.attendees?.[0]?.name || '(未填名)'
  const decline = d.attending === 'no'
  const rows = []
  if (decline) {
    rows.push(infoRow('姓名', name, { weight: 'bold' }))
    if (d.message) rows.push(infoRow('留言', d.message))
  } else {
    const companions = (d.attendees || []).slice(1).map((a) => a.name).filter(Boolean).join('、')
    rows.push(infoRow('姓名', `${name}（${SIDE[d.side] || ''}的${d.relation || ''}）`, { weight: 'bold' }))
    rows.push(infoRow('出席', `${d.partySize || 1} 位${companions ? `　同行：${companions}` : ''}`, { color: TEAL, weight: 'bold' }))
    if (d.isVeg) rows.push(infoRow('素食', `${d.vegCount} 位`))
    rows.push(
      infoRow(
        '寄帖',
        d.needInvite
          ? `${d.mail?.zip || ''} ${d.mail?.city || ''}${d.mail?.district || ''}${d.mail?.address || ''}（${d.mail?.recipient || ''}）`
          : '不需要',
      ),
    )
    if (d.contactPhone) rows.push(infoRow('電話', d.contactPhone))
    if (d.message) rows.push(infoRow('留言', d.message))
  }
  if (d.lineDisplayName) rows.push(infoRow('LINE', d.lineDisplayName))

  const title = decline ? '💌 婉謝出席' : `💍 新的出席回覆${isUpdate ? '（更新）' : ''}`
  return {
    type: 'flex',
    altText: buildNotifyText(d, isUpdate),
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '20px',
        backgroundColor: '#fffdf9',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'lg', color: decline ? '#5f7384' : '#1f3a5f' },
          { type: 'text', text: 'Kyle & Sandy 婚禮 RSVP', size: 'xs', color: '#2f7090', margin: 'xs' },
          { type: 'separator', margin: 'md', color: '#ece5d8' },
          ...rows,
        ],
      },
    },
  }
}

export const notifyRsvp = (d, isUpdate) => send([buildRsvpFlex(d, isUpdate)])

// ── 功能 5：賓客送出後收到的確認卡 ──
export function buildGuestConfirmFlex(d, tableNo) {
  const decline = d.attending === 'no'
  const name = d.attendees?.[0]?.name || ''
  const rows = []
  if (decline) {
    rows.push({ type: 'text', text: `${name}，已收到你的回覆，很遺憾這次無法相聚 🙏 謝謝你的祝福！`, wrap: true, size: 'sm', color: '#22303f' })
  } else {
    rows.push({ type: 'text', text: `${name}，已收到你的出席回覆！`, wrap: true, size: 'sm', color: '#22303f', weight: 'bold' })
    rows.push(infoRow('出席', `${d.partySize || 1} 位`, { color: '#2f7090', weight: 'bold' }))
    if (d.isVeg) rows.push(infoRow('素食', `${d.vegCount} 位`))
    if (tableNo) rows.push(infoRow('桌次', tableNo, { color: '#e8746a', weight: 'bold' }))
  }
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px', backgroundColor: '#fffdf9',
      contents: [
        { type: 'text', text: decline ? '💌 已收到你的回覆' : '💛 已收到你的回覆！', weight: 'bold', size: 'lg', color: '#1f3a5f' },
        { type: 'text', text: 'Kyle & Sandy · 2026.08.01', size: 'xs', color: '#2f7090', margin: 'xs' },
        { type: 'separator', margin: 'md', color: '#ece5d8' },
        ...rows,
        decline ? null : { type: 'text', text: '期待 8/1 與你相見 ♡', size: 'sm', color: '#e8746a', margin: 'md', wrap: true },
      ].filter(Boolean),
    },
  }
  if (!decline) {
    bubble.footer = {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
      contents: [
        { type: 'button', style: 'primary', color: '#2f7090', height: 'sm', action: { type: 'uri', label: '修改回覆', uri: LIFF_URL } },
      ],
    }
  }
  return { type: 'flex', altText: '已收到你的婚禮回覆 💛', contents: bubble }
}

// ── 功能 6：婚禮前提醒卡 ──
export function buildReminderFlex(name, tableNo) {
  const rows = [
    infoRow('日期', '8 / 1（六）'),
    infoRow('證婚', '17:15'),
    infoRow('婚宴', '18:30'),
    infoRow('地點', '台北萬豪酒店 8F Garden Villa'),
  ]
  if (tableNo) rows.push(infoRow('你的桌次', tableNo, { color: '#e8746a', weight: 'bold' }))
  return {
    type: 'flex',
    altText: 'Kyle & Sandy 婚禮提醒 — 8/1 見 ♡',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px', backgroundColor: '#fffdf9',
        contents: [
          { type: 'text', text: `${name || ''}　婚禮就快到了！`, weight: 'bold', size: 'md', color: '#1f3a5f', wrap: true },
          { type: 'text', text: 'Kyle & Sandy 婚禮提醒', size: 'xs', color: '#2f7090', margin: 'xs' },
          { type: 'separator', margin: 'md', color: '#ece5d8' },
          ...rows,
          { type: 'text', text: '期待與你相見 ♡', size: 'sm', color: '#e8746a', margin: 'md' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
        contents: [
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: '查看地圖', uri: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('台北萬豪酒店 台北市中山區樂群二路199號') } },
        ],
      },
    },
  }
}
