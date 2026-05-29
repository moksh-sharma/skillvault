// API Configuration and Integration
// ===========================================

// Base API URL
// In Vite, use import.meta.env instead of process.env
const getBackendURL = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  // Normal local dev default
  return 'http://localhost:8002/api'
}

export const API_BASE_URL = getBackendURL()

// Admin modes (Admin, Talent Acquisition, HR) - all get admin dashboard access
const ADMIN_MODES = ['admin', 'talent_acquisition', 'talent acquisition', 'hr']
export const isAdminRole = (mode) => {
  if (!mode || typeof mode !== 'string') return false
  const m = mode.trim().toLowerCase()
  return ADMIN_MODES.includes(m) || m.includes('admin')
}

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  LOGIN: '/auth/login',
  GOOGLE_LOGIN: '/auth/google-login',
  LOGOUT: '/auth/logout',
  SIGNUP: '/auth/signup',
  ADMIN_SIGNUP: '/auth/admin-signup',
  ME: '/auth/me',
  FORGOT_PASSWORD_SEND_CODE: '/auth/forgot-password/send-code',
  FORGOT_PASSWORD_VERIFY_CODE: '/auth/forgot-password/verify-code',
  FORGOT_PASSWORD_RESET: '/auth/forgot-password/reset',
  SET_PASSWORD_WITH_TOKEN: '/auth/set-password-with-token',
  VERIFY_EMPLOYEE: '/auth/verify-employee',
  ADMIN_INVITE: '/admin/invite',

  // User Profile
  GET_PROFILE: '/user/profile',
  UPDATE_PROFILE: '/user/profile',
  UPDATE_PROFILE_PHOTO: '/user/profile-photo',
  DELETE_PROFILE_PHOTO: '/user/profile-photo',

  // Resume Upload
  UPLOAD_USER_PROFILE: '/resumes/upload/user-profile',
  PARSE_RESUME_ONLY: '/resumes/parse-only',

  // Admin Endpoints
  ADMIN_STATS: '/admin/stats',
  ADMIN_NOTIFICATIONS: '/admin/notifications',
  ADMIN_USERS: '/admin/users',
  ADMIN_PLATFORM_ADMINS: '/admin/users/platform-admins',
  ADMIN_UPLOAD_RESUMES: '/resumes/upload',
  ADMIN_UPDATE_RESUME_TYPE: '/admin/resumes',
  EMPLOYEE_LIST_CONFIG: '/admin/employee-list/config',
  EMPLOYEE_LIST_UPLOAD: '/admin/employee-list/upload',
  EMPLOYEE_LIST: '/admin/employee-list',
  EMPLOYEE_LIST_LEFT_AFTER_UPLOAD: '/admin/employee-list/left-after-upload',
  EMPLOYEE_LIST_DOWNGRADE_LEFT: '/admin/employee-list/downgrade-left',

  // Help Assistant
  ASSISTANT_QUERY: '/assistant/query',

  // Job Openings Endpoints
  GET_JOB_OPENINGS: '/job-openings',
  GET_JOB_OPENING: '/job-openings',
  FILTER_JOB_OPENINGS: '/job-openings/filter',
  CREATE_JOB_OPENING: '/job-openings',
  UPDATE_JOB_OPENING: '/job-openings',
  DELETE_JOB_OPENING: '/job-openings',
}

/**
 * Get authentication token from localStorage
 */
export const getAuthToken = () => {
  return localStorage.getItem('authToken')
}

/**
 * Set authentication token in localStorage
 */
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('authToken', token)
  } else {
    localStorage.removeItem('authToken')
  }
}

/**
 * Make an API request with authentication
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise} - API response
 */
export const apiRequest = async (endpoint, options = {}) => {
  const token = getAuthToken()

  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    })

    // Check content type before parsing JSON
    const contentType = response.headers.get('content-type')
    let data = {}

    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json()
      } catch (jsonError) {
        // If JSON parsing fails, use status text as error message
        console.error('Failed to parse JSON response:', jsonError)
        data = { message: response.statusText || 'Invalid response from server' }
      }
    } else {
      // Non-JSON response, create error data
      const text = await response.text()
      data = { message: text || response.statusText || 'Invalid response from server' }
    }

    if (!response.ok) {
      const errorMessage = data.detail || data.message || `API Error: ${response.statusText}`
      const error = new Error(errorMessage)
      error.status = response.status
      error.data = data
      throw error
    }

    return data
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error: Could not connect to server. Please check if backend is running.')
    }
    throw error
  }
}

