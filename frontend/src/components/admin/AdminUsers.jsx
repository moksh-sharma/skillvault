import { useState, useEffect } from 'react'
import { getPlatformAdminUsers, deletePlatformUser, getEmployeeList, sendAdminInvite } from '../../config/api'
import { emitAdminActivity } from '../../utils/adminActivity'
import './AdminUsers.css'

const INVITE_ROLES = ['Admin', 'Talent Acquisition', 'HR']

const formatRole = (mode) => {
  if (!mode) return 'ADMINISTRATOR'
  return mode.replace(/_/g, ' ').toUpperCase()
}

const buildInviteMessage = (loginId, temporaryPassword, setPasswordLink) => {
  return `Login ID (email): ${loginId}\nTemporary password: ${temporaryPassword}\n\nSet your password and access the portal:\n${setPasswordLink}`
}

const buildInviteMessageTemplate = (email) => {
  return `Login ID (email): ${email}\nTemporary password: [will be sent]\n\nSet your password and access the portal:\n[link will be sent]`
}

/** Extract the temporary password from the modal message (value after "Temporary password:"). Returns null if placeholder or missing. */
const extractTemporaryPasswordFromMessage = (message) => {
  if (!message || typeof message !== 'string') return null
  const match = message.match(/temporary password:\s*([^\n\r]+)/i)
  if (!match) return null
  const value = (match[1] || '').trim()
  if (!value || value === '[will be sent]') return null
  return value
}

/** Extract the portal link from the modal message. Prefer the line after "Set your password...", else any line that looks like a URL. */
const extractPortalLinkFromMessage = (message) => {
  if (!message || typeof message !== 'string') return null
  const lines = message.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const placeholder = '[link will be sent]'
  const isPlaceholder = (s) => !s || s === placeholder
  const isUrlLine = (s) => (s.startsWith('http://') || s.startsWith('https://')) && !isPlaceholder(s)
  const headingIdx = lines.findIndex((l) => /set your password and access the portal/i.test(l))
  if (headingIdx >= 0) {
    for (let i = headingIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('http://') || line.startsWith('https://')) {
        if (!isPlaceholder(line)) return line
        break
      }
    }
  }
  const urlLine = lines.find(isUrlLine)
  if (urlLine) return urlLine
  const lineWithUrl = lines.find((l) => l.includes('http://') || l.includes('https://'))
  if (lineWithUrl && !lineWithUrl.includes(placeholder)) {
    const match = lineWithUrl.match(/(https?:\/\/[^\s]+)/)
    if (match) return match[1].replace(/[.,)]+$/, '')
  }
  return null
}

