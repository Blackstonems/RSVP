<script>
  import { onMount } from 'svelte'

  let pw = $state('')
  let authed = $state(false)
  let loading = $state(false)
  let error = $state('')
  let data = $state(null) // { stats, rows }
  let q = $state('')
  let view = $state('all') // 'all' | 'mail'

  async function loadData(password) {
    const res = await fetch('/api/admin/data', {
      headers: { Authorization: `Bearer ${password}` },
    })
    if (res.status === 401) throw new Error('密碼錯誤')
    if (res.status === 503) throw new Error('後台尚未設定密碼（請設定 ADMIN_PASSWORD）')
    if (!res.ok) throw new Error('讀取失敗')
    return res.json()
  }

  async function login() {
    if (!pw) return
    loading = true
    error = ''
    try {
      data = await loadData(pw)
      authed = true
      try {
        sessionStorage.setItem('rsvp_admin_pw', pw)
      } catch {}
    } catch (e) {
      error = e.message
    } finally {
      loading = false
    }
  }

  async function refresh() {
    loading = true
    try {
      data = await loadData(pw)
    } catch (e) {
      error = e.message
    } finally {
      loading = false
    }
  }

  function logout() {
    authed = false
    pw = ''
    data = null
    try {
      sessionStorage.removeItem('rsvp_admin_pw')
    } catch {}
  }

  async function downloadCsv() {
    const res = await fetch('/api/admin/export.csv', { headers: { Authorization: `Bearer ${pw}` } })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rsvp-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 功能 7：設定桌號
  async function saveTable(r, value) {
    try {
      await fetch('/api/admin/table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pw}` },
        body: JSON.stringify({ id: r.id, tableNo: value }),
      })
      r.tableNo = value
    } catch {}
  }

  // 功能 6：手動發送婚禮前提醒
  let reminding = $state(false)
  async function sendReminder() {
    if (!confirm('確定要發送「婚禮前提醒」給所有出席且已加 BLST 好友的賓客嗎？')) return
    reminding = true
    try {
      const res = await fetch('/api/admin/send-reminder', { method: 'POST', headers: { Authorization: `Bearer ${pw}` } })
      const j = await res.json().catch(() => ({}))
      alert(j.ok ? `已發送提醒給 ${j.sent} / ${j.total} 位賓客` : '發送失敗')
    } catch {
      alert('發送失敗')
    }
    reminding = false
  }

  // 桌次查詢開關：on / off / auto
  async function setTablesMode(mode) {
    try {
      const res = await fetch('/api/admin/tables-open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pw}` },
        body: JSON.stringify({ mode }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.ok) {
        data.tablesMode = j.mode
        data.tablesOpen = j.open
      }
    } catch {}
  }

  // 刪除某筆回覆（需確認兩次）
  async function deleteRow(r) {
    const name = r.attendees[0]?.name || '這筆'
    if (!confirm(`確定要刪除「${name}」的回覆嗎？`)) return
    if (!confirm(`⚠️ 再次確認：刪除後無法復原。真的要刪除「${name}」嗎？`)) return
    try {
      const res = await fetch(`/api/admin/rsvp/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${pw}` } })
      const j = await res.json().catch(() => ({}))
      if (j.ok) await refresh()
      else alert('刪除失敗')
    } catch {
      alert('刪除失敗')
    }
  }

  onMount(async () => {
    let saved = null
    try {
      saved = sessionStorage.getItem('rsvp_admin_pw')
    } catch {}
    if (!saved) return
    pw = saved
    try {
      data = await loadData(saved)
      authed = true
    } catch {
      logout()
    }
  })

  const SIDE = { groom: '新郎', bride: '新娘' }
  const fmt = (iso) => (iso ? iso.replace('T', ' ').slice(5, 16) : '')

  let filtered = $derived.by(() => {
    let rs = data?.rows ?? []
    if (view === 'mail') rs = rs.filter((r) => r.needInvite)
    const t = q.trim().toLowerCase()
    if (t) rs = rs.filter((r) => JSON.stringify(r).toLowerCase().includes(t))
    return rs
  })

  const companionsOf = (r) =>
    r.attendees.slice(1).map((a) => a.name + (a.relation ? `(${a.relation})` : '')).join('、')
</script>

