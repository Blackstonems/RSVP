// 一次性產生 src/lib/data/locations.js（全台縣市/區/3碼郵遞區號）
// 用法：node scripts/gen-locations.mjs
// 資料來源：https://gist.github.com/mukiwu/50bccbe60f1e65660cfa12bec1d4a5f1
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GIST = 'https://api.github.com/gists/50bccbe60f1e65660cfa12bec1d4a5f1'

const res = await fetch(GIST, {
  headers: { 'User-Agent': 'rsvp-app', Accept: 'application/vnd.github+json' },
})
if (!res.ok) throw new Error('fetch gist failed: ' + res.status)
const gist = await res.json()
const file = Object.values(gist.files)[0]
let raw = file.content
if (file.truncated) raw = await (await fetch(file.raw_url)).text()

const data = JSON.parse(raw) // [{ name, districts: [{ zip, name }] }]
const LOCATIONS = {}
for (const c of data) {
  if (!c.name || !Array.isArray(c.districts)) throw new Error('unexpected shape: ' + JSON.stringify(c).slice(0, 80))
  LOCATIONS[c.name] = c.districts.map((d) => ({ name: d.name, zip: String(d.zip) }))
}

const cityCount = Object.keys(LOCATIONS).length
const distCount = Object.values(LOCATIONS).reduce((a, b) => a + b.length, 0)

const out = `// 台灣縣市 / 鄉鎮市區 / 3 碼郵遞區號（完整 ${cityCount} 縣市、${distCount} 區）
// 由 scripts/gen-locations.mjs 產生；離線使用、不靠外部 API。
// 來源：https://gist.github.com/mukiwu/50bccbe60f1e65660cfa12bec1d4a5f1
export const LOCATIONS = ${JSON.stringify(LOCATIONS, null, 2)}

// 反查：郵遞區號 → { 縣市, 區 }
export const LOC_BY_ZIP = {}
for (const [city, districts] of Object.entries(LOCATIONS)) {
  for (const d of districts) {
    LOC_BY_ZIP[d.zip] = { city, district: d.name }
  }
}

export const CITIES = Object.keys(LOCATIONS)

export function zipOf(city, district) {
  const list = LOCATIONS[city] || []
  return list.find((d) => d.name === district)?.zip || ''
}
`

const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'data', 'locations.js')
writeFileSync(dest, out, 'utf8')
console.log(`wrote ${dest}`)
console.log(`cities=${cityCount} districts=${distCount}`)
console.log('sample cities:', Object.keys(LOCATIONS).slice(0, 6).join(', '))
console.log('Taipei Zhongshan zip:', LOCATIONS['臺北市']?.find((d) => d.name === '中山區')?.zip)
