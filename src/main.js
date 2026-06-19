import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'
import Admin from './Admin.svelte'

// 路由：/admin → 管理後台，其餘 → RSVP 表單
const path = location.pathname.replace(/\/+$/, '')
const isAdmin = path.endsWith('/admin')

const app = mount(isAdmin ? Admin : App, {
  target: document.getElementById('app'),
})

export default app