{#if !authed}
  <div class="gate">
    <form class="gate-card" onsubmit={(e) => { e.preventDefault(); login() }}>
      <h1>RSVP 後台</h1>
      <p class="muted">Kyle &amp; Sandy 婚禮回覆管理</p>
      <input class="input" type="password" bind:value={pw} placeholder="管理密碼" autocomplete="current-password" />
      {#if error}<div class="err">{error}</div>{/if}
      <button class="btn" type="submit" disabled={loading}>{loading ? '驗證中…' : '進入'}</button>
    </form>
  </div>
{:else}
  <div class="admin">
    <header class="bar">
      <div>
        <h1>RSVP 後台</h1>
        <span class="muted">共 {data.rows.length} 筆回覆</span>
      </div>
      <div class="bar-actions">
        <button class="btn ghost" onclick={refresh} disabled={loading}>{loading ? '更新中…' : '重新整理'}</button>
        <button class="btn ghost" onclick={sendReminder} disabled={reminding}>{reminding ? '發送中…' : '發送婚禮前提醒'}</button>
        <button class="btn" onclick={downloadCsv}>匯出 CSV</button>
        <button class="btn ghost" onclick={logout}>登出</button>
      </div>
    </header>

    <section class="cards">
      <div class="stat"><span>總出席人數</span><b>{data.stats.guests}</b></div>
      <div class="stat"><span>出席組數</span><b>{data.stats.partiesYes}</b></div>
      <div class="stat"><span>婉謝</span><b>{data.stats.partiesNo}</b></div>
      <div class="stat"><span>素食總數</span><b>{data.stats.veg}</b></div>
      <div class="stat"><span>需寄喜帖</span><b>{data.stats.invites}</b></div>
    </section>

    <div class="seating">
      <span class="seating-label">賓客桌次查詢</span>
      <div class="seg">
        <button class:active={data.tablesMode === 'on'} onclick={() => setTablesMode('on')}>開放</button>
        <button class:active={data.tablesMode === 'off'} onclick={() => setTablesMode('off')}>關閉</button>
        <button class:active={data.tablesMode === 'auto'} onclick={() => setTablesMode('auto')}>自動</button>
      </div>
      <span class="seating-note">{data.tablesOpen ? '✓ 目前賓客看得到桌次' : '目前賓客看不到桌次'} ·「自動」= 婚禮前一天起開放</span>
    </div>

    <div class="toolbar">
      <div class="tabs">
        <button class:active={view === 'all'} onclick={() => (view = 'all')}>全部回覆</button>
        <button class:active={view === 'mail'} onclick={() => (view = 'mail')}>寄帖名單 ({data.stats.invites})</button>
      </div>
      <input class="input search" type="search" bind:value={q} placeholder="搜尋姓名 / 電話 / 地址…" />
    </div>

    <div class="table-wrap">
      {#if view === 'all'}
        <table>
          <thead>
            <tr><th>時間</th><th>姓名</th><th>LINE</th><th>身分</th><th>人數</th><th>桌號</th><th>同行者</th><th>素食</th><th>寄帖</th><th>電話</th><th>留言</th><th></th></tr>
          </thead>
          <tbody>
            {#each filtered as r}
              <tr class:decline={r.attending === 'no'}>
                <td class="dim">{fmt(r.createdAt)}</td>
                <td><b>{r.attendees[0]?.name}</b></td>
                <td class="dim">{r.lineDisplayName || '—'}</td>
                <td>{r.attending === 'yes' ? `${SIDE[r.side] ?? ''}的${r.relation ?? ''}` : '—'}</td>
                <td>{r.attending === 'yes' ? r.partySize : '婉謝'}</td>
                <td>
                  {#if r.attending === 'yes'}
                    <input class="table-input" value={r.tableNo} placeholder="—" onchange={(e) => saveTable(r, e.currentTarget.value)} />
                  {:else}—{/if}
                </td>
                <td class="dim">{companionsOf(r) || '—'}</td>
                <td>{r.isVeg ? r.vegCount : '—'}</td>
                <td>{r.needInvite ? '需要' : '—'}</td>
                <td class="dim">{r.contactPhone || '—'}</td>
                <td class="msg" title={r.message}>{r.message || '—'}</td>
                <td><button class="del" onclick={() => deleteRow(r)} title="刪除這筆回覆">刪除</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <table>
          <thead>
            <tr><th>收件人</th><th>郵遞區號</th><th>地址</th><th>電話</th></tr>
          </thead>
          <tbody>
            {#each filtered as r}
              <tr>
                <td><b>{r.mail.recipient || r.attendees[0]?.name}</b></td>
                <td>{r.mail.zip}</td>
                <td>{r.mail.city}{r.mail.district}{r.mail.address}</td>
                <td class="dim">{r.contactPhone || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      {#if filtered.length === 0}<p class="empty">沒有符合的資料</p>{/if}
    </div>
  </div>
{/if}

<style>
  .gate {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .gate-card {
    width: 100%;
    max-width: 340px;
    background: var(--card);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 32px 26px;
    text-align: center;
  }
  .gate-card h1 {
    font-family: var(--serif-tc);
    margin: 0 0 2px;
  }

  .admin {
    max-width: 1100px;
    margin: 0 auto;
    padding: 20px 18px 60px;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 20px;
  }
  .bar h1 {
    font-family: var(--serif-tc);
    font-size: 1.4rem;
    margin: 0;
  }
  .bar-actions {
    display: flex;
    gap: 8px;
  }
  .muted {
    color: var(--ink-soft);
    font-size: 0.85rem;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 22px;
  }
  .stat {
    background: var(--card);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stat span {
    color: var(--ink-soft);
    font-size: 0.82rem;
  }
  .stat b {
    font-family: var(--serif-en);
    font-size: 2rem;
    color: var(--accent-deep);
    line-height: 1;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
  }
  .tabs {
    display: inline-flex;
    background: var(--bg-2);
    border-radius: var(--radius-pill);
    padding: 4px;
  }
  .tabs button {
    border: none;
    background: transparent;
    padding: 8px 16px;
    border-radius: var(--radius-pill);
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .tabs button.active {
    background: var(--card);
    color: var(--ink);
    box-shadow: var(--shadow-sm);
  }
  .search {
    max-width: 280px;
  }

  .table-wrap {
    background: var(--card);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    overflow-x: auto;
    box-shadow: var(--shadow-sm);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th,
  td {
    text-align: left;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line-soft);
    white-space: nowrap;
  }
  th {
    color: var(--ink-soft);
    font-weight: 500;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    background: var(--bg);
    position: sticky;
    top: 0;
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  tbody tr:hover {
    background: var(--bg);
  }
  tr.decline {
    color: var(--ink-soft);
  }
  td.dim {
    color: var(--ink-soft);
  }
  td.msg {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    text-align: center;
    color: var(--ink-soft);
    padding: 28px;
  }

  .input {
    width: 100%;
    padding: 11px 14px;
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    outline: none;
    margin: 14px 0;
  }
  .input:focus {
    border-color: var(--accent);
    background: #fff;
  }
  .search {
    margin: 0;
  }
  .err {
    color: var(--danger);
    font-size: 0.86rem;
    margin-bottom: 8px;
  }
  .btn {
    border: none;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    padding: 10px 18px;
    border-radius: var(--radius-pill);
    font-size: 0.9rem;
  }
  .gate-card .btn {
    width: 100%;
    padding: 13px;
  }
  .btn:disabled {
    opacity: 0.6;
  }
  .btn.ghost {
    background: transparent;
    border: 1px solid var(--line);
    color: var(--ink);
  }
  .table-input {
    width: 66px;
    padding: 5px 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    font-size: 0.85rem;
    color: var(--ink);
  }
  .table-input:focus {
    outline: none;
    border-color: var(--accent);
    background: #fff;
  }
  .seating {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 14px;
    margin-bottom: 18px;
    padding: 12px 16px;
    background: var(--card);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }
  .seating-label {
    font-weight: 500;
    color: var(--ink);
  }
  .seg {
    display: inline-flex;
    background: var(--bg-2);
    border-radius: var(--radius-pill);
    padding: 3px;
  }
  .seg button {
    border: none;
    background: transparent;
    padding: 6px 16px;
    border-radius: var(--radius-pill);
    color: var(--ink-soft);
    font-size: 0.88rem;
  }
  .seg button.active {
    background: var(--card);
    color: var(--accent-deep);
    box-shadow: var(--shadow-sm);
    font-weight: 600;
  }
  .seating-note {
    color: var(--ink-soft);
    font-size: 0.82rem;
  }
  .del {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--danger);
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 0.82rem;
  }
  .del:hover {
    background: var(--danger);
    color: #fff;
    border-color: var(--danger);
  }

  @media (max-width: 720px) {
    .cards {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
