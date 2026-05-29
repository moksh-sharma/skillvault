import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getProfile, uploadProfilePhoto, removeProfilePhoto, deletePlatformUser, API_BASE_URL } from '../config/api'
import { ADMIN_DASHBOARD_PATH } from '../config/brand'
import Navbar from '../components/Navbar'
import CyberBackground from '../components/admin/CyberBackground'
import './Profile.css'

const PLATFORM_MODES = ['admin', 'hr', 'talent_acquisition', 'talent acquisition']

const Profile = () => {
  const navigate = useNavigate()
  const { userProfile, logout, setUserProfile, darkMode, setDarkMode } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const fileInputRef = useRef(null)

  const isPlatformUser = PLATFORM_MODES.includes((userProfile?.mode || '').toLowerCase())

  // Use profile_img from backend profile data
  const profileImg = userProfile?.profile_img
    ? (userProfile.profile_img.startsWith('http') ? userProfile.profile_img : `${API_BASE_URL.replace('/api', '')}${userProfile.profile_img}`)
    : null

  const formatRole = (mode) => {
    if (!mode) return 'ADMINISTRATOR'
    return mode.replace(/_/g, ' ').toUpperCase()
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (file) {
      try {
        setLoading(true)
        setError('')
        const updatedUser = await uploadProfilePhoto(file)
        setUserProfile(prev => ({
          ...prev,
          profile_img: updatedUser.profile_img
        }))
      } catch (err) {
        console.error('Photo upload error:', err)
        setError('Mainframe rejected the image upload.')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleImageRemove = async () => {
    if (!userProfile?.profile_img) return

    try {
      setLoading(true)
      setError('')
      const result = await removeProfilePhoto()
      setUserProfile(prev => ({
        ...prev,
        profile_img: result.profile_img || null
      }))
    } catch (err) {
      console.error('Photo remove error:', err)
      setError('Failed to purge profile image from mainframe.')
    } finally {
      setLoading(false)
    }
  }

  const triggerFileInput = () => {
    // Using ref for direct DOM access
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleLeavePlatform = async () => {
    if (!userProfile?.id) return
    if (!window.confirm('Are you sure you want to leave the platform? Your account will be removed and you will be logged out.')) return
    try {
      setLeaving(true)
      setError('')
      await deletePlatformUser(userProfile.id)
      logout()
      navigate('/')
    } catch (err) {
      console.error('Leave platform error:', err)
      setError(err.message || err.detail || 'Failed to leave platform.')
    } finally {
      setLeaving(false)
    }
  }

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const profile = await getProfile()
        const mergedProfile = {
          ...userProfile,
          ...profile,
          role: formatRole(profile.mode || userProfile?.mode || userProfile?.role)
        }
        setUserProfile(mergedProfile)
      } catch (err) {
        console.error('Error loading profile:', err)
        setError('Could not sync profile with mainframe.')
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  return (
    <div className="profile-page">
      <CyberBackground />
      <Navbar userProfile={userProfile} />

      <div className="profile-container">
        <motion.div
          className="profile-card-cyber"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {/* Header with Glow Avatar */}
          <div className="profile-header-cyber">
            <div className="avatar-section-wrapper">
              <div className="avatar-upload-wrapper" onClick={triggerFileInput}>
                <div className="profile-avatar-glow">
                  {profileImg ? (
                    <img src={profileImg} alt="Profile" className="avatar-img" />
                  ) : (
                    userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : 'A'
                  )}
                  <div className="avatar-ring"></div>
                  <div className="avatar-overlay">
                    <span className="upload-icon">📷</span>
                  </div>
                </div>
                <input
                  type="file"
                  id="profile-upload-input"
                  hidden
                  accept="image/*"
                  onChange={handleImageUpload}
                  ref={fileInputRef}
                />
              </div>
              <div className="avatar-action-buttons">
                <button
                  className="avatar-action-btn upload-btn"
                  onClick={triggerFileInput}
                  disabled={loading}
                  title="Upload photo"
                >
                  📷
                </button>
                <button
                  className="avatar-action-btn remove-btn"
                  onClick={handleImageRemove}
                  disabled={loading || !userProfile?.profile_img}
                  title={userProfile?.profile_img ? "Remove photo" : "No photo to remove"}
                >
                  🗑️
                </button>
              </div>
            </div>
            <div className="profile-info-cyber">
              <h1 className="cyber-name">{userProfile?.name || 'Admin User'}</h1>
              <div className="cyber-status-pill">
                <span className="status-dot"></span> {formatRole(userProfile?.mode)} ACCESS
              </div>
            </div>
          </div>

          <div className="cyber-divider"></div>

          {/* Information Grid */}
          <div className="profile-grid">
            <div className="cyber-info-box">
              <label><span className="icon">👤</span> FULL NAME</label>
              <p className="cyber-value">{userProfile?.name || 'Not Set'}</p>
            </div>

            <div className="cyber-info-box">
              <label><span className="icon">📧</span> EMAIL ADDRESS</label>
              <p className="cyber-value secondary">{userProfile?.email || 'N/A'}</p>
            </div>

            <div className="cyber-info-box">
              <label><span className="icon">🎯</span> ASSIGNED ROLE</label>
              <p className="cyber-value highlight">{formatRole(userProfile?.mode)}</p>
            </div>

            <div className="cyber-info-box">
              <label><span className="icon">🆔</span> EMPLOYEE ID</label>
              <p className="cyber-value secondary">{userProfile?.employee_id || 'N/A'}</p>
            </div>

            <div className="cyber-info-box">
              <label><span className="icon">📅</span> ACCOUNT CREATED</label>
              <p className="cyber-value secondary">
                {userProfile?.created_at ? new Date(userProfile.created_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>

            <div className="cyber-info-box profile-dark-mode-row">
              <label><span className="icon">🌙</span> DARK MODE</label>
              <div className="profile-dark-mode-toggle">
                <button
                  type="button"
                  role="switch"
                  aria-checked={darkMode}
                  aria-label={darkMode ? 'Turn off dark mode' : 'Turn on dark mode'}
                  className={`profile-toggle-track ${darkMode ? 'profile-toggle-track--on' : ''}`}
                  onClick={() => setDarkMode(prev => !prev)}
                >
                  <span className="profile-toggle-thumb" />
                </button>
                <span className="profile-toggle-label">{darkMode ? 'On' : 'Off'}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="profile-footer-cyber">
            <button className="cyber-btn primary" onClick={() => navigate(ADMIN_DASHBOARD_PATH)}>
              Back to Dashboard
            </button>
            <button className="cyber-btn danger" onClick={() => { logout(); navigate('/'); }}>
              Logout
            </button>
            {isPlatformUser && (
              <button
                type="button"
                className="cyber-btn leave-platform-btn"
                onClick={handleLeavePlatform}
                disabled={leaving}
                title="Remove your account from the platform"
              >
                {leaving ? 'Leaving…' : 'Leave platform'}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default Profile
