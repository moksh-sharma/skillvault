import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { API_BASE_URL, getAdminNotifications } from '../config/api'
import { APP_NAME, ADMIN_DASHBOARD_PATH } from '../config/brand'
import { WOMEN_OWNED_LOGO_SRC, CACHE_LOGO_SRC } from '../config/brandAssets'
import './Navbar.css'

const Navbar = ({
  userProfile,
  showAdminToggle = false,
  showProfile = true,
  showLogout = true,
  adminTabs,
  activeTab,
  setActiveTab,
  centerHeading,
  onStartGuide,
  guideHighlightTab,
}) => {
  const props = { adminTabs, activeTab, setActiveTab }
  const isPortalMode = !!centerHeading // Helper to keep the previous code working without changing 'props.' prefixes everywhere in the previous step instruction context, or I can just fix the usage in previous step. Actually, the Previous Step inserted `props.adminTabs`. So I need `props` to be defined. 
  // BETTER STRATEGY: Update the signature to `const Navbar = (props) => { const { userProfile, showAdminToggle = false, showProfile = true } = props; ...`
  // But that changes too much. 
  // I will just add the new props to destructuring and assign them to a 'props' object effectively or just change the signature to accept `props` directly and destructure userProfile etc from it.

  // Let's go with: const Navbar = (props) => { const { userProfile, showAdminToggle = false, showProfile = true } = props;

  const navigate = useNavigate()
  const { logout } = useApp()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const notificationsRef = useRef(null)

  const fetchNotifications = async (showLoading = false) => {
    if (!adminTabs) return
    try {
      if (showLoading) setNotificationsLoading(true)
      const data = await getAdminNotifications({ limit: 40, days: 14 })
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count ?? 0)
    } catch (e) {
      setNotifications([])
      setUnreadCount(0)
    } finally {
      setNotificationsLoading(false)
    }
  }

  useEffect(() => {
    if (!adminTabs) return
    const refresh = () => fetchNotifications(false)
    fetchNotifications(true)
    const interval = setInterval(refresh, 30000)
    const onActivity = () => refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('resumeUploaded', onActivity)
    window.addEventListener('adminActivity', onActivity)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('resumeUploaded', onActivity)
      window.removeEventListener('adminActivity', onActivity)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [adminTabs])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) setNotificationsOpen(false)
    }
    if (notificationsOpen) document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [notificationsOpen])

  const handleAdminToggle = () => {
    navigate(ADMIN_DASHBOARD_PATH)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <motion.nav
      className="navbar"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="navbar-container">
        <div className="navbar-left">
          <img
            src={CACHE_LOGO_SRC}
            alt="CACHE"
            className="navbar-cache-logo"
          />
          {showProfile && (
            <button
              className="profile-button"
              onClick={() => navigate('/profile')}
              aria-label="Profile"
            >
              <div className="profile-avatar">
                {userProfile?.profile_img ? (
                  <img
                    src={userProfile.profile_img.startsWith('http') ? userProfile.profile_img : `${API_BASE_URL.replace('/api', '')}${userProfile.profile_img}`}
                    alt="Profile"
                    className="navbar-avatar-img"
                  />
                ) : (
                  userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : 'U'
                )}
              </div>
            </button>
          )}
        </div>

        <div className="navbar-brand-center">
          {centerHeading ? (
            <h1 className="navbar-center-heading-text">{centerHeading}</h1>
          ) : (
            <motion.h1
              className="navbar-heading navbar-heading--gradient"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => !isPortalMode && navigate(ADMIN_DASHBOARD_PATH)}
              style={{ cursor: isPortalMode ? 'default' : 'pointer' }}
            >
              {APP_NAME}
            </motion.h1>
          )}
        </div>

        {/* Central Admin Tabs */}
        {props.adminTabs && (
          <div className="navbar-center-tabs">
            {props.adminTabs.map((tab) => (
              <motion.button
                key={tab.id}
                type="button"
                data-guide-tab={tab.id}
                className={`nav-glass-tab ${tab.colorClass} ${props.activeTab === tab.id ? 'active' : ''} ${guideHighlightTab === tab.id ? 'guide-highlight-tab' : ''}`}
                onClick={() => props.setActiveTab(tab.id)}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </motion.button>
            ))}
            {onStartGuide && (
              <motion.button
                type="button"
                className="nav-glass-tab nav-guide-tab"
                data-guide="admin-guide-btn"
                onClick={onStartGuide}
                title="How to use SkillVault"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span className="tab-icon guide-tab-icon">?</span>
                <span className="tab-label">Guide</span>
              </motion.button>
            )}
          </div>
        )}

        <div className="navbar-actions">
          {showAdminToggle && (
            <button
              className="admin-toggle"
              onClick={handleAdminToggle}
            >
              Admin
            </button>
          )}

          {adminTabs && (
            <div className="navbar-notification-wrap" ref={notificationsRef}>
              <button
                type="button"
                className="navbar-notification-bell"
                onClick={() => setNotificationsOpen((o) => !o)}
                title="Notifications"
                aria-label="Notifications"
              >
                <span className="navbar-notification-bell-icon">🔔</span>
                {unreadCount > 0 && !notificationsOpen && (
                  <span className="navbar-notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </button>
              {notificationsOpen && (
                <div className="navbar-notification-dropdown">
                  <div className="navbar-notification-dropdown-header">
                    <span>Notifications</span>
                    <button type="button" className="navbar-notification-dropdown-refresh" onClick={() => fetchNotifications(true)} disabled={notificationsLoading}>
                      {notificationsLoading ? '…' : '↻'}
                    </button>
                  </div>
                  <div className="navbar-notification-dropdown-list">
                    {notifications.length === 0 && !notificationsLoading && (
                      <div className="navbar-notification-empty">No recent notifications</div>
                    )}
                    {notifications.slice(0, 20).map((n) => (
                      <div key={n.id || n.resume_id} className={`navbar-notification-item navbar-notification-item--${n.type || 'default'}`}>
                        {n.type === 'login' && <span className="navbar-notification-type-tag navbar-notification-type-tag--login">Login</span>}
                        {n.type === 'job_application' && <span className="navbar-notification-type-tag navbar-notification-type-tag--job">Application</span>}
                        {(n.type === 'resume_upload' || n.type === 'email_fetch') && (
                          <span className="navbar-notification-type-tag navbar-notification-type-tag--resume">Resume</span>
                        )}
                        {n.type === 'job_created' && <span className="navbar-notification-type-tag navbar-notification-type-tag--job-created">New job</span>}
                        {n.type === 'job_updated' && <span className="navbar-notification-type-tag navbar-notification-type-tag--job-updated">Job update</span>}
                        {n.type === 'jd_analysis' && <span className="navbar-notification-type-tag navbar-notification-type-tag--jd">JD search</span>}
                        {n.type === 'employee_list' && <span className="navbar-notification-type-tag navbar-notification-type-tag--employees">Roster</span>}
                        {n.type === 'admin_invite' && <span className="navbar-notification-type-tag navbar-notification-type-tag--invite">Invite</span>}
                        {n.type === 'user_registered' && <span className="navbar-notification-type-tag navbar-notification-type-tag--signup">Signup</span>}
                        <div className="navbar-notification-message">{n.message}</div>
                        <div className="navbar-notification-time">
                          {n.timestamp ? new Date(n.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {showLogout && (
            <button
              className="logout-button-nav"
              onClick={handleLogout}
              title="Logout"
            >
              Logout
            </button>
          )}

          <img
            src={WOMEN_OWNED_LOGO_SRC}
            alt="Women Owned"
            className="navbar-women-logo"
          />
        </div>
      </div>
    </motion.nav>
  )
}

export default Navbar

