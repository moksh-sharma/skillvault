import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { setPasswordWithToken } from '../config/api'
import { WOMEN_OWNED_LOGO_SRC, CACHE_LOGO_SRC } from '../config/brandAssets'
import './ForgotPassword.css'
import './SetPassword.css'

const SetPassword = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [authError, setAuthError] = useState('')

  const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '')
  const validatePassword = (password) => password.length >= 8

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'email') setEmail(value)
    else if (name === 'newPassword') setNewPassword(value)
    else if (name === 'confirmPassword') setConfirmPassword(value)
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    if (authError) setAuthError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    if (!email?.trim()) {
      setErrors({ email: 'Email is required' })
      return
    }
    if (!validateEmail(email)) {
      setErrors({ email: 'Please enter a valid email address' })
      return
    }
    if (!newPassword) {
      setErrors({ newPassword: 'Password is required' })
      return
    }
    if (!validatePassword(newPassword)) {
      setErrors({ newPassword: 'Password must be at least 8 characters' })
      return
    }
    if (!confirmPassword) {
      setErrors({ confirmPassword: 'Please confirm your password' })
      return
    }
    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match' })
      return
    }
    setLoading(true)
    try {
      await setPasswordWithToken(token, newPassword, email.trim())
      navigate('/', { replace: true, state: { message: 'Password set successfully. Please log in.' } })
    } catch (error) {
      setAuthError(error.message || 'Failed to set password. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="forgot-password-container">
        <div className="page-logos">
          <img src={WOMEN_OWNED_LOGO_SRC} alt="Women Owned" className="logo-left" />
          <img src={CACHE_LOGO_SRC} alt="CACHE" className="logo-right" />
        </div>
        <div className="forgot-password-card" style={{ maxWidth: '420px' }}>
          <h1 className="forgot-password-title">Set Password</h1>
          <p className="forgot-password-subtitle">Invalid or missing link. Please use the link from your invite email.</p>
          <p style={{ marginTop: '1rem' }}>
            <a href="/" className="forgot-password-link">Return to login</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="forgot-password-container">
      <div className="page-logos">
        <img src={WOMEN_OWNED_LOGO_SRC} alt="Women Owned" className="logo-left" />
        <img src={CACHE_LOGO_SRC} alt="CACHE" className="logo-right" />
      </div>
      <motion.div
        className="forgot-password-card change-password-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ maxWidth: '420px' }}
      >
        <h1 className="forgot-password-title">Change Password</h1>

        <form onSubmit={handleSubmit} className="forgot-password-form">
          {authError && (
            <div className="auth-error" role="alert">
              {authError}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={handleChange}
              placeholder="Email this invite was sent to"
              className={errors.email ? 'error' : ''}
              autoComplete="email"
            />
            {errors.email && (
              <span className="error-message">{errors.email}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="newPassword"
                name="newPassword"
                value={newPassword}
                onChange={handleChange}
                placeholder="At least 8 characters"
                className={errors.newPassword ? 'error' : ''}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
            {errors.newPassword && (
              <span className="error-message">{errors.newPassword}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="password-input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your new password"
                className={errors.confirmPassword ? 'error' : ''}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <span className="error-message">{errors.confirmPassword}</span>
            )}
          </div>

          <motion.button
            type="submit"
            className="forgot-password-button"
            disabled={!email?.trim() || !newPassword || !confirmPassword || newPassword !== confirmPassword || loading}
            whileHover={email && newPassword && confirmPassword && newPassword === confirmPassword && !loading ? { scale: 1.02 } : {}}
            whileTap={email && newPassword && confirmPassword && newPassword === confirmPassword && !loading ? { scale: 0.98 } : {}}
          >
            {loading ? 'Setting Password...' : 'Set Password'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}

export default SetPassword
