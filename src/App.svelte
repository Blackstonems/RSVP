<script>
  import { slide, fade, fly, scale } from 'svelte/transition'
  import { quintOut, backOut } from 'svelte/easing'
  import { CITIES, LOCATIONS, LOC_BY_ZIP, zipOf } from './lib/data/locations.js'
  import { onMount } from 'svelte'

  // ── 婚禮資訊 ──────────────────────────────────────────────
  const WEDDING = {
    couple: 'Kyle & Sandy',
    dateLabel: '2026 . 08 . 01',
    weekday: 'SATURDAY 星期六',
    fullDate: '2026 年 8 月 1 日 · 星期六',
    schedule: [
      { label: '證婚儀式', time: '17:15 – 17:45' },
      { label: '雞尾酒 Party / 入席', time: '17:45 – 18:30' },
      { label: '婚宴開始', time: '18:30' },
    ],
    venue: '台北萬豪酒店',
    hall: '8F Garden Villa',
    address: '台北市中山區樂群二路 199 號',
  }
  const MAP_URL =
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent('台北萬豪酒店 台北市中山區樂群二路199號')

  // 功能 8：開共享相簿（LINE 內用外部瀏覽器）
  function openAlbum(e) {
    try {
      if (window.liff && window.liff.isInClient && window.liff.isInClient()) {
        e.preventDefault()
        window.liff.openWindow({ url: albumUrl, external: true })
      }
    } catch {}
  }

  // ── 表單狀態 ──────────────────────────────────────────────
  let attending = $state(null) // 'yes' | 'no'
  let side = $state(null) // 'groom' | 'bride'
  let relation = $state(null) // 親友 / 同學 / 朋友 / 其他

  let withCompanions = $state(false)
  let partySize = $state(1)
  let attendees = $state([{ name: '', relation: '' }]) // [0] = 主要聯絡人
  let contactPhone = $state('')
  let contactEmail = $state('')

  let needInvite = $state(false)
  let mail = $state({ recipient: '', zip: '', city: '', district: '', address: '' })

  let isVeg = $state(false)
  let vegCount = $state(0)

  let message = $state('')

  let errors = $state([])
  let submitted = $state(false)
  let saving = $state(false)
  let submitError = $state('')
  let editToken = $state(null)
  let loadedExisting = $state(false)
  let wasUpdate = $state(false)
  let lineUserId = $state('')
  let lineDisplayName = $state('')
  let tableNo = $state('')
  let albumUrl = $state('')
  let tablesOpen = $state(false)

  // ── 衍生 ─────────────────────────────────────────────────
  let districts = $derived(mail.city ? LOCATIONS[mail.city] : [])

  // ── 人數 / 同行者 ─────────────────────────────────────────
  function resizeAttendees(n) {
    const next = attendees.slice(0, n)
    while (next.length < n) next.push({ name: '', relation: '親友' })
    attendees = next
  }
  function setPartySize(n) {
    partySize = n
    resizeAttendees(n)
    if (isVeg) vegCount = Math.min(Math.max(1, vegCount), partySize)
  }
  function onToggleCompanions() {
    setPartySize(withCompanions ? Math.max(2, partySize) : 1)
  }

  // ── 素食 ─────────────────────────────────────────────────
  function onToggleVeg() {
    vegCount = isVeg ? Math.min(Math.max(1, vegCount || 1), partySize) : 0
  }
  function setVeg(n) {
    vegCount = Math.max(1, Math.min(n, partySize))
  }

  // ── 地址連動 ──────────────────────────────────────────────
  function onCityChange() {
    mail.district = ''
    mail.zip = ''
  }
  function onDistrictChange(e) {
    const d = e.currentTarget.value
    mail.district = d
    mail.zip = zipOf(mail.city, d)
  }
  function onZipInput(e) {
    const v = e.currentTarget.value.replace(/\D/g, '').slice(0, 6)
    mail.zip = v
    const hit = LOC_BY_ZIP[v.slice(0, 3)]
    if (hit) {
      mail.city = hit.city
      mail.district = hit.district
    }
  }

  // ── 送出 ─────────────────────────────────────────────────
  function validate() {
    const e = []
    if (!attending) e.push('請先選擇是否能出席')
    if (attending === 'yes') {
      if (!side) e.push('請選擇你是新郎方或新娘方')
      if (!relation) e.push('請選擇你與新人的關係')
      if (!attendees[0].name.trim()) e.push('請填寫主要聯絡人姓名')
      if (!contactPhone.trim()) e.push('請填寫聯絡手機')
      for (let i = 1; i < partySize; i++) {
        if (!attendees[i].name.trim()) e.push(`請填寫同行者 ${i} 的姓名`)
      }
      if (needInvite) {
        if (!mail.recipient.trim()) e.push('請填寫喜帖收件人姓名')
        if (!mail.city) e.push('請選擇縣市')
        if (!mail.district) e.push('請選擇鄉鎮市區')
        if (!mail.address.trim()) e.push('請填寫詳細地址')
      }
    }
    if (attending === 'no' && !attendees[0].name.trim()) {
      e.push('請留下你的姓名')
    }
    return e
  }

  // 表單狀態 -> 送給後端的 payload
  function buildPayload() {
    const yes = attending === 'yes'
    return {
      attending,
      side: yes ? side : null,
      relation: yes ? relation : null,
      partySize: yes ? partySize : 1,
      attendees: yes
        ? attendees.slice(0, partySize).map((a, i) => ({ name: a.name.trim(), relation: i === 0 ? '' : a.relation }))
        : [{ name: attendees[0].name.trim(), relation: '' }],
      contactPhone: yes ? contactPhone.trim() : '',
      contactEmail: yes ? contactEmail.trim() : '',
      needInvite: yes ? needInvite : false,
      mail: yes && needInvite ? { ...mail } : { recipient: '', zip: '', city: '', district: '', address: '' },
      isVeg: yes ? isVeg : false,
      vegCount: yes && isVeg ? vegCount : 0,
      message: message.trim(),
      lineUserId,
      lineDisplayName,
    }
  }

  // 後端回來的 payload -> 預填表單（回訪 / 修改）
  function applyPayload(p) {
    attending = p.attending
    side = p.side
    relation = p.relation
    partySize = p.partySize || 1
    withCompanions = partySize > 1
    attendees =
      p.attendees?.length
        ? p.attendees.map((a, i) => ({ name: a.name || '', relation: i === 0 ? '' : a.relation || '親友' }))
        : [{ name: '', relation: '' }]
    if (attendees.length < partySize) resizeAttendees(partySize)
    contactPhone = p.contactPhone || ''
    contactEmail = p.contactEmail || ''
    needInvite = !!p.needInvite
    mail = {
      recipient: p.mail?.recipient || '',
      zip: p.mail?.zip || '',
      city: p.mail?.city || '',
      district: p.mail?.district || '',
      address: p.mail?.address || '',
    }
    isVeg = !!p.isVeg
    vegCount = p.vegCount || 0
    message = p.message || ''
    tableNo = p.tableNo || ''
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })
  }

  // 在 LINE 內開啟（LIFF）→ 用 LINE 身分自動帶入姓名、取回先前回覆。回傳是否成功。
  async function initLiff() {
    let cfg
    try {
      cfg = await fetch('/api/config').then((r) => r.json())
    } catch {
      return false
    }
    albumUrl = cfg?.albumUrl || ''
    tablesOpen = !!cfg?.tablesOpen
    if (!cfg?.liffId) return false
    try {
      await loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js')
      await window.liff.init({ liffId: cfg.liffId })
      if (!window.liff.isLoggedIn()) return false // 一般瀏覽器：不強制登入
      const prof = await window.liff.getProfile()
      lineUserId = prof.userId
      lineDisplayName = prof.displayName
      const res = await fetch('/api/rsvp/by-line/' + encodeURIComponent(prof.userId))
      if (res.ok) {
        const j = await res.json()
        if (j.ok && j.data) {
          applyPayload(j.data)
          loadedExisting = true
          return true
        }
      }
      if (!attendees[0].name) attendees[0].name = prof.displayName // 首次 → 預填姓名
      return true
    } catch {
      return false
    }
  }

  onMount(async () => {
    // 1) 在 LINE 內（LIFF）→ 用 LINE 身分預填 / 取回
    if (await initLiff()) return
    // 2) 一般瀏覽器 → 用本機 editToken 取回
    let t = null
    try {
      t = localStorage.getItem('rsvp_edit_token')
    } catch {}
    if (!t) return
    try {
      const res = await fetch(`/api/rsvp/${t}`)
      if (res.ok) {
        const j = await res.json()
        if (j.ok && j.data) {
          editToken = t
          applyPayload(j.data)
          loadedExisting = true
        }
      } else if (res.status === 404) {
        try {
          localStorage.removeItem('rsvp_edit_token')
        } catch {}
      }
    } catch {}
  })

  async function handleSubmit(ev) {
    ev.preventDefault()
    const e = validate()
    errors = e
    if (e.length) return
    saving = true
    submitError = ''
    try {
      const url = editToken ? `/api/rsvp/${editToken}` : '/api/rsvp'
      const method = editToken ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        submitError = j.errors?.[0] || '送出失敗，請稍後再試'
        saving = false
        return
      }
      if (j.editToken) {
        editToken = j.editToken
        try {
          localStorage.setItem('rsvp_edit_token', editToken)
        } catch {}
      }
      wasUpdate = !!j.updated || method === 'PUT'
      submitted = true
      saving = false
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      submitError = '連線失敗，請檢查網路後再試一次'
      saving = false
    }
  }

  function editAgain() {
    submitted = false
  }

  const RELATIONS = ['親友', '同學', '朋友', '同事', '其他']
  const COMP_RELATIONS = ['配偶', '親友', '其他']
