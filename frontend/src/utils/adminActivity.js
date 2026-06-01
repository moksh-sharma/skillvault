/** Notify admin navbar to refresh notifications after platform activity. */
export function emitAdminActivity(detail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('adminActivity', { detail }))
  window.dispatchEvent(new CustomEvent('resumeUploaded', { detail }))
}
