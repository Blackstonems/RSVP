// 把 { filename: base64 } 的 JSON 檔解碼成 public/ 下的 PNG。
// 用法：node scripts/write-icons.mjs <json檔路徑>
// 容錯：自動去除 BOM，並處理「被多包了一層字串」的情況。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/write-icons.mjs <json-file>')
  process.exit(1)
}

let txt = readFileSync(src, 'utf8')
if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1) // strip BOM
let data = JSON.parse(txt)
if (typeof data === 'string') data = JSON.parse(data) // 多包一層字串時再解一次

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(pub, { recursive: true })

for (const [name, b64] of Object.entries(data)) {
  const buf = Buffer.from(b64, 'base64')
  writeFileSync(join(pub, name), buf)
  console.log(`wrote ${name}  ${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}  ${buf.length} bytes`)
}
