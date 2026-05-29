import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { login, isAdminRole } from '../config/api'
import { APP_NAME, APP_TAGLINE, ADMIN_DASHBOARD_PATH } from '../config/brand'
import { WOMEN_OWNED_LOGO_SRC, CACHE_LOGO_SRC } from '../config/brandAssets'
import './LandingPage.css'

const LandingPage = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [errors, setErrors] = useState({})
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setLoading] = useState(false)
    const [authError, setAuthError] = useState('')
    const [authSuccess, setAuthSuccess] = useState('')
    const navigate = useNavigate()
    const location = useLocation()
    const { isAuthenticated, userProfile, setIsAuthenticated, setUserProfile, logout } = useApp()

    useEffect(() => {
        const checkAuth = async () => {
            if (isAuthenticated) {
                if (isAdminRole(userProfile?.mode)) {
                    navigate(ADMIN_DASHBOARD_PATH, { replace: true })
                } else {
                    await logout()
                }
            }
        }
        checkAuth()
    }, [isAuthenticated, userProfile, navigate, logout])

    useEffect(() => {
        const msg = location.state?.message
        if (msg) {
            setAuthSuccess(msg)
            window.history.replaceState({}, document.title, window.location.pathname)
        }
    }, [location.state])

    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    const validatePassword = (password) => {
        return password.length >= 8
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        if (name === 'email') setEmail(value)
        else if (name === 'password') setPassword(value)
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
        if (authError) setAuthError('')
        if (authSuccess) setAuthSuccess('')
    }

    const handleBlur = (e) => {
        const { name, value } = e.target
        let error = ''
        if (name === 'email') {
            if (!value) error = 'Email address is required'
            else if (!validateEmail(value)) error = 'Please enter a valid email address'
        } else if (name === 'password') {
            if (!value) error = 'Password is required'
            else if (!validatePassword(value)) error = 'Password must be at least 8 characters'
        }
        if (error) setErrors(prev => ({ ...prev, [name]: error }))
    }

    const isFormValid = () => validateEmail(email) && validatePassword(password)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setAuthError('')

        if (!validateEmail(email)) {
            setErrors({ email: 'Please enter a valid email address' })
            return
        }
        if (!validatePassword(password)) {
            setErrors({ password: 'Password must be at least 8 characters' })
            return
        }

        setLoading(true)
        try {
            const data = await login(email, password)
            const userProfileData = {
                id: data.user?.id || data.user_id,
                name: data.user?.name || '',
                email: data.user?.email || email,
                mode: data.user?.mode || 'user',
                profile_img: data.user?.profile_img || null,
                employee_id: data.user?.employee_id || null,
                created_at: data.user?.created_at || new Date().toISOString()
            }

            if (isAdminRole(userProfileData.mode)) {
                setIsAuthenticated(true)
                setUserProfile(userProfileData)
                sessionStorage.setItem('adminEntranceShown', 'true')
                navigate(ADMIN_DASHBOARD_PATH, { replace: true })
            } else {
                setAuthError('Access Denied: Admin credentials required.')
                await logout()
            }
        } catch (error) {
            setAuthError(error.message || 'Invalid email or password. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-container">
            {authError && (
                <div className="auth-popup-overlay" onClick={() => setAuthError('')}>
                    <motion.div
                        className="auth-popup"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="auth-popup-icon">!</div>
                        <p className="auth-popup-message">{authError}</p>
                        <button
                            type="button"
                            className="auth-popup-btn"
                            onClick={() => setAuthError('')}
                        >
                            OK
                        </button>
                    </motion.div>
                </div>
            )}
            <div className="page-logos">
                <img src={WOMEN_OWNED_LOGO_SRC} alt="Women Owned" className="logo-left" />
                <img src={CACHE_LOGO_SRC} alt="CACHE" className="logo-right" />
            </div>
            <motion.div
                className="auth-page-wrapper"
                initial={{ rotateY: -180, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 180, opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
            >
                <div className="login-card">
                    <motion.div
                        className="brand-header"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <h1 className="brand-title">{APP_NAME}</h1>
                        <div className="brand-tagline">
                            <span className="powered-by-text">powered by</span>
                            <img src={CACHE_LOGO_SRC} alt="CACHE" className="cache-logo" />
                        </div>
                    </motion.div>

                    <form onSubmit={handleSubmit} className="login-form">
                        {authSuccess && (
                            <p className="auth-success" role="status">{authSuccess}</p>
                        )}
                        <motion.div
                            className="form-group"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <label htmlFor="email">Email Address <span className="required">*</span></label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={email}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="admin@skillvault.com"
                                className={errors.email ? 'error' : ''}
                                autoComplete="off"
                            />
                        </motion.div>

                        <motion.div
                            className="form-group"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <label htmlFor="password">Password <span className="required">*</span></label>
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
                        </motion.div>

                        <motion.button
                            type="submit"
                            className="login-button"
                            disabled={!isFormValid() || isLoading}
                            whileHover={isFormValid() && !isLoading ? { scale: 1.02 } : {}}
                            whileTap={isFormValid() && !isLoading ? { scale: 0.98 } : {}}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                        >
                            {isLoading ? 'Authenticating...' : 'Login to Admin Panel'}
                        </motion.button>
                    </form>
                </div>
            </motion.div>
        </div>
    )
}

export default LandingPage
