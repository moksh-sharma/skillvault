import { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { login, googleLogin } from '../config/api'
import { APP_NAME, APP_TAGLINE, ADMIN_DASHBOARD_PATH } from '../config/brand'
import { WOMEN_OWNED_LOGO_SRC, CACHE_LOGO_SRC } from '../config/brandAssets'
import { GoogleLogin } from '@react-oauth/google'
import './Login.css'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, userProfile, setIsAuthenticated, setUserProfile, logout } = useApp()

  const isAdminPanelMode = new URLSearchParams(location.search).get('admin') === 'true'

  useEffect(() => {
    // If arriving at login with ?admin=true but already logged in as a normal user, 
    // we should log out so the user can sign in with admin credentials.
    const handleAuthState = async () => {
      if (isAuthenticated) {
        if (isAdminPanelMode) {
          const isAdmin = userProfile?.mode?.toLowerCase().includes('admin')
          if (isAdmin) {
            // Already an admin, just go to admin panel
            navigate(ADMIN_DASHBOARD_PATH, { replace: true })
          } else {
            // Logged in as user but wants admin, clear session
            await logout()
          }
        } else if (userProfile?.mode === 'admin') {
          // Already logged in as admin, visiting regular login, send to admin
          navigate(ADMIN_DASHBOARD_PATH, { replace: true })
        } else {
          // Already logged in as user, visiting regular login, send to dashboard
          navigate('/dashboard', { replace: true })
        }
      }
    }

    handleAuthState()

    if (location.state?.message) {
      setSuccessMessage(location.state.message)
      // Clear the message from location state
      window.history.replaceState({}, document.title)
    }
  }, [location, isAuthenticated, userProfile, isAdminPanelMode, logout, navigate])

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const validatePassword = (password) => {
    return password.length >= 8
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'email') {
      setEmail(value)
    } else if (name === 'password') {
      setPassword(value)
    }

    // Clear errors when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
    if (authError) {
      setAuthError('')
    }
  }

  const handleBlur = (e) => {
    const { name, value } = e.target
    let error = ''

    if (name === 'email') {
      if (!value) {
        error = 'Email address is required'
      } else if (!validateEmail(value)) {
        error = 'Please enter a valid email address'
      }
    } else if (name === 'password') {
      if (!value) {
        error = 'Password is required'
      } else if (!validatePassword(value)) {
        error = 'Password must be at least 8 characters'
      }
    }

    if (error) {
      setErrors(prev => ({
        ...prev,
        [name]: error
      }))
    }
  }

  const isFormValid = () => {
    return validateEmail(email) && validatePassword(password)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')

    // Validate form
    if (!validateEmail(email)) {
      setErrors({ email: 'Please enter a valid email address' })
      return
    }
    if (!validatePassword(password)) {
      setErrors({ password: 'Password must be at least 8 characters' })
      return
    }

    setIsLoading(true)
    setAuthError('') // Clear any previous errors

    try {
      const data = await login(email, password)

      // Set user profile from response
      const userProfileData = {
        id: data.user?.id || data.user_id,
        name: data.user?.name || '',
        email: data.user?.email || email,
        mode: data.user?.mode || 'user',
        created_at: data.user?.created_at || new Date().toISOString()
      }

      setIsAuthenticated(true)
      setUserProfile(userProfileData)
      setIsLoading(false)

      const isAdmin = userProfileData.mode?.toLowerCase().includes('admin')
      console.log('User mode:', userProfileData.mode, 'isAdmin:', isAdmin)

      if (isAdmin) {
        sessionStorage.setItem('adminEntranceShown', 'true')
        navigate(ADMIN_DASHBOARD_PATH, { replace: true })
      } else {
        const from = location.state?.from?.pathname
        if (from) {
          navigate(from, { replace: true })
        } else {
          navigate('/dashboard')
        }
      }
    } catch (error) {
      console.error('Login error:', error)
      setAuthError(error.message || 'Invalid email or password. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="login-container">
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
        className="login-card"
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
          className="login-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {new URLSearchParams(location.search).get('admin') ? 'Admin Portal' : 'Welcome Back'}
        </motion.h2>

        <motion.p
          className="login-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {new URLSearchParams(location.search).get('admin')
            ? 'Login with your admin credentials'
            : 'Login to access your account'}
        </motion.p>

        <form onSubmit={handleSubmit} className="login-form">
          {successMessage && (
            <motion.div
              className="auth-success"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {successMessage}
            </motion.div>
          )}
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
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="example@gmail.com"
              className={errors.email ? 'error' : ''}
              autoComplete="off"
            />
            {errors.email && <span className="error-message">{errors.email}</span>}
          </motion.div>

          <motion.div
            className="form-group"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={password}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Enter your password"
                className={errors.password ? 'error' : ''}
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
            {errors.password && <span className="error-message">{errors.password}</span>}
          </motion.div>

          <motion.div
            className="forgot-password-link"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
          >
            <Link to="/forgot-password" className="forgot-link">
              Forgot Password?
            </Link>
          </motion.div>

          {!isAdminPanelMode && (
            <motion.div
              className="google-login-wrapper"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.58 }}
            >
              <div className="divider">
                <span>OR</span>
              </div>
              <div className="google-btn-container">
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    try {
                      setIsLoading(true);
                      const data = await googleLogin(credentialResponse.credential);

                      const userProfileData = {
                        id: data.user?.id || data.user_id,
                        name: data.user?.name || '',
                        email: data.user?.email || '',
                        mode: data.user?.mode || 'user',
                        created_at: data.user?.created_at || new Date().toISOString()
                      };

                      setIsAuthenticated(true);
                      setUserProfile(userProfileData);
                      setIsLoading(false);

                      // Determine where to redirect
                      const isAdmin = userProfileData.mode?.toLowerCase().includes('admin');
                      console.log('Google login mode:', userProfileData.mode, 'isAdmin:', isAdmin);

                      if (isAdmin) {
                        sessionStorage.setItem('adminEntranceShown', 'true');
                        navigate(ADMIN_DASHBOARD_PATH, { replace: true });
                      } else {
                        const from = location.state?.from?.pathname;
                        if (from) {
                          navigate(from, { replace: true });
                        } else {
                          navigate('/dashboard');
                        }
                      }
                    } catch (error) {
                      console.error('Google login error:', error);
                      setAuthError('Google login failed. Please try again.');
                      setIsLoading(false);
                    }
                  }}
                  onError={() => {
                    setAuthError('Google login failed');
                  }}
                  useOneTap
                  theme="filled_blue"
                  shape="pill"
                  text="signin_with"
                  width="100%"
                />
              </div>
            </motion.div>
          )}

          <motion.button
            type="submit"
            className="login-button"
            disabled={!isFormValid() || isLoading}
            whileHover={isFormValid() && !isLoading ? { scale: 1.02 } : {}}
            whileTap={isFormValid() && !isLoading ? { scale: 0.98 } : {}}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </motion.button>

          {!new URLSearchParams(location.search).get('admin') && (
            <motion.div
              className="login-footer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <p>
                Don't have an account?{' '}
                <Link to="/signup" className="signup-link">
                  Sign Up
                </Link>
              </p>
            </motion.div>
          )}
        </form>
      </motion.div>
    </div>
  )
}

export default Login

