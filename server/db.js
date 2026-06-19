import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'rsvp.db')
mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL;')

db.exec(`
  CREATE TABLE IF NOT EXISTS rsvp (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    edit_token       TEXT UNIQUE NOT NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    attending        INTEGER NOT NULL,
    side             TEXT,
    relation         TEXT,
    party_size       INTEGER NOT NULL DEFAULT 1,
    contact_name     TEXT NOT NULL,
    contact_phone    TEXT,
    contact_email    TEXT,
    companions       TEXT,
    need_invitation  INTEGER NOT NULL DEFAULT 0,
    mail_recipient   TEXT,
    mail_zip         TEXT,
    mail_city        TEXT,
    mail_district    TEXT,
    mail_address     TEXT,
    vegetarian       INTEGER NOT NULL DEFAULT 0,
    vegetarian_count INTEGER NOT NULL DEFAULT 0,
    message          TEXT,
    line_user_id     TEXT,
    line_display_name TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_rsvp_phone ON rsvp (contact_phone);
`)

// 既有資料庫補欄位（已存在則忽略）
for (const col of [
  'line_user_id TEXT',
  'line_display_name TEXT',
  'table_no TEXT',
  'checked_in INTEGER NOT NULL DEFAULT 0',
  'checked_in_at TEXT',
]) {
  try {
    db.exec(`ALTER TABLE rsvp ADD COLUMN ${col}`)
  } catch {}
}
db.exec('CREATE INDEX IF NOT EXISTS idx_rsvp_line ON rsvp (line_user_id)')

const COLS = `
  attending, side, relation, party_size,
  contact_name, contact_phone, contact_email, companions,
  need_invitation, mail_recipient, mail_zip, mail_city, mail_district, mail_address,
  vegetarian, vegetarian_count, message, line_user_id, line_display_name
`

// payload (camelCase) -> 資料庫欄位
function toRow(d) {
  const attendees = Array.isArray(d.attendees) ? d.attendees : [{ name: '' }]
  const mail = d.mail || {}
  return {
    attending: d.attending === 'yes' ? 1 : 0,
    side: d.side || null,
    relation: d.relation || null,
    party_size: d.attending === 'yes' ? d.partySize || 1 : 1,
    contact_name: attendees[0]?.name || '',
    contact_phone: d.contactPhone || null,
    contact_email: d.contactEmail || null,
    companions: JSON.stringify(attendees.slice(1)),
    need_invitation: d.needInvite ? 1 : 0,
    mail_recipient: mail.recipient || null,
    mail_zip: mail.zip || null,
    mail_city: mail.city || null,
    mail_district: mail.district || null,
    mail_address: mail.address || null,
    vegetarian: d.isVeg ? 1 : 0,
    vegetarian_count: d.isVeg ? d.vegCount || 0 : 0,
    message: d.message || null,
    line_user_id: d.lineUserId || null,
    line_display_name: d.lineDisplayName || null,
  }
}