/**
 * Upload file to API
 * @param {string} endpoint - API endpoint
 * @param {FormData} formData - Form data with file
 * @param {string} [method='POST'] - HTTP method (e.g. 'PUT' for updates)
 * @returns {Promise} - API response
 */
export const uploadFile = async (endpoint, formData, method = 'POST') => {
  const token = getAuthToken()

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    })

    // Check content type before parsing JSON
    const contentType = response.headers.get('content-type')
    let data = {}

    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json()
      } catch (jsonError) {
        // If JSON parsing fails, use status text as error message
        console.error('Failed to parse JSON response:', jsonError)
        data = { message: response.statusText || 'Invalid response from server' }
      }
    } else {
      // Non-JSON response, create error data
      const text = await response.text()
      data = { message: text || response.statusText || 'Invalid response from server' }
    }

    if (!response.ok) {
      const errorMessage = data.detail || data.message || `Upload Error: ${response.statusText}`
      const error = new Error(errorMessage)
      error.status = response.status
      error.data = data
      throw error
    }

    return data
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error: Could not connect to server. Please check if backend is running.')
    }
    throw error
  }
}

// Authentication API Functions
// =============================

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise} - Login response with token and user data
 */
export const login = async (email, password) => {
  const data = await apiRequest(API_ENDPOINTS.LOGIN, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  if (data.access_token) {
    setAuthToken(data.access_token)
  }

  return data
}

export const googleLogin = async (credential) => {
  const data = await apiRequest(API_ENDPOINTS.GOOGLE_LOGIN, {
    method: 'POST',
    body: JSON.stringify({ credential }),
  })

  if (data.access_token) {
    setAuthToken(data.access_token)
  }

  return data
}

/**
 * Verify employee ID and email against company CSV (no auth).
 * @param {string} employee_id - Employee ID
 * @param {string} email - Employee email
 * @returns {Promise<{valid: boolean, full_name?: string, message?: string}>}
 */
export const verifyEmployee = async (employee_id, email) => {
  const data = await apiRequest(API_ENDPOINTS.VERIFY_EMPLOYEE, {
    method: 'POST',
    body: JSON.stringify({ employee_id, email }),
  })
  return data
}

/**
 * Register new user
 * @param {object} userData - User registration data
 * @returns {Promise} - Registration response
 */
export const register = async (userData) => {
  return await apiRequest(API_ENDPOINTS.SIGNUP, {
    method: 'POST',
    body: JSON.stringify(userData),
  })
}

/**
 * Admin signup (Admin, Talent Acquisition, HR)
 * @param {object} data - { name, email, password, role, employee_id }
 * @returns {Promise} - User response
 */
export const adminSignup = async (data) => {
  return await apiRequest(API_ENDPOINTS.ADMIN_SIGNUP, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * Get current user info
 * @returns {Promise} - Current user data
 */
export const getCurrentUser = async () => {
  return await apiRequest(API_ENDPOINTS.ME)
}

/**
 * Logout user
 * @returns {Promise} - Logout response
 */
export const logout = async () => {
  try {
    await apiRequest(API_ENDPOINTS.LOGOUT, {
      method: 'POST',
    })
  } catch (error) {
    // Even if logout fails on server, clear local token
    console.error('Logout error:', error)
  } finally {
    setAuthToken(null)
    localStorage.removeItem('userProfile')
    localStorage.removeItem('isAuthenticated')
  }
}

// Forgot Password APIs
// =====================

/**
 * Send password reset verification code to email
 * @param {string} email
 */
export const sendPasswordResetCode = async (email) => {
  return await apiRequest(API_ENDPOINTS.FORGOT_PASSWORD_SEND_CODE, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/**
 * Verify password reset code
 * @param {string} email
 * @param {string} code
 */
export const verifyPasswordResetCode = async (email, code) => {
  return await apiRequest(API_ENDPOINTS.FORGOT_PASSWORD_VERIFY_CODE, {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
}

/**
 * Reset password with verification code
 * @param {string} email
 * @param {string} code
 * @param {string} newPassword
 */
export const resetPassword = async (email, code, newPassword) => {
  return await apiRequest(API_ENDPOINTS.FORGOT_PASSWORD_RESET, {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword }),
  })
}

/**
 * Set password using invite (set-password) token. No auth required.
 * @param {string} token - Token from set-password link
 * @param {string} newPassword - New password
 * @param {string} [email] - Email (must match invite recipient; optional but recommended for confirmation)
 */
export const setPasswordWithToken = async (token, newPassword, email) => {
  const body = { token, new_password: newPassword }
  if (email) body.email = email
  return await apiRequest(API_ENDPOINTS.SET_PASSWORD_WITH_TOKEN, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Send admin portal invite to a company employee (admin only).
 * @param {{ email: string, role: string, custom_set_password_link?: string, temporary_password?: string }} data - email, role, optional custom portal link, optional custom password
 */
export const sendAdminInvite = async (data) => {
  const body = { email: data.email, role: data.role }
  if (data.custom_set_password_link) body.custom_set_password_link = data.custom_set_password_link
  if (data.temporary_password) body.temporary_password = data.temporary_password
  return await apiRequest(API_ENDPOINTS.ADMIN_INVITE, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Get detailed user profile from backend
 * @returns {Promise} - User profile data
 */
export const getProfile = async () => {
  return await apiRequest(API_ENDPOINTS.GET_PROFILE)
}

/**
 * Update user profile
 * @param {object} profileData - Profile fields to update
 * @returns {Promise} - Updated profile data
 */
export const updateProfile = async (profileData) => {
  return await apiRequest(API_ENDPOINTS.UPDATE_PROFILE, {
    method: 'PUT',
    body: JSON.stringify(profileData),
  })
}

/**
 * Upload profile photo to database/server
 * @param {File} file - Profile image file
 * @returns {Promise} - Updated user profile data
 */
export const uploadProfilePhoto = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return await uploadFile(API_ENDPOINTS.UPDATE_PROFILE_PHOTO, formData)
}

/**
 * Remove/delete profile photo from server
 * @returns {Promise} - Updated user profile data
 */
export const removeProfilePhoto = async () => {
  const token = getAuthToken()
  
  try {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.DELETE_PROFILE_PHOTO}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    })

    const contentType = response.headers.get('content-type')
    let data = {}

    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json()
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError)
        data = { message: response.statusText || 'Invalid response from server' }
      }
    } else {
      const text = await response.text()
      data = { message: text || response.statusText || 'Invalid response from server' }
    }

    if (!response.ok) {
      const errorMessage = data.detail || data.message || `API Error: ${response.statusText}`
      const error = new Error(errorMessage)
      error.status = response.status
      error.data = data
      throw error
    }

    return data
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error: Could not connect to server. Please check if backend is running.')
    }
    throw error
  }
}

/**
 * Get list of platform users with admin roles (Admin, HR, Talent Acquisition). Admin only.
 * @returns {Promise<{ users: Array<{ id, name, email, mode, employee_id?, created_at? }> }>}
 */
export const getPlatformAdminUsers = async () => {
  return await apiRequest(API_ENDPOINTS.ADMIN_PLATFORM_ADMINS)
}

/**
 * Get admin notifications (recent resume uploads, job applications). Admin only.
 * @param {object} params - Optional { limit, days }
 * @returns {Promise<{ notifications: Array, unread_count: number }>}
 */
export const getAdminNotifications = async (params = {}) => {
  const q = new URLSearchParams()
  if (params.limit != null) q.set('limit', params.limit)
  if (params.days != null) q.set('days', params.days)
  const query = q.toString()
  return await apiRequest(query ? `${API_ENDPOINTS.ADMIN_NOTIFICATIONS}?${query}` : API_ENDPOINTS.ADMIN_NOTIFICATIONS)
}

/**
 * Delete a platform user by ID (Admin only). Removes user credentials from database.
 * @param {number} userId - User ID to delete
 * @returns {Promise<{ message: string }>}
 */
export const deletePlatformUser = async (userId) => {
  return await apiRequest(`${API_ENDPOINTS.ADMIN_USERS}/${userId}`, { method: 'DELETE' })
}

/**
 * Help assistant query (intent-based, no OpenAI). Returns { reply, data }.
 * @param {string} message - User message
 * @returns {Promise<{ reply: string, data?: object }>}
 */
export const assistantQuery = async (message) => {
  return await apiRequest(API_ENDPOINTS.ASSISTANT_QUERY, {
    method: 'POST',
    body: JSON.stringify({ message: String(message).trim() })
  })
}

// Resume Upload API Functions
// ============================

/**
 * Upload resume with user profile data
 * @param {File} file - Resume file
 * @param {object} profileData - User profile data (userType, fullName, email, phone)
 * @returns {Promise} - Upload response
 */
export const uploadResumeWithProfile = async (file, profileData = {}) => {
  const formData = new FormData()
  formData.append('file', file)

  if (profileData.userType) {
    formData.append('userType', profileData.userType)
  }
  if (profileData.fullName) {
    formData.append('fullName', profileData.fullName)
  }
  if (profileData.email) {
    formData.append('email', profileData.email)
  }
  if (profileData.phone) {
    formData.append('phone', profileData.phone)
  }
  if (profileData.employee_id) {
    formData.append('employee_id', profileData.employee_id)
  }

  // Additional fields for richer profile data
  if (profileData.experience) {
    formData.append('experience', profileData.experience)
  }
  if (profileData.skills) {
    formData.append('skills', profileData.skills)
  }
  if (profileData.location) {
    formData.append('location', profileData.location)
  }
  if (profileData.education) {
    formData.append('education', profileData.education)
  }
  if (profileData.role) {
    formData.append('role', profileData.role)
  }
  if (profileData.noticePeriod !== undefined) {
    formData.append('noticePeriod', profileData.noticePeriod)
  }
  if (profileData.readyToRelocate !== undefined) {
    formData.append('readyToRelocate', profileData.readyToRelocate)
  }
  if (profileData.preferredLocation) {
    formData.append('preferredLocation', profileData.preferredLocation)
  }
  // Always send LinkedIn and Portfolio so backend can store them (empty string if not provided)
  formData.append('linkedIn', profileData.linkedIn != null ? String(profileData.linkedIn).trim() : '')
  formData.append('portfolio', profileData.portfolio != null ? String(profileData.portfolio).trim() : '')
  if (profileData.jobId) {
    formData.append('jobId', profileData.jobId)
  }

  return await uploadFile(API_ENDPOINTS.UPLOAD_USER_PROFILE, formData)
}

/**
 * Parse resume for autofill (doesn't save to database)
 * Works for all user types: Company Employee, Freelancer, Guest User
 * @param {File} file - Resume file
 * @returns {Promise} - Parsed resume data
 */
export const parseResumeOnly = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const token = getAuthToken()

  try {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.PARSE_RESUME_ONLY}`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    })

    // Check content type before parsing JSON
    const contentType = response.headers.get('content-type')
    let data = {}

    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json()
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError)
        data = { message: response.statusText || 'Invalid response from server' }
      }
    } else {
      const text = await response.text()
      data = { message: text || response.statusText || 'Invalid response from server' }
    }

    if (!response.ok) {
      const errorMessage = data.detail || data.message || `API Error: ${response.statusText}`
      const error = new Error(errorMessage)
      error.status = response.status
      error.data = data
      throw error
    }

    return data
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error: Could not connect to server. Please check if backend is running.')
    }
    if (error.message) {
      throw error
    }
    throw new Error('Failed to parse resume. Please try again.')
  }
}

// Job Openings API Functions
// ===========================

/**
 * Get all job openings
 * @param {object} params - Query parameters (status, business_area, skip, limit)
 * @returns {Promise} - Job openings list
 */
export const getJobOpenings = async (params = {}) => {
  const queryParams = new URLSearchParams()
  if (params.status) queryParams.append('status', params.status)
  if (params.business_area) queryParams.append('business_area', params.business_area)
  if (params.skip) queryParams.append('skip', params.skip)
  if (params.limit) queryParams.append('limit', params.limit)
  
  const queryString = queryParams.toString()
  const endpoint = queryString ? `${API_ENDPOINTS.GET_JOB_OPENINGS}?${queryString}` : API_ENDPOINTS.GET_JOB_OPENINGS
  
  return await apiRequest(endpoint)
}

/**
 * Get a specific job opening by job_id
 * @param {string} jobId - Job ID
 * @returns {Promise} - Job opening data
 */
export const getJobOpening = async (jobId) => {
  return await apiRequest(`${API_ENDPOINTS.GET_JOB_OPENING}/${jobId}`)
}

/**
 * Get applicants (resumes) for a specific job opening. Admin only. Same shape as Records.
 * @param {string} jobId - Job ID
 * @returns {Promise<{ job_id, job_title, applicants }>}
 */
export const getJobApplicants = async (jobId) => {
  return await apiRequest(`${API_ENDPOINTS.GET_JOB_OPENINGS}/${jobId}/applicants`)
}

/**
 * Filter job openings by business_area or title
 * @param {object} params - Filter parameters (business_area, title)
 * @returns {Promise} - Filtered job openings
 */
export const filterJobOpenings = async (params = {}) => {
  const queryParams = new URLSearchParams()
  if (params.business_area) queryParams.append('business_area', params.business_area)
  if (params.title) queryParams.append('title', params.title)
  
  const queryString = queryParams.toString()
  const endpoint = queryString ? `${API_ENDPOINTS.FILTER_JOB_OPENINGS}?${queryString}` : API_ENDPOINTS.FILTER_JOB_OPENINGS
  
  return await apiRequest(endpoint)
}

/**
 * Create a new job opening (admin only)
 * @param {object} jobData - Job opening data
 * @param {File} jdFile - Optional JD file
 * @returns {Promise} - Created job opening
 */
export const createJobOpening = async (jobData, jdFile = null) => {
  const formData = new FormData()
  formData.append('title', jobData.title)
  formData.append('location', jobData.location)
  formData.append('business_area', jobData.business_area)
  if (jobData.experience_required) formData.append('experience_required', jobData.experience_required)
  if (jobData.job_type) formData.append('job_type', jobData.job_type)
  if (jobData.description) formData.append('description', jobData.description)
  if (jobData.status) formData.append('status', jobData.status)
  if (jdFile) formData.append('jd_file', jdFile)
  
  return await uploadFile(API_ENDPOINTS.CREATE_JOB_OPENING, formData)
}

/**
 * Update a job opening (admin only)
 * @param {string} jobId - Job ID
 * @param {object} jobData - Updated job opening data
 * @param {File} jdFile - Optional JD file
 * @returns {Promise} - Updated job opening
 */
export const updateJobOpening = async (jobId, jobData, jdFile = null) => {
  const formData = new FormData()
  if (jobData.title) formData.append('title', jobData.title)
  if (jobData.location) formData.append('location', jobData.location)
  if (jobData.business_area) formData.append('business_area', jobData.business_area)
  if (jobData.experience_required !== undefined) formData.append('experience_required', jobData.experience_required)
  if (jobData.job_type !== undefined) formData.append('job_type', jobData.job_type || '')
  if (jobData.description !== undefined) formData.append('description', jobData.description)
  if (jobData.status) formData.append('status', jobData.status)
  if (jdFile) formData.append('jd_file', jdFile)
  
  return await uploadFile(`${API_ENDPOINTS.UPDATE_JOB_OPENING}/${jobId}`, formData, 'PUT')
}

/**
 * Delete a job opening (admin only)
 * @param {string} jobId - Job ID
 * @returns {Promise} - Deletion response
 */
export const deleteJobOpening = async (jobId) => {
  return await apiRequest(`${API_ENDPOINTS.DELETE_JOB_OPENING}/${jobId}`, {
    method: 'DELETE',
  })
}

// Employee List (Admin) - Company Employee verification toggle and CSV upload
// =============================================================================

/**
 * Get employee list config (enabled, count from uploaded list in DB)
 * @returns {Promise<{enabled: boolean, count: number}>}
 */
export const getEmployeeListConfig = async () => {
  return await apiRequest(API_ENDPOINTS.EMPLOYEE_LIST_CONFIG)
}

/**
 * Update employee list config (verification on/off)
 * @param {object} params - { enabled?: boolean }
 * @returns {Promise<{enabled: boolean, count: number}>}
 */
export const updateEmployeeListConfig = async (params = {}) => {
  return await apiRequest(API_ENDPOINTS.EMPLOYEE_LIST_CONFIG, {
    method: 'PUT',
    body: JSON.stringify(params),
  })
}

/**
 * Upload CSV to replace company employee list (admin only)
 * @param {File} file - CSV file with columns employee_id, full_name, email
 * @returns {Promise<{count: number, message: string}>}
 */
/** Upload CSV or Excel (.xlsx, .xls) to replace employee list. Columns: employee_id, full_name, email */
export const uploadEmployeeListCsv = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return await uploadFile(API_ENDPOINTS.EMPLOYEE_LIST_UPLOAD, formData)
}

/**
 * Get list of uploaded employees (admin only)
 * @param {object} params - { limit?, offset? }
 * @returns {Promise<{items: Array<{employee_id, full_name, email}>, total: number}>}
 */
export const getEmployeeList = async (params = {}) => {
  const q = new URLSearchParams(params).toString()
  const endpoint = q ? `${API_ENDPOINTS.EMPLOYEE_LIST}?${q}` : API_ENDPOINTS.EMPLOYEE_LIST
  return await apiRequest(endpoint)
}

/**
 * Get the list difference (employees in previous list but not in new list after last upload).
 * @returns {Promise<{left_employees: Array<{user_id, email, employee_id, full_name}>}>}
 */
export const getEmployeeListLeftAfterUpload = async () => {
  return await apiRequest(API_ENDPOINTS.EMPLOYEE_LIST_LEFT_AFTER_UPLOAD)
}

/**
 * Downgrade users from Company Employee to Guest User (e.g. after they left - not in new list).
 * @param {number[]} userIds - User IDs from upload response left_employees
 * @returns {Promise<{updated: number, message: string}>}
 */
export const downgradeLeftEmployees = async (userIds) => {
  return await apiRequest(API_ENDPOINTS.EMPLOYEE_LIST_DOWNGRADE_LEFT, {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  })
}

