import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { sendPasswordResetCode, verifyPasswordResetCode, resetPassword } from '../config/api'
import { APP_NAME, APP_TAGLINE } from '../config/brand'
import { WOMEN_OWNED_LOGO_SRC, CACHE_LOGO_SRC } from '../config/brandAssets'
import './ForgotPassword.css'

const ForgotPassword = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState(1) // 1: Email, 2: Code, 3: Reset Password
  const [email, setEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [authError, setAuthError] = useState('')

  const validateEmail = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(value)
  }

  const validatePassword = (password) => {
    return password.length >= 8
  }

  const handleEmailChange = (e) => {
    const value = e.target.value
    setEmail(value)
    if (errors.email) {
      setErrors(prev => ({ ...prev, email: '' }))
    }
    if (authError) {
      setAuthError('')
    }
  }

  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setVerificationCode(value)
    if (errors.verificationCode) {
      setErrors(prev => ({ ...prev, verificationCode: '' }))
    }
    if (authError) {
      setAuthError('')
    }
  }

  const handlePasswordChange = (e) => {
    const { name, value } = e.target
    if (name === 'newPassword') {
      setNewPassword(value)
    } else if (name === 'confirmPassword') {
      setConfirmPassword(value)
    }
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
    if (authError) {
      setAuthError('')
    }
  }

  const handleSendCode = async (e) => {
    e.preventDefault()
    setAuthError('')

    if (!email) {
      setErrors({ email: 'Email is required' })
      return
    }

    if (!validateEmail(email)) {
      setErrors({ email: 'Please enter a valid email address' })
      return
    }

    setIsLoading(true)

    try {
      await sendPasswordResetCode(email)
      setCodeSent(true)
      setStep(2)
      startCountdown()
    } catch (error) {
      console.error('Send reset code error:', error)
      setAuthError(error.message || 'Failed to send verification code')
    } finally {
      setIsLoading(false)
    }
  }

  const startCountdown = () => {
    setCountdown(60)
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleResendCode = () => {
    if (countdown > 0) return
    handleSendCode({ preventDefault: () => { } })
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    setAuthError('')

    if (!verificationCode) {
      setErrors({ verificationCode: 'Verification code is required' })
      return
    }

    if (verificationCode.length !== 6) {
      setErrors({ verificationCode: 'Verification code must be 6 digits' })
      return
    }

    setIsLoading(true)

    try {
      await verifyPasswordResetCode(email, verificationCode)
      setStep(3)
    } catch (error) {
      console.error('Verify code error:', error)
      setAuthError(error.message || 'Invalid verification code')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setAuthError('')

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

    setIsLoading(true)

    try {
      await resetPassword(email, verificationCode, newPassword)
      navigate('/login', {
        state: { message: 'Password reset successfully. Please login with your new password.' }
      })
    } catch (error) {
      console.error('Reset password error:', error)
      setAuthError(error.message || 'Failed to reset password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="forgot-password-container">
      <div className="page-logos">
        <img src={WOMEN_OWNED_LOGO_SRC} alt="Women Owned" className="logo-left" />
        <img src={CACHE_LOGO_SRC} alt="CACHE" className="logo-right" />
      </div>
      <div className="animated-background">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
        <div className="gradient-orb orb-4"></div>
      </div>

      <motion.div
        className="forgot-password-card"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="brand-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h1 className="brand-title">{APP_NAME}</h1>
          <p className="brand-tagline">{APP_TAGLINE}</p>
        </motion.div>

        <motion.h2
          className="forgot-password-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {step === 1 && 'Forgot Password'}
          {step === 2 && 'Verify Code'}
          {step === 3 && 'Reset Password'}
        </motion.h2>

        <motion.p
          className="forgot-password-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {step === 1 && 'Enter your email to receive a verification code'}
          {step === 2 && `We've sent a 6-digit code to ${email}`}
          {step === 3 && 'Enter your new password'}
        </motion.p>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.form
              key="step1"
              onSubmit={handleSendCode}
              className="forgot-password-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              {authError && (
                <motion.div
                  className="auth-error"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {authError}
                </motion.div>
              )}

              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="Enter your email address"
                  className={errors.email ? 'error' : ''}
                  autoComplete="off"
                />
                {errors.email && (
                  <span className="error-message">{errors.email}</span>
                )}
              </motion.div>

              <motion.button
                type="submit"
                className="forgot-password-button"
                disabled={!validateEmail(email) || isLoading}
                whileHover={validateEmail(email) && !isLoading ? { scale: 1.02 } : {}}
                whileTap={validateEmail(email) && !isLoading ? { scale: 0.98 } : {}}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                {isLoading ? 'Sending Code...' : 'Send Verification Code'}
              </motion.button>

              <motion.div
                className="forgot-password-footer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <p>
                  Remember your password?{' '}
                  <Link to="/login" className="login-link">
                    Login
                  </Link>
                </p>
              </motion.div>
            </motion.form>
          )}

          {step === 2 && (
            <motion.form
              key="step2"
              onSubmit={handleVerifyCode}
              className="forgot-password-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              {authError && (
                <motion.div
                  className="auth-error"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {authError}
                </motion.div>
              )}

              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <label htmlFor="verificationCode">Verification Code</label>
                <input
                  type="text"
                  id="verificationCode"
                  name="verificationCode"
                  value={verificationCode}
                  onChange={handleCodeChange}
                  placeholder="Enter 6-digit code"
                  className={errors.verificationCode ? 'error' : ''}
                  maxLength={6}
                  autoComplete="off"
                />
                {errors.verificationCode && (
                  <span className="error-message">{errors.verificationCode}</span>
                )}
                {codeSent && (
                  <div className="resend-code">
                    <p>
                      Didn't receive the code?{' '}
                      <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={countdown > 0}
                        className="resend-button"
                      >
                        {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                      </button>
                    </p>
                  </div>
                )}
              </motion.div>

              <motion.button
                type="submit"
                className="forgot-password-button"
                disabled={verificationCode.length !== 6 || isLoading}
                whileHover={verificationCode.length === 6 && !isLoading ? { scale: 1.02 } : {}}
                whileTap={verificationCode.length === 6 && !isLoading ? { scale: 0.98 } : {}}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                {isLoading ? 'Verifying...' : 'Verify Code'}
              </motion.button>

              <motion.div
                className="forgot-password-footer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <p>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="back-link"
                  >
                    ← Back to Mobile Number
                  </button>
                </p>
              </motion.div>
            </motion.form>
          )}

          {step === 3 && (
            <motion.form
              key="step3"
              onSubmit={handleResetPassword}
              className="forgot-password-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              {authError && (
                <motion.div
                  className="auth-error"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {authError}
                </motion.div>
              )}

              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <label htmlFor="newPassword">New Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="newPassword"
                    name="newPassword"
                    value={newPassword}
                    onChange={handlePasswordChange}
                    placeholder="Enter your new password"
                    className={errors.newPassword ? 'error' : ''}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {errors.newPassword && (
                  <span className="error-message">{errors.newPassword}</span>
                )}
              </motion.div>

              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <label htmlFor="confirmPassword">Confirm Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={handlePasswordChange}
                    placeholder="Confirm your new password"
                    className={errors.confirmPassword ? 'error' : ''}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <span className="error-message">{errors.confirmPassword}</span>
                )}
              </motion.div>

              <motion.button
                type="submit"
                className="forgot-password-button"
                disabled={!newPassword || !confirmPassword || newPassword !== confirmPassword || isLoading}
                whileHover={newPassword && confirmPassword && newPassword === confirmPassword && !isLoading ? { scale: 1.02 } : {}}
                whileTap={newPassword && confirmPassword && newPassword === confirmPassword && !isLoading ? { scale: 0.98 } : {}}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                {isLoading ? 'Resetting Password...' : 'Reset Password'}
              </motion.button>

              <motion.div
                className="forgot-password-footer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <p>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="back-link"
                  >
                    ← Back to Verification
                  </button>
                </p>
              </motion.div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

export default ForgotPassword