const AdminUsers = () => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [employees, setEmployees] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('Admin')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMessage, setInviteMessage] = useState(null)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteModalBody, setInviteModalBody] = useState('')

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await getPlatformAdminUsers()
      setUsers(res?.users ?? [])
    } catch (err) {
      console.error('Error loading platform users:', err)
      setError(err.message || 'Failed to load users')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  const fetchEmployees = async () => {
    try {
      const res = await getEmployeeList({ limit: 500 })
      setEmployees(res?.items ?? [])
    } catch (err) {
      console.error('Error loading employee list:', err)
      setEmployees([])
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchEmployees()
  }, [])

  const handleOpenInviteModal = (e) => {
    e.preventDefault()
    if (!inviteEmail?.trim()) return
    setInviteMessage(null)
    setInviteModalBody(buildInviteMessageTemplate(inviteEmail.trim()))
    setInviteModalOpen(true)
  }

  const handleDoneSendInvite = async () => {
    if (!inviteEmail?.trim()) return
    setInviteMessage(null)
    setInviteLoading(true)
    const customLink = extractPortalLinkFromMessage(inviteModalBody)
    const customPassword = extractTemporaryPasswordFromMessage(inviteModalBody)
    const payload = { email: inviteEmail.trim(), role: inviteRole }
    if (customLink) payload.custom_set_password_link = customLink
    if (customPassword) payload.temporary_password = customPassword
    try {
      const res = await sendAdminInvite(payload)
      setInviteMessage({ type: 'success', text: res?.message ?? 'Invite sent.' })
      setInviteEmail('')
      setInviteModalOpen(false)
      fetchUsers()
      emitAdminActivity({ type: 'admin_invite', email: payload.email })
    } catch (err) {
      setInviteMessage({ type: 'error', text: err.message || err.detail || 'Failed to send invite' })
    } finally {
      setInviteLoading(false)
    }
  }

  const handleCancelInvite = () => {
    setInviteModalOpen(false)
  }

  const handleDelete = async (user) => {
    if (!window.confirm(`Remove "${user.name}" (${user.email}) from platform? This will delete their credentials from the database.`)) return
    try {
      setDeletingId(user.id)
      setError(null)
      await deletePlatformUser(user.id)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    } catch (err) {
      setError(err.message || err.detail || 'Failed to delete user')
    } finally {
      setDeletingId(null)
    }
  }

  const invitedEmails = new Set((users || []).map((u) => (u.email || '').toLowerCase()))
  const hasAccessEmails = new Set(
    (users || []).filter((u) => u.has_logged_in).map((u) => (u.email || '').toLowerCase())
  )

  return (
    <div className="admin-users-page">
      <h2 className="admin-users-heading">Users</h2>

      <div className="invite-user-section">
        <h3 className="invite-user-heading">Invite to Admin Portal</h3>
        <form onSubmit={handleOpenInviteModal} className="invite-user-form">
          <div className="invite-user-row">
            <label htmlFor="invite-employee">Employee (email)</label>
            <select
              id="invite-employee"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="invite-user-select"
              required
            >
              <option value="">Select an employee…</option>
              {(employees || []).map((emp) => {
                const emailLower = (emp.email || '').toLowerCase()
                const invited = invitedEmails.has(emailLower)
                const hasAccess = hasAccessEmails.has(emailLower)
                return (
                  <option key={emp.email} value={emp.email} disabled={invited}>
                    {emp.full_name || emp.email} ({emp.email}){invited ? (hasAccess ? ' - already has access' : ' - invite sent') : ''}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="invite-user-row">
            <label htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="invite-user-select"
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {inviteMessage && (
            <div className={inviteMessage.type === 'success' ? 'invite-user-success' : 'admin-users-error'}>
              {inviteMessage.text}
            </div>
          )}
          <button type="submit" className="invite-user-btn" disabled={!inviteEmail}>
            Send invite
          </button>
        </form>
      </div>

      {inviteModalOpen && (
        <div
          className="invite-modal-overlay"
          onClick={handleCancelInvite}
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-modal-title"
        >
          <div className="invite-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="invite-modal-title" className="invite-modal-title">Invite message</h3>
            <p className="invite-modal-hint">
              Review the message below. You can set a password by replacing &quot;[will be sent]&quot; with your chosen password, or leave it to use a generated one. Click Done to send the invite email, or Cancel to close without sending.
            </p>
            <textarea
              className="invite-modal-textarea"
              value={inviteModalBody}
              onChange={(e) => setInviteModalBody(e.target.value)}
              rows={8}
              spellCheck={false}
            />
            <div className="invite-modal-actions">
              <button type="button" className="invite-modal-btn invite-modal-cancel" onClick={handleCancelInvite}>
                Cancel
              </button>
              <button
                type="button"
                className="invite-modal-btn invite-modal-send"
                onClick={handleDoneSendInvite}
                disabled={inviteLoading}
              >
                {inviteLoading ? 'Sending…' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="admin-users-error">{error}</div>
      )}

      {loading ? (
        <div className="admin-users-loading">Loading users…</div>
      ) : users.length === 0 ? (
        <div className="admin-users-empty">No platform users found.</div>
      ) : (
        <div className="platform-admins-section">
          <table className="platform-admins-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Employee ID</th>
                <th>Role</th>
                <th>Status</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="platform-admin-name">{u.name}</td>
                  <td className="platform-admin-email">{u.email}</td>
                  <td className="platform-admin-id">{u.employee_id || '-'}</td>
                  <td className="platform-admin-role">{formatRole(u.mode)}</td>
                  <td className={`platform-admin-status ${u.has_logged_in ? 'status-logged-in' : 'status-invite-sent'}`}>
                    {u.has_logged_in ? 'User logged in' : 'Invite sent'}
                  </td>
                  <td className="platform-admin-actions">
                    {(u.mode || '').toLowerCase() === 'admin' ? (
                      <span className="platform-admin-no-remove" title="Admin users cannot be removed">
                        -
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="admin-user-delete-btn"
                        onClick={() => handleDelete(u)}
                        disabled={deletingId === u.id}
                        title="Remove user from platform (delete credentials)"
                      >
                        {deletingId === u.id ? '…' : 'Remove'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminUsers
