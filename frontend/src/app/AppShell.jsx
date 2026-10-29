import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { to: '/', label: '今日主页', icon: '◷', end: true },
  { to: '/brain', label: '大脑外置', icon: '⌘' },
  { to: '/review', label: '复习工具', icon: '↻' },
]

export default function AppShell() {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">芽</span><div><strong>脑内花园</strong><small>PERSONAL LEARNING SPACE</small></div></div>
      <div className="nav-label">工作台</div>
      <nav>{links.map(link => <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
        <span className="nav-icon">{link.icon}</span>{link.label}<span className="nav-arrow">↗</span>
      </NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="weather-dot" /><div><span>慢慢来，比较快</span><small>每天一点点就很好</small></div></div>
    </aside>
    <main className="main-area"><Outlet /></main>
  </div>
}
