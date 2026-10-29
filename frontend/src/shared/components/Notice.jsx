export default function Notice({ error, children }) {
  if (!error && !children) return null
  return <div className={`notice ${error ? 'notice-error' : ''}`} role="status">{error || children}</div>
}
