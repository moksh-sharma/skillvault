import { useState } from 'react'
import { motion } from 'framer-motion'
import './AdminPortalLinks.css'

const portalLinks = [
  { label: 'Guest Portal', path: '/guest' },
  { label: 'Freelancer Portal', path: '/freelancer' },
  { label: 'Company Employee Portal', path: '/employee' }
]

const getPublicOrigin = () => {
  const envOrigin = (import.meta.env.VITE_PUBLIC_BASE_URL || '').trim()
  if (envOrigin) {
    return envOrigin.replace(/\/+$/, '')
  }
  return 'http://172.16.200.30:3005'
}

const getPortalPublicUrl = (path) => {
  return `${getPublicOrigin()}${path}`
}

const AdminPortalLinks = () => {
  const [copiedLink, setCopiedLink] = useState(null)

  const copyPortalLink = (path) => {
    const url = getPortalPublicUrl(path)

    const doCopy = () => {
      setCopiedLink(path)
      setTimeout(() => setCopiedLink(null), 2000)
    }

    const fallbackCopy = () => {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '0'
      document.body.appendChild(textarea)
      textarea.select()
      textarea.setSelectionRange(0, url.length)
      try {
        const ok = document.execCommand('copy')
        if (ok) doCopy()
      } finally {
        document.body.removeChild(textarea)
      }
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(doCopy).catch(fallbackCopy)
    } else {
      fallbackCopy()
    }
  }

  return (
    <div className="admin-portal-links">
      <div className="portal-links-header">
        <h2>Portal Links</h2>
      </div>
      <motion.div
        className="portal-links-section"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="portal-links-list">
          {portalLinks.map(({ label, path }) => {
            const url = getPortalPublicUrl(path)
            const isCopied = copiedLink === path
            return (
              <div key={path} className="portal-link-row">
                <span className="portal-link-label">{label}</span>
                <code className="portal-link-url">{url}</code>
                <button
                  type="button"
                  className="portal-link-copy-btn"
                  onClick={() => copyPortalLink(path)}
                  title="Copy link"
                >
                  {isCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}

export default AdminPortalLinks
