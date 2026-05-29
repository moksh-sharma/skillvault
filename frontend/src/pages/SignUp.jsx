import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { register, login } from '../config/api'
import { APP_NAME, APP_TAGLINE } from '../config/brand'
import { WOMEN_OWNED_LOGO_SRC, CACHE_LOGO_SRC } from '../config/brandAssets'
import './SignUp.css'

const SignUp = () => {
  const navigate = useNavigate()
  const { setIsAuthenticated, setUserProfile } = useApp()

  const [formData, setFormData] = useState({
    fullName: '',
    dateOfBirth: '',
    email: '',
    password: '',
    confirmPassword: '',
    state: '',
    city: '',
    pincode: '',
    role: '',
    employeeId: ''
  })

  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const indianStates = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
  ]

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const validatePassword = (password) => {
    const minLength = password.length >= 8
    const hasUpperCase = /[A-Z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password)

    return {
      valid: minLength && hasUpperCase && hasNumber && hasSpecialChar,
      errors: {
        minLength: !minLength ? 'Password must be at least 8 characters' : '',
        hasUpperCase: !hasUpperCase ? 'Password must contain at least 1 uppercase letter' : '',
        hasNumber: !hasNumber ? 'Password must contain at least 1 number' : '',
        hasSpecialChar: !hasSpecialChar ? 'Password must contain at least 1 special character' : ''
      }
    }
  }

  const validatePincode = (pincode) => {
    const pincodeRegex = /^\d{6}$/
    return pincodeRegex.test(pincode)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Clear conditional fields when role changes
      ...(name === 'role' && {
        employeeId: ''
      })
    }))

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const validateField = (name, value) => {
    let error = ''

    switch (name) {
      case 'fullName':
        if (!value.trim()) {
          error = 'Full name is required'
        }
        break
      case 'dateOfBirth':
        if (!value) {
          error = 'Date of birth is required'
        }
        break
      case 'email':
        if (!value) {
          error = 'Email address is required'
        } else if (!validateEmail(value)) {
          error = 'Please enter a valid email address'
        }
        break
      case 'password':
        if (!value) {
          error = 'Password is required'
        } else {
          const passwordValidation = validatePassword(value)
          if (!passwordValidation.valid) {
            error = Object.values(passwordValidation.errors).filter(e => e).join(', ')
          }
        }
        break
      case 'confirmPassword':
        if (!value) {
          error = 'Please confirm your password'
        } else if (value !== formData.password) {
          error = 'Passwords do not match'
        }
        break
      case 'state':
        if (!value) {
          error = 'Please select your state'
        }
        break
      case 'city':
        if (!value.trim()) {
          error = 'City is required'
        }
        break
      case 'pincode':
        if (!value) {
          error = 'Pincode is required'
        } else if (!validatePincode(value)) {
          error = 'Pincode must be exactly 6 digits'
        }
        break
      case 'role':
        if (!value) {
          error = 'Role is required'
        }
        break
      case 'employeeId':
        if (formData.role === 'Company Employee' && !value.trim()) {
          error = 'Employee ID is required'
        }
        break

      default:
        break
    }

    return error
  }

  const validateForm = () => {
    const newErrors = {}
    let isValid = true

    Object.keys(formData).forEach(key => {
      const error = validateField(key, formData[key])
      if (error) {
        newErrors[key] = error
        isValid = false
      }
    })

    setErrors(newErrors)
    return isValid
  }

  const isFormValid = () => {
    const baseValid = (
      formData.fullName &&
      formData.dateOfBirth &&
      validateEmail(formData.email) &&
      validatePassword(formData.password).valid &&
      formData.password === formData.confirmPassword &&
      formData.state &&
      formData.city &&
      validatePincode(formData.pincode) &&
      formData.role
    )

    // Additional validation for conditional fields
    if (formData.role === 'Company Employee') {
      return baseValid && formData.employeeId.trim()
    }


    return baseValid
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Prepare signup data matching backend UserCreate schema
      const signupData = {
        name: formData.fullName,
        email: formData.email,
        password: formData.password,
        dob: formData.dateOfBirth,
        state: formData.state,
        city: formData.city,
        pincode: formData.pincode,
        mode: 'user', // All signups are regular users
        employment_type: formData.role,
        employee_id: formData.role === 'Company Employee' ? formData.employeeId : null
      }

      const data = await register(signupData)

      // Auto-login after successful signup
      try {
        const loginData = await login(formData.email, formData.password)

        // Set user profile from signup response
        const userProfileData = {
          id: data.id,
          name: data.name,
          email: data.email,
          mode: data.mode || 'user',
          created_at: data.created_at || new Date().toISOString(),
          // Store additional form data in profile for later use
          role: formData.role || '',
          employeeId: formData.employeeId || '',
          freelancerId: formData.freelancerId || '',
          state: formData.state,
          city: formData.city,
          pincode: formData.pincode,
          dob: formData.dateOfBirth
        }

        setIsAuthenticated(true)
        setUserProfile(userProfileData)
        setIsSubmitting(false)
        navigate('/dashboard', {
          state: { message: 'Account created successfully! Welcome!' }
        })
      } catch (loginError) {
        // Signup succeeded but auto-login failed
        console.error('Auto-login error:', loginError)
        setIsSubmitting(false)
        navigate('/login', {
          state: { message: 'Account created successfully! Please login.' }
        })
      }
    } catch (error) {
      console.error('Signup error:', error)
      setErrors({
        submit: error.message || 'Signup failed. Please try again.'
      })
      setIsSubmitting(false)
    }
  }

  const handleBlur = (e) => {
    const { name, value } = e.target
    const error = validateField(name, value)
    if (error) {
      setErrors(prev => ({
        ...prev,
        [name]: error
      }))
    }
  }

  return (
    <div className="signup-container">
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
        className="signup-card"
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
          className="signup-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Create Your Account
        </motion.h2>

        <motion.p
          className="signup-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Join {APP_NAME} and start your journey
        </motion.p>

        <form onSubmit={handleSubmit} className="signup-form">
          <div className="form-columns">
            <div className="form-column-left">
              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <label htmlFor="fullName">
                  Full Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Enter your full name"
                  className={errors.fullName ? 'error' : ''}
                  autoComplete="off"
                />
              </motion.div>

              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 }}
              >
                <label htmlFor="dateOfBirth">
                  Date of Birth <span className="required">*</span>
                </label>
                <input
                  type="date"
                  id="dateOfBirth"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  max={new Date().toISOString().split('T')[0]}
                  className={errors.dateOfBirth ? 'error' : ''}
                  autoComplete="off"
                />
              </motion.div>

              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <label htmlFor="email">
                  Email Address <span className="required">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Enter your email address"
                  className={errors.email ? 'error' : ''}
                  autoComplete="off"
                />
              </motion.div>

              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.55 }}
              >
                <label htmlFor="password">
                  Password <span className="required">*</span>
                </label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Enter your password"
                    className={errors.password ? 'error' : ''}
                    autoComplete="new-password"
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
                {!errors.password && formData.password && (
                  <div className="password-requirements">
                    <span className={formData.password.length >= 8 ? 'valid' : ''}>
                      ✓ At least 8 characters
                    </span>
                    <span className={/[A-Z]/.test(formData.password) ? 'valid' : ''}>
                      ✓ 1 uppercase letter
                    </span>
                    <span className={/[0-9]/.test(formData.password) ? 'valid' : ''}>
                      ✓ 1 number
                    </span>
                    <span className={/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? 'valid' : ''}>
                      ✓ 1 special character
                    </span>
                  </div>
                )}
              </motion.div>

              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
              >
                <label htmlFor="confirmPassword">
                  Confirm Password <span className="required">*</span>
                </label>
                <div className="password-input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Re-enter your password"
                    className={errors.confirmPassword ? 'error' : ''}
                    autoComplete="new-password"
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
              </motion.div>
            </div>

            <div className="form-column-right">
              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.65 }}
              >
                <label htmlFor="role">
                  Role <span className="required">*</span>
                </label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={errors.role ? 'error' : ''}
                  autoComplete="off"
                >
                  <option value="">Select Your Role</option>
                  <option value="Company Employee">Company Employee</option>
                  <option value="Freelancer">Freelancer</option>
                  <option value="Guest User">Guest User</option>
                </select>
              </motion.div>

              {formData.role === 'Company Employee' && (
                <motion.div
                  className="form-group"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <label htmlFor="employeeId">
                    Employee ID <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="employeeId"
                    name="employeeId"
                    value={formData.employeeId}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Enter your employee ID"
                    className={errors.employeeId ? 'error' : ''}
                    autoComplete="off"
                  />
                </motion.div>
              )}





              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
              >
                <label htmlFor="state">
                  State <span className="required">*</span>
                </label>
                <select
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={errors.state ? 'error' : ''}
                  autoComplete="off"
                >
                  <option value="">Select Your State</option>
                  {indianStates.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </motion.div>

              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.75 }}
              >
                <label htmlFor="city">
                  City <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Enter your city"
                  className={errors.city ? 'error' : ''}
                  autoComplete="off"
                />
              </motion.div>

              <motion.div
                className="form-group"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
              >
                <label htmlFor="pincode">
                  Pincode <span className="required">*</span>
                </label>
                <input
                  type="number"
                  id="pincode"
                  name="pincode"
                  value={formData.pincode}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value.length <= 6) {
                      handleChange(e)
                    }
                  }}
                  onBlur={handleBlur}
                  placeholder="Enter pincode"
                  maxLength={6}
                  className={errors.pincode ? 'error' : ''}
                  autoComplete="off"
                  inputMode="numeric"
                />
              </motion.div>
            </div>
          </div>

          <motion.button
            type="submit"
            className="signup-button"
            disabled={!isFormValid() || isSubmitting}
            whileHover={isFormValid() && !isSubmitting ? { scale: 1.02 } : {}}
            whileTap={isFormValid() && !isSubmitting ? { scale: 0.98 } : {}}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            {isSubmitting ? 'Creating Account...' : 'Sign Up'}
          </motion.button>

          <motion.div
            className="signup-footer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <p>
              Already have an account?{' '}
              <Link to="/login" className="signup-link">
                Sign In
              </Link>
            </p>
          </motion.div>
        </form>
      </motion.div>
    </div>
  )
}

export default SignUp