// 資料庫列 -> payload (給前端預填 / 後台)
export function rowToPayload(row) {
  if (!row) return null
  const companions = row.companions ? JSON.parse(row.companions) : []
  return {
    id: row.id,
    attending: row.attending ? 'yes' : 'no',
    side: row.side,
    relation: row.relation,
    partySize: row.party_size,
    attendees: [{ name: row.contact_name, relation: '' }, ...companions],
    contactPhone: row.contact_phone || '',
    contactEmail: row.contact_email || '',
    needInvite: !!row.need_invitation,
    mail: {
      recipient: row.mail_recipient || '',
      zip: row.mail_zip || '',
      city: row.mail_city || '',
      district: row.mail_district || '',
      address: row.mail_address || '',
    },
    isVeg: !!row.vegetarian,
    vegCount: row.vegetarian_count,
    message: row.message || '',
    lineUserId: row.line_user_id || '',
    lineDisplayName: row.line_display_name || '',
    tableNo: row.table_no || '',
    checkedIn: !!row.checked_in,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const insertStmt = db.prepare(`
  INSERT INTO rsvp (edit_token, created_at, updated_at, ${COLS})
  VALUES (@edit_token, @created_at, @updated_at,
    @attending, @side, @relation, @party_size,
    @contact_name, @contact_phone, @contact_email, @companions,
    @need_invitation, @mail_recipient, @mail_zip, @mail_city, @mail_district, @mail_address,
    @vegetarian, @vegetarian_count, @message, @line_user_id, @line_display_name)
`)

const updateStmt = db.prepare(`
  UPDATE rsvp SET updated_at=@updated_at,
    attending=@attending, side=@side, relation=@relation, party_size=@party_size,
    contact_name=@contact_name, contact_phone=@contact_phone, contact_email=@contact_email, companions=@companions,
    need_invitation=@need_invitation, mail_recipient=@mail_recipient, mail_zip=@mail_zip,
    mail_city=@mail_city, mail_district=@mail_district, mail_address=@mail_address,
    vegetarian=@vegetarian, vegetarian_count=@vegetarian_count, message=@message,
    line_user_id=@line_user_id, line_display_name=@line_display_name
  WHERE edit_token=@edit_token
`)

const byTokenStmt = db.prepare('SELECT * FROM rsvp WHERE edit_token = ?')
const byPhoneStmt = db.prepare('SELECT * FROM rsvp WHERE contact_phone = ? ORDER BY id DESC LIMIT 1')
const byLineStmt = db.prepare('SELECT * FROM rsvp WHERE line_user_id = ? ORDER BY id DESC LIMIT 1')
const listStmt = db.prepare('SELECT * FROM rsvp ORDER BY created_at DESC')

export function createRsvp(token, payload, now) {
  insertStmt.run({ edit_token: token, created_at: now, updated_at: now, ...toRow(payload) })
}

export function updateRsvp(token, payload, now) {
  const res = updateStmt.run({ edit_token: token, updated_at: now, ...toRow(payload) })
  return res.changes > 0
}

const deleteStmt = db.prepare('DELETE FROM rsvp WHERE id = ?')
export const deleteRsvp = (id) => deleteStmt.run(id).changes > 0

export const getByToken = (token) => byTokenStmt.get(token)
export const getByPhone = (phone) => (phone ? byPhoneStmt.get(phone) : undefined)
export const getByLineUser = (userId) => (userId ? byLineStmt.get(userId) : undefined)
export const listAll = () => listStmt.all()

// 桌號 / 電子報到（功能 7）
const byIdStmt = db.prepare('SELECT * FROM rsvp WHERE id = ?')
export const getById = (id) => byIdStmt.get(id)
const setTableStmt = db.prepare('UPDATE rsvp SET table_no=@t WHERE id=@id')
export const setTableNo = (id, tableNo) => setTableStmt.run({ id, t: tableNo || null }).changes > 0
const checkInStmt = db.prepare('UPDATE rsvp SET checked_in=1, checked_in_at=@now WHERE line_user_id=@uid')
export const checkInByLine = (userId, now) => checkInStmt.run({ uid: userId, now }).changes > 0

// 出席且有 LINE 身分的賓客（功能 5/6 發訊對象）
const attendingLineStmt = db.prepare(
  "SELECT line_user_id AS userId, contact_name AS name, table_no AS tableNo FROM rsvp WHERE attending = 1 AND line_user_id IS NOT NULL AND line_user_id <> ''",
)
export const listAttendingLine = () => attendingLineStmt.all()

const statsStmt = db.prepare(`
  SELECT
    COALESCE(SUM(CASE WHEN attending = 1 THEN party_size ELSE 0 END), 0) AS guests,
    COALESCE(SUM(CASE WHEN attending = 1 THEN 1 ELSE 0 END), 0)          AS partiesYes,
    COALESCE(SUM(CASE WHEN attending = 0 THEN 1 ELSE 0 END), 0)          AS partiesNo,
    COALESCE(SUM(vegetarian_count), 0)                                   AS veg,
    COALESCE(SUM(CASE WHEN need_invitation = 1 THEN 1 ELSE 0 END), 0)    AS invites,
    COALESCE(SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END), 0)         AS checkedIn,
    COUNT(*)                                                             AS total
  FROM rsvp
`)

export function stats() {
  const r = statsStmt.get()
  // node:sqlite 整數可能為 BigInt，轉成 number 以利 JSON 序列化
  return {
    guests: Number(r.guests),
    partiesYes: Number(r.partiesYes),
    partiesNo: Number(r.partiesNo),
    veg: Number(r.veg),
    invites: Number(r.invites),
    checkedIn: Number(r.checkedIn),
    total: Number(r.total),
  }
}

// 透過 LINE webhook 擷取到的傳訊者 userId（用來設定通知對象 LINE_TO）
db.exec(`
  CREATE TABLE IF NOT EXISTS line_recipients (
    user_id    TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL
  );
`)
const insLineIdStmt = db.prepare('INSERT OR IGNORE INTO line_recipients (user_id, first_seen) VALUES (?, ?)')
const listLineIdsStmt = db.prepare('SELECT user_id AS userId, first_seen AS firstSeen FROM line_recipients ORDER BY first_seen DESC')

export const captureLineId = (userId, now) => insLineIdStmt.run(userId, now)
export const listLineIds = () => listLineIdsStmt.all()

// 設定（key/value）— 例如記錄提醒是否已發送
db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);`)
const getSetStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
const setSetStmt = db.prepare('INSERT INTO settings (key, value) VALUES (@k, @v) ON CONFLICT(key) DO UPDATE SET value = @v')
export const getSetting = (k) => getSetStmt.get(k)?.value
export const setSetting = (k, v) => setSetStmt.run({ k, v: String(v) })