</script>

<main>
  <!-- ───────────────── HERO ───────────────── -->
  <header class="hero">
    <img class="hero-photo" src="/hero.jpg" alt="Kyle &amp; Sandy" />
    <div class="hero-text">
      <p class="kicker" in:fade={{ duration: 900 }}>WE ARE GETTING MARRIED</p>
      <h1 class="couple" in:fly={{ y: 18, duration: 1000, easing: quintOut }}>
        Kyle <span class="amp">&amp;</span> Sandy
      </h1>
      <div class="ornament" aria-hidden="true">
        <span class="line"></span>
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2c2 4 6 6 6 10a6 6 0 0 1-12 0c0-4 4-6 6-10z" fill="none" stroke="currentColor" stroke-width="1" /></svg>
        <span class="line"></span>
      </div>
      <p class="hero-date" in:fade={{ duration: 1100, delay: 200 }}>
        {WEDDING.dateLabel}<br /><span class="weekday">{WEDDING.weekday}</span>
      </p>
    </div>
  </header>

  <div class="wrap">
  <!-- ───────────────── 前言 ───────────────── -->
  <section class="intro" in:fade={{ duration: 1000 }}>
    <p class="intro-en">From the Deep Blue to I&nbsp;Do</p>
    <p class="intro-text">
      我們的故事從潛入深藍海洋的那一天悄悄展開<br />
      從潛伴到另一半<br />
      一路走來　有風景　有驚喜<br />
      更有您們的陪伴與祝福<br />
      誠摯邀請您於 8/1 與我們一同分享這份幸福
    </p>
  </section>

  <!-- ───────────────── 婚禮資訊卡 ───────────────── -->
  <section class="card info" in:fly={{ y: 24, duration: 700, easing: quintOut }}>
    <div class="info-date">{WEDDING.fullDate}</div>
    {#each WEDDING.schedule as s}
      <div class="info-row">
        <span class="info-label">{s.label}</span>
        <span class="info-value">{s.time}</span>
      </div>
    {/each}
    <div class="hr"></div>
    <div class="venue">
      <p class="venue-name">{WEDDING.venue}</p>
      <p class="venue-hall">{WEDDING.hall}</p>
      <p class="venue-addr">{WEDDING.address}</p>
    </div>
    <div class="info-actions">
      <a class="ghost-btn" href={MAP_URL} target="_blank" rel="noopener">查看地圖</a>
    </div>
  </section>

  <!-- ───────── 我的婚禮資訊（在 LINE 內、桌次開放後才顯示）───────── -->
  {#if loadedExisting && lineUserId && attending === 'yes' && tablesOpen}
    <section class="card guest" in:fade>
      <h3 class="guest-title">你的婚禮資訊</h3>
      {#if tableNo}
        <div class="guest-row"><span>你的桌次</span><b>{tableNo}</b></div>
      {:else}
        <p class="guest-hint">桌次安排好後會顯示在這裡 🪑</p>
      {/if}
      {#if albumUrl}
        <a class="ghost-btn album-btn" href={albumUrl} target="_blank" rel="noopener" onclick={openAlbum}>婚後共享相簿 📷</a>
      {/if}
    </section>
  {/if}

  <!-- ───────────────── RSVP ───────────────── -->
  <section class="card rsvp">
    <h2 class="section-title">出席回覆 <span>RSVP</span></h2>

    {#if !submitted}
      <form onsubmit={handleSubmit} novalidate>
        {#if loadedExisting}
          <div class="notice" in:fade>你先前已回覆過，可在下方修改後再次送出 ✎</div>
        {/if}
        <!-- 出席意願 -->
        <div class="choice-grid">
          <button
            type="button"
            class="choice"
            class:active={attending === 'yes'}
            onclick={() => (attending = 'yes')}
          >
            <span class="choice-mark">♡</span>
            <span class="choice-title">我會出席</span>
            <span class="choice-sub">很期待與你相聚</span>
          </button>
          <button
            type="button"
            class="choice"
            class:active={attending === 'no'}
            onclick={() => (attending = 'no')}
          >
            <span class="choice-mark">✶</span>
            <span class="choice-title">無法出席</span>
            <span class="choice-sub">遙寄祝福</span>
          </button>
        </div>

        {#if attending === 'yes'}
          <div in:fade={{ duration: 400 }}>
            <!-- 即時人數 -->
            <div class="counter">
              <span>您將出席</span>
              {#key partySize}
                <span class="counter-num" in:scale={{ duration: 450, easing: backOut, start: 0.4 }}>{partySize}</span>
              {/key}
              <span>位</span>
            </div>

            <!-- 身分 -->
            <div class="field">
              <span class="label">我是</span>
              <div class="pills">
                <button type="button" class="pill" class:active={side === 'groom'} onclick={() => (side = 'groom')}>新郎</button>
                <button type="button" class="pill" class:active={side === 'bride'} onclick={() => (side = 'bride')}>新娘</button>
                <span class="pills-join">的</span>
              </div>
              <div class="pills" style="margin-top:10px">
                {#each RELATIONS as r}
                  <button type="button" class="pill" class:active={relation === r} onclick={() => (relation = r)}>{r}</button>
                {/each}
              </div>
            </div>

            <!-- 主要聯絡人 -->
            <div class="field">
              <label class="label" for="name0">姓名 <small>（主要聯絡人）</small></label>
              <input id="name0" class="input" type="text" bind:value={attendees[0].name} placeholder="請輸入您的姓名" />
            </div>
            <div class="grid2">
              <div class="field">
                <label class="label" for="phone">聯絡手機</label>
                <input id="phone" class="input" type="tel" inputmode="numeric" bind:value={contactPhone} placeholder="09xx-xxx-xxx" />
              </div>
              <div class="field">
                <label class="label" for="email">Email <small>（選填）</small></label>
                <input id="email" class="input" type="email" bind:value={contactEmail} placeholder="you@example.com" />
              </div>
            </div>

            <!-- 攜伴 -->
            <label class="toggle">
              <input type="checkbox" bind:checked={withCompanions} onchange={onToggleCompanions} />
              <span class="track"><span class="thumb"></span></span>
              <span class="toggle-label">我會攜伴出席</span>
            </label>

            {#if withCompanions}
              <div class="reveal" transition:slide={{ duration: 350, easing: quintOut }}>
                <div class="field">
                  <label class="label" for="psize">出席人數（含您本人）</label>
                  <select id="psize" class="input select" value={partySize} onchange={(e) => setPartySize(+e.currentTarget.value)}>
                    {#each [2, 3, 4, 5, 6] as n}
                      <option value={n}>{n} 位</option>
                    {/each}
                  </select>
                </div>

                {#each Array.from({ length: partySize - 1 }) as _, k (k)}
                  {@const i = k + 1}
                  <div class="attendee" transition:slide={{ duration: 300 }}>
                    <input class="input" type="text" bind:value={attendees[i].name} placeholder={`同行者 ${i} 的姓名`} />
                    <div class="pills small">
                      {#each COMP_RELATIONS as r}
                        <button type="button" class="pill" class:active={attendees[i].relation === r} onclick={() => (attendees[i].relation = r)}>{r}</button>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- 郵寄喜帖 -->
            <label class="toggle">
              <input type="checkbox" bind:checked={needInvite} />
              <span class="track"><span class="thumb"></span></span>
              <span class="toggle-label">需要郵寄正式喜帖</span>
            </label>

            {#if needInvite}
              <div class="reveal" transition:slide={{ duration: 350, easing: quintOut }}>
                <div class="field">
                  <label class="label" for="recipient">收件人姓名</label>
                  <input id="recipient" class="input" type="text" bind:value={mail.recipient} placeholder="喜帖收件人" />
                </div>
                <div class="grid3">
                  <div class="field">
                    <label class="label" for="city">縣市</label>
                    <select id="city" class="input select" bind:value={mail.city} onchange={onCityChange}>
                      <option value="" disabled selected>請選擇</option>
                      {#each CITIES as c}<option value={c}>{c}</option>{/each}
                    </select>
                  </div>
                  <div class="field">
                    <label class="label" for="dist">鄉鎮市區</label>
                    <select id="dist" class="input select" value={mail.district} onchange={onDistrictChange} disabled={!mail.city}>
                      <option value="" disabled selected>請選擇</option>
                      {#each districts as d}<option value={d.name}>{d.name}</option>{/each}
                    </select>
                  </div>
                  <div class="field">
                    <label class="label" for="zip">郵遞區號</label>
                    <input id="zip" class="input" type="text" inputmode="numeric" value={mail.zip} oninput={onZipInput} placeholder="3 碼" maxlength="6" />
                  </div>
                </div>
                <div class="field">
                  <label class="label" for="addr">詳細地址</label>
                  <input id="addr" class="input" type="text" bind:value={mail.address} placeholder="路 / 街 / 巷弄 / 號 / 樓" />
                </div>
              </div>
            {/if}

            <!-- 素食 -->
            <label class="toggle">
              <input type="checkbox" bind:checked={isVeg} onchange={onToggleVeg} />
              <span class="track"><span class="thumb"></span></span>
              <span class="toggle-label">需要素食餐</span>
            </label>

            {#if isVeg}
              <div class="reveal stepper-row" transition:slide={{ duration: 350, easing: quintOut }}>
                <span class="label" style="margin:0">素食人數</span>
                <div class="stepper">
                  <button type="button" onclick={() => setVeg(vegCount - 1)} disabled={vegCount <= 1}>−</button>
                  <span class="stepper-val">{vegCount}</span>
                  <button type="button" onclick={() => setVeg(vegCount + 1)} disabled={vegCount >= partySize}>＋</button>
                </div>
                <small class="hint">上限 {partySize} 位</small>
              </div>
            {/if}

            <!-- 留言 -->
            <div class="field">
              <label class="label" for="msg">想對我們說的話 <small>（選填）</small></label>
              <textarea id="msg" class="input textarea" rows="3" bind:value={message} placeholder="留下你的祝福，或任何想讓我們知道的事 ♡"></textarea>
            </div>
          </div>
        {:else if attending === 'no'}
          <div in:fade={{ duration: 400 }}>
            <div class="field">
              <label class="label" for="noname">姓名</label>
              <input id="noname" class="input" type="text" bind:value={attendees[0].name} placeholder="請輸入您的姓名" />
            </div>
            <div class="field">
              <label class="label" for="nomsg">想對我們說的話 <small>（選填）</small></label>
              <textarea id="nomsg" class="input textarea" rows="3" bind:value={message} placeholder="雖然無法到場，也想說一句…"></textarea>
            </div>
          </div>
        {/if}

        {#if errors.length}
          <div class="errors" in:fade>
            {#each errors as msg}<div class="error-item">· {msg}</div>{/each}
          </div>
        {/if}

        {#if submitError}
          <div class="errors" in:fade><div class="error-item">· {submitError}</div></div>
        {/if}

        {#if attending}
          <button type="submit" class="submit" in:fade disabled={saving}>
            {saving ? '送出中…' : editToken || loadedExisting ? '更新回覆' : '送出回覆'}
          </button>
        {/if}
      </form>
    {:else}
      <!-- 確認頁 -->
      <div class="confirm" in:fade={{ duration: 500 }}>
        <div class="check" in:scale={{ duration: 600, easing: backOut }}>
          <svg viewBox="0 0 52 52" width="64" height="64"><circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M16 27l7 7 14-15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </div>
        {#if attending === 'yes'}
          <h3>{wasUpdate ? '回覆已更新！' : '感謝你的回覆！'}</h3>
          <p class="confirm-sub">我們已收到你的出席資訊，期待 8/1 與你相見 ♡</p>
          <div class="confirm-summary">
            <div><span>出席人數</span><b>{partySize} 位</b></div>
            {#if isVeg}<div><span>素食</span><b>{vegCount} 位</b></div>{/if}
            <div><span>郵寄喜帖</span><b>{needInvite ? '需要' : '不需要'}</b></div>
          </div>
        {:else}
          <h3>謝謝你的祝福！</h3>
          <p class="confirm-sub">雖然這次無法相聚，你的心意我們都收到了。</p>
        {/if}
        <div class="info-actions">
          <button type="button" class="ghost-btn" onclick={editAgain}>修改回覆</button>
        </div>
      </div>
    {/if}
  </section>

  <footer class="foot">
    <p class="foot-couple">Kyle &amp; Sandy</p>
    <p class="foot-date">2026 . 08 . 01</p>
  </footer>
  </div>
</main>

<style>
  .wrap {
    max-width: 600px;
    margin: 0 auto;
    padding: 26px 18px 48px;
  }

  /* ── HERO（婚紗照主視覺：完整不裁切，文字鎖底部草地區，跨裝置不蓋臉）── */
  .hero {
    position: relative;
    width: 100%;
    max-width: 620px;
    margin: 0 auto;
    background: #1f3a5f;
    line-height: 0;
    overflow: hidden;
  }
  .hero-photo {
    display: block;
    width: 100%;
    height: auto;
  }
  .hero-text {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    /* 上方留大內距＝漸層淡出＋安全區，% 隨寬度等比縮放 */
    padding: 26% 22px 30px;
    text-align: center;
    color: #fff;
    line-height: 1.6;
    background: linear-gradient(
      to top,
      rgba(16, 28, 46, 0.86) 0%,
      rgba(16, 28, 46, 0.62) 38%,
      rgba(16, 28, 46, 0.16) 72%,
      rgba(16, 28, 46, 0) 100%
    );
  }
  .kicker {
    font-family: var(--serif-en);
    letter-spacing: 0.42em;
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.86);
    text-transform: uppercase;
    margin: 0 0 14px;
    padding-left: 0.42em;
  }
  .couple {
    font-family: var(--serif-en);
    font-weight: 500;
    font-size: clamp(3.1rem, 13vw, 5rem);
    line-height: 1.05;
    margin: 0;
    color: #fff;
    text-shadow: 0 2px 28px rgba(8, 18, 32, 0.45);
  }
  .couple .amp {
    color: var(--coral);
    font-style: italic;
    font-weight: 400;
    margin: 0 0.06em;
  }
  .ornament {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: var(--coral);
    margin: 20px 0;
  }
  .ornament .line {
    height: 1px;
    width: 56px;
    background: linear-gradient(to right, transparent, currentColor);
  }
  .ornament .line:last-child {
    background: linear-gradient(to left, transparent, currentColor);
  }
  .hero-date {
    font-family: var(--serif-en);
    font-size: 1.55rem;
    letter-spacing: 0.18em;
    color: #fff;
    margin: 0;
    text-shadow: 0 2px 20px rgba(8, 18, 32, 0.4);
  }
  .hero-date .weekday {
    font-family: var(--sans);
    font-size: 0.72rem;
    letter-spacing: 0.32em;
    color: rgba(255, 255, 255, 0.82);
  }

  /* ── 卡片 ── */
  .card {
    background: var(--card);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 30px 26px;
    margin-bottom: 22px;
  }

  /* ── 前言 ── */
  .intro {
    text-align: center;
    padding: 30px 14px 26px;
  }
  .intro-en {
    display: block;
    font-family: var(--serif-tc);
    font-size: 1.1rem;
    font-style: italic;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--accent);
    margin: 0 0 18px;
  }
  .intro-en::before,
  .intro-en::after {
    content: '—';
    margin: 0 0.55em;
    color: var(--line);
    font-style: normal;
    letter-spacing: 0;
  }
  .intro-text {
    font-family: var(--serif-tc);
    font-size: 1.04rem;
    line-height: 2.1;
    color: var(--ink);
    margin: 0;
    letter-spacing: 0.02em;
  }

  /* ── 我的婚禮資訊（賓客）── */
  .guest {
    text-align: center;
  }
  .guest-title {
    font-family: var(--serif-tc);
    font-size: 1.15rem;
    color: var(--ink);
    margin: 0 0 14px;
  }
  .guest-row {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 14px;
    margin-bottom: 14px;
  }
  .guest-row span {
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .guest-row b {
    font-family: var(--serif-en);
    font-size: 1.8rem;
    color: var(--coral);
  }
  .guest-hint {
    color: var(--ink-soft);
    font-size: 0.9rem;
    margin: 0 0 14px;
  }
  .album-btn {
    display: block;
    margin-top: 12px;
    text-decoration: none;
  }

  /* ── 資訊卡 ── */
  .info-date {
    text-align: center;
    font-family: var(--serif-tc);
    font-size: 1.05rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    color: var(--accent-deep);
    padding-bottom: 14px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--line-soft);
  }
  .info-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
  }
  .info-label {
    letter-spacing: 0.12em;
    color: var(--ink-soft);
    font-size: 0.92rem;
  }
  .info-value {
    font-family: var(--serif-en);
    font-size: 1.12rem;
    color: var(--accent-deep);
    white-space: nowrap;
  }
  .hr {
    height: 1px;
    background: var(--line);
    margin: 16px 0;
  }
  .venue {
    text-align: center;
    margin: 4px 0 18px;
  }
  .venue-name {
    font-family: var(--serif-tc);
    font-size: 1.4rem;
    font-weight: 600;
    margin: 0;
  }
  .venue-hall {
    color: var(--accent-deep);
    letter-spacing: 0.12em;
    margin: 2px 0;
  }
  .venue-addr {
    color: var(--ink-soft);
    font-size: 0.9rem;
    margin: 6px 0 0;
  }
  .info-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  .ghost-btn {
    flex: 1;
    text-align: center;
    text-decoration: none;
    border: 1px solid var(--accent);
    color: var(--accent-deep);
    background: transparent;
    border-radius: var(--radius-pill);
    padding: 11px 16px;
    font-size: 0.92rem;
    letter-spacing: 0.08em;
    transition: 0.2s;
  }
  .ghost-btn:hover {
    background: var(--accent-soft);
  }

  /* ── 區塊標題 ── */
  .section-title {
    text-align: center;
    font-family: var(--serif-tc);
    font-weight: 600;
    font-size: 1.45rem;
    margin: 0 0 24px;
    letter-spacing: 0.1em;
  }
  .section-title span {
    display: block;
    font-family: var(--serif-en);
    font-size: 0.8rem;
    letter-spacing: 0.4em;
    color: var(--accent);
    margin-top: 4px;
  }

  /* ── 出席選擇 ── */
  .choice-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 8px;
  }
  .choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 22px 12px;
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    transition: 0.22s;
  }
  .choice:hover {
    border-color: var(--accent);
  }
  .choice.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    box-shadow: var(--shadow-sm);
  }
  .choice-mark {
    font-size: 1.4rem;
    color: var(--coral);
  }
  .choice-title {
    font-size: 1.05rem;
    font-weight: 500;
  }
  .choice-sub {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }

  /* ── 即時人數 ── */
  .counter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 26px 0 8px;
    color: var(--ink-soft);
    letter-spacing: 0.1em;
  }
  .counter-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 46px;
    height: 46px;
    padding: 0 8px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-family: var(--serif-en);
    font-size: 1.6rem;
  }

  /* ── 欄位 ── */
  .field {
    margin: 18px 0;
  }
  .label {
    display: block;
    font-size: 0.86rem;
    letter-spacing: 0.08em;
    color: var(--ink-soft);
    margin-bottom: 8px;
  }
  .label small {
    color: var(--ink-faint);
  }
  .input {
    width: 100%;
    padding: 12px 14px;
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    outline: none;
    transition: 0.18s;
  }
  .input:focus {
    border-color: var(--accent);
    background: #fff;
    box-shadow: 0 0 0 4px var(--accent-soft);
  }
  .select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%238c6b38' stroke-width='1.5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 36px;
  }
  .textarea {
    resize: vertical;
    line-height: 1.7;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .grid3 {
    display: grid;
    grid-template-columns: 1.1fr 1.1fr 0.8fr;
    gap: 10px;
  }

  /* ── pills ── */
  .pills {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .pills-join {
    color: var(--ink-soft);
    margin: 0 2px;
  }
  .pill {
    padding: 8px 18px;
    border-radius: var(--radius-pill);
    border: 1.5px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    font-size: 0.92rem;
    transition: 0.18s;
  }
  .pill:hover {
    border-color: var(--accent);
  }
  .pill.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .pills.small .pill {
    padding: 6px 14px;
    font-size: 0.84rem;
  }

  /* ── toggle ── */
  .toggle {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 0;
    border-top: 1px solid var(--line-soft);
    margin-top: 8px;
    cursor: pointer;
  }
  .toggle input {
    display: none;
  }
  .track {
    position: relative;
    width: 46px;
    height: 26px;
    border-radius: 13px;
    background: var(--line);
    transition: 0.25s;
    flex: none;
  }
  .thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.18);
    transition: 0.25s;
  }
  .toggle input:checked + .track {
    background: var(--accent);
  }
  .toggle input:checked + .track .thumb {
    transform: translateX(20px);
  }
  .toggle-label {
    font-size: 0.98rem;
  }

  .reveal {
    padding: 4px 0 8px;
  }
  .attendee {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--bg);
    border-radius: var(--radius);
    margin-bottom: 10px;
  }

  /* ── stepper ── */
  .stepper-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    border: 1.5px solid var(--line);
    border-radius: var(--radius-pill);
    overflow: hidden;
  }
  .stepper button {
    width: 40px;
    height: 40px;
    border: none;
    background: var(--bg);
    font-size: 1.2rem;
    color: var(--accent-deep);
  }
  .stepper button:disabled {
    color: var(--ink-faint);
  }
  .stepper-val {
    width: 44px;
    text-align: center;
    font-family: var(--serif-en);
    font-size: 1.3rem;
  }
  .hint {
    color: var(--ink-faint);
    font-size: 0.82rem;
  }

  /* ── 回訪提示 ── */
  .notice {
    background: var(--accent-soft);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 11px 15px;
    font-size: 0.88rem;
    color: var(--accent-deep);
    margin-bottom: 18px;
  }

  /* ── errors ── */
  .errors {
    background: #fbeeec;
    border: 1px solid #eccac5;
    border-radius: var(--radius);
    padding: 12px 16px;
    margin: 16px 0 4px;
  }
  .error-item {
    color: var(--danger);
    font-size: 0.88rem;
  }

  /* ── submit ── */
  .submit {
    width: 100%;
    margin-top: 22px;
    padding: 16px;
    border: none;
    border-radius: var(--radius-pill);
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    font-size: 1.05rem;
    letter-spacing: 0.16em;
    box-shadow: 0 12px 26px rgba(140, 107, 56, 0.28);
    transition: 0.2s;
  }
  .submit:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 32px rgba(140, 107, 56, 0.34);
  }
  .submit:disabled {
    opacity: 0.6;
    transform: none;
    cursor: default;
  }

  /* ── 確認頁 ── */
  .confirm {
    text-align: center;
    padding: 14px 0 8px;
  }
  .check {
    color: var(--accent);
    margin-bottom: 6px;
  }
  .confirm h3 {
    font-family: var(--serif-tc);
    font-size: 1.4rem;
    margin: 6px 0;
  }
  .confirm-sub {
    color: var(--ink-soft);
    margin: 0 0 18px;
  }
  .confirm-summary {
    display: inline-flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bg);
    border-radius: var(--radius);
    padding: 16px 26px;
    margin-bottom: 20px;
  }
  .confirm-summary div {
    display: flex;
    justify-content: space-between;
    gap: 28px;
  }
  .confirm-summary span {
    color: var(--ink-soft);
  }

  /* ── footer ── */
  .foot {
    text-align: center;
    padding: 22px 0 8px;
    color: var(--ink-soft);
  }
  .foot-couple {
    font-family: var(--serif-en);
    font-size: 1.3rem;
    margin: 0;
  }
  .foot-date {
    letter-spacing: 0.24em;
    font-size: 0.78rem;
    margin: 4px 0 0;
  }
</style>
