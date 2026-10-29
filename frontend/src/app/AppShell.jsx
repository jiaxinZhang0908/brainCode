import { NavLink, Outlet, useLocation } from 'react-router-dom'

const links = [
  { to: '/', label: '今日主页', icon: '◷', end: true },
  { to: '/brain', label: '大脑外置', icon: '⌘' },
  { to: '/review', label: '复习工具', icon: '↻' },
]

export default function AppShell() {
  const { pathname } = useLocation()
  const home = pathname === '/'
  return <div className="app-shell">
    <header className="topbar glass-surface">
      <NavLink to="/" className="brand"><span className="brand-mark">芽</span><div><strong>脑内花园</strong><small>PERSONAL LEARNING SPACE</small></div></NavLink>
      <nav className="top-nav">{links.map(link => <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
        <span className="nav-icon">{link.icon}</span>{link.label}
      </NavLink>)}</nav>
      <div className="topbar-note"><i /> 慢慢来，比较快</div>
    </header>
    <main className={`main-area ${home ? 'home-scene' : ''}`}><Outlet /></main>
  </div>
}
