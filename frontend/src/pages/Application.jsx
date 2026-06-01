import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../context/AppContext'
import { uploadResumeWithProfile, parseResumeOnly } from '../config/api'
import Navbar from '../components/Navbar'
import './Application.css'
import { normalizeDashes } from '../utils/normalizeDashes'

/** Coerce parse API values (string, number, or nested { email }) for safe autofill. */
const asTrimmedString = (value) => {
  if (value == null) return ''
  if (typeof value === 'string') return normalizeDashes(value).trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (typeof value === 'object') {
    if (typeof value.email === 'string') return value.email.trim()
    const first = Object.values(value).find((v) => typeof v === 'string' && v.trim())
    return first ? first.trim() : ''
  }
  return String(value).trim()
}

const hasAutofillValue = (value, { disallow = [] } = {}) => {
  const s = asTrimmedString(value)
  if (!s) return false
  if (disallow.includes(s)) return false
  return true
}

const Application = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { selectedEmploymentType, userProfile, portalEmployeeId } = useApp()

  useEffect(() => {
    if (!selectedEmploymentType) {
      navigate('/', { replace: true })
    }
  }, [selectedEmploymentType, navigate])

  // Back: portal users have no back button; logged-in users go to dashboard
  const isPortalUser = () => {
    if (!selectedEmploymentType) return false
    const id = selectedEmploymentType.id
    const title = (selectedEmploymentType.title || '').toLowerCase()
    return id === 'guest-user' || title === 'guest user' ||
      id === 'freelancer' || title === 'freelancer' ||
      id === 'company-employee' || title === 'company employee'
  }
  const getBackPath = () => '/dashboard'

  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    zipCode: '',
    experience: '',
    experiences: [],
    skills: '',
    role: '',
    education: [],
    linkedIn: '',
    portfolio: '',
    currentlyWorking: true,
    currentCompany: '',
    readyToRelocate: false,
    preferredLocation: '',
    noticePeriod: 0
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [autoFilledFields, setAutoFilledFields] = useState(new Set())
  const [uploadProgress, setUploadProgress] = useState(0)

  // Helper function to check if field is auto-filled
  const isAutoFilled = (fieldName) => {
    return autoFilledFields.has(fieldName)
  }

  // Progress simulation for better UX
  const simulateProgress = () => {
    let progress = 0
    const interval = setInterval(() => {
      progress += 10
      if (progress < 90) {
        setUploadProgress(progress)
      }
    }, 200)
    return interval
  }

  // File upload handlers
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    } else {
      // Form field change
      setFormData({
        ...formData,
        [e.target.name]: e.target.value
      })
    }
  }

  const handleFile = async (selectedFile) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowedTypes.includes(selectedFile.type)) {
      alert('Please upload a PDF or DOCX document')
      return
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      alert('File size should be less than 5MB')
      return
    }

    setFile(selectedFile)
    setAutoFilledFields(new Set())

    // Start progress simulation
    const progressInterval = simulateProgress()

    try {
      console.log('🔄 Starting resume parsing...', selectedFile.name)
      
      // Parse resume to autofill form
      const parseResult = await parseResumeOnly(selectedFile)
      
      // Complete progress to 100%
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      console.log('📋 Parse result:', parseResult)
      
      if (parseResult.success && parseResult.data) {
        const parsed = parseResult.data
        const filledFields = new Set()
        
        console.log('📝 Parsed data:', parsed)
        
        // Auto-fill form fields - ONLY if data exists
        const updates = {}
        
        if (hasAutofillValue(parsed.firstName)) {
          updates.firstName = asTrimmedString(parsed.firstName)
          filledFields.add('firstName')
        }
        
        if (hasAutofillValue(parsed.lastName)) {
          updates.lastName = asTrimmedString(parsed.lastName)
          filledFields.add('lastName')
        }
        
        if (hasAutofillValue(parsed.email, { disallow: ['Not mentioned'] })) {
          updates.email = asTrimmedString(parsed.email)
          filledFields.add('email')
        }
        
        if (hasAutofillValue(parsed.phone)) {
          updates.phone = asTrimmedString(parsed.phone)
          filledFields.add('phone')
        }
        
        if (hasAutofillValue(parsed.city)) {
          updates.city = asTrimmedString(parsed.city)
          filledFields.add('city')
        }
        
        if (hasAutofillValue(parsed.country)) {
          updates.country = asTrimmedString(parsed.country)
          filledFields.add('country')
        }
        
        if (hasAutofillValue(parsed.address)) {
          updates.address = asTrimmedString(parsed.address)
          filledFields.add('address')
        }
        
        if (hasAutofillValue(parsed.zipCode)) {
          updates.zipCode = asTrimmedString(parsed.zipCode)
          filledFields.add('zipCode')
        }
        
        if (hasAutofillValue(parsed.currentCompany)) {
          updates.currentCompany = asTrimmedString(parsed.currentCompany)
          filledFields.add('currentCompany')
        }
        
        if (hasAutofillValue(parsed.role, { disallow: ['Not mentioned'] })) {
          updates.role = asTrimmedString(parsed.role)
          filledFields.add('role')
        }
        
        const experienceStr = asTrimmedString(parsed.experience)
        if (experienceStr && experienceStr !== '0') {
          updates.experience = experienceStr
          filledFields.add('experience')
        }
        
        if (hasAutofillValue(parsed.skills)) {
          updates.skills = asTrimmedString(parsed.skills)
          filledFields.add('skills')
        }
        
        if (hasAutofillValue(parsed.education)) {
          // Convert single education string to array format
          updates.education = [{
            degree: asTrimmedString(parsed.education),
            institution: 'Detected',
            field_of_study: '',
            start_date: '',
            end_date: '',
            grade: ''
          }]
          filledFields.add('education')
        }
        
        // Only update if we have data
        if (Object.keys(updates).length > 0) {
          setFormData(prev => ({
            ...prev,
            ...updates
          }))
          setAutoFilledFields(filledFields)
          
          // Show success message
          console.log('✅ Resume parsed successfully! Form fields auto-filled.')
          setTimeout(() => {
            const filledFieldsList = Array.from(filledFields).map(f => {
            const fieldNames = {
              firstName: 'First Name',
              lastName: 'Last Name',
              email: 'Email',
              phone: 'Phone',
              address: 'Address',
              city: 'City',
              country: 'Country',
              zipCode: 'Zip Code',
              role: 'Role',
              currentCompany: 'Current Company',
              experience: 'Experience',
              skills: 'Skills',
              education: 'Education'
            }
              return fieldNames[f] || f
            }).join(', ')
            
            alert(`✅ Resume parsed successfully!\n\n📝 Auto-filled ${filledFields.size} field(s):\n${filledFieldsList}\n\n✏️ You can now review and edit any field as needed.\n\nFields with ✨ icon are auto-filled and can be edited.`)
          }, 500)
        } else {
          alert('⚠️ Resume parsed but no extractable data found for autofill.')
        }
        
        // Reset progress after showing message
        setTimeout(() => setUploadProgress(0), 2000)
      } else {
        alert('⚠️ Resume parsed but no data returned.')
        clearInterval(progressInterval)
        setUploadProgress(0)
      }
    } catch (error) {
      console.error('❌ Failed to parse resume for autofill:', error)
      clearInterval(progressInterval)
      setUploadProgress(0)
      alert(`❌ Failed to parse resume: ${error.message || 'Unknown error'}\n\nYou can still fill the form manually and submit.`)
    }
  }

  const handleRemove = () => {
    setFile(null)
    setAutoFilledFields(new Set())
    setUploadProgress(0)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!file) {
      alert('Please upload your CV/Resume first')
      return
    }

    setSubmitting(true)

    try {
      // Prepare profile data for upload
      // Prepare profile data for upload
      const profileData = {
        userType: selectedEmploymentType?.title || selectedEmploymentType?.name || 'Guest User',
        fullName: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email || userProfile?.email || '',
        phone: formData.phone || '',
        address: formData.address || '',
        city: formData.city || '',
        country: formData.country || '',
        experience: formData.experience || '0',
        experiences: JSON.stringify(formData.experiences || []),
        skills: formData.skills || '',
        role: formData.role || '',
        location: [formData.city, formData.country].filter(Boolean).join(', '),
        education: JSON.stringify(formData.education || []),
        noticePeriod: parseInt(formData.noticePeriod) || 0,
        currentlyWorking: formData.currentlyWorking,
        currentCompany: formData.currentCompany,
        readyToRelocate: formData.readyToRelocate,
        preferredLocation: formData.preferredLocation,
        linkedIn: formData.linkedIn || '',
        portfolio: formData.portfolio || ''
      }
      if (portalEmployeeId && (selectedEmploymentType?.id === 'company-employee' || selectedEmploymentType?.title === 'Company Employee')) {
        profileData.employee_id = portalEmployeeId
      }
      const jobId = searchParams.get('jobId')
      if (jobId) {
        profileData.jobId = jobId
      }

      // Upload resume with profile data
      const result = await uploadResumeWithProfile(file, profileData)

      setSubmitting(false)
      if (isPortalUser()) {
        setSubmitSuccess(true)
      } else {
        alert(`Application submitted successfully! Resume ID: ${result.resume_id}`)
        navigate('/dashboard')
      }
    } catch (error) {
      console.error('Application submission error:', error)
      alert(error.message || 'Failed to submit application. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="application-container">
      <div className="animated-background">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
        <div className="gradient-orb orb-4"></div>
      </div>

      <Navbar
        userProfile={userProfile}
        showProfile={false}
        showLogout={false}
        centerHeading={
          selectedEmploymentType
            ? selectedEmploymentType.id === 'guest-user' || selectedEmploymentType.title === 'Guest User'
              ? 'Candidate'
              : selectedEmploymentType.id === 'freelancer' || selectedEmploymentType.title === 'Freelancer'
                ? 'Freelancer'
                : selectedEmploymentType.id === 'company-employee' || selectedEmploymentType.title === 'Company Employee'
                  ? 'Company Employee'
                  : selectedEmploymentType.title || null
            : null
        }
      />

      {submitSuccess ? (
        <div
          className="thank-you-wrapper"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 'calc(100vh - 120px)',
            padding: '2rem',
            boxSizing: 'border-box'
          }}
        >
          <motion.div
            className="application-content thank-you-content form-section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              maxWidth: '560px',
              width: '100%',
              margin: '0 auto',
              padding: '3rem 2rem',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: '18px',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
            }}
          >
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem', color: '#000' }}>✓</div>
            <h2 style={{ color: '#000', marginBottom: '1rem', fontSize: '1.75rem', fontWeight: '600' }}>
              Thank you for your response
            </h2>
            <p style={{ color: '#000', fontSize: '1.1rem', lineHeight: 1.6 }}>
              We have received your application and will contact you soon.
            </p>
          </motion.div>
        </div>
      ) : (
      <div className="application-content">
        <motion.form
          className="application-form"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {/* CV Upload Section */}
          <motion.div
            className="form-section upload-section"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h2>Upload CV/Resume</h2>
            <div
              className={`drop-zone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {!file ? (
                <>
                  <motion.div
                    className="upload-icon"
                    animate={{ y: [0, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    📄
                  </motion.div>
                  <h3>Drag & Drop your CV/Resume here</h3>
                  <p>or</p>
                  <label htmlFor="file-input" className="browse-button">
                    Browse Files
                  </label>
                  <input
                    id="file-input"
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleChange}
                    style={{ display: 'none' }}
                  />
                  <p className="file-hint">
                    💡 Upload your resume to auto-fill the form below. You can edit any field after auto-fill.
                    <br />
                    Supported formats: PDF, DOCX (Max 5MB)
                  </p>
                </>
              ) : (
                <motion.div
                  className="file-preview"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <div className="file-icon">📄</div>
                  <div className="file-info">
                    <h3>{file.name}</h3>
                    <p>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="upload-progress">
                        <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                        <span>Parsing resume... {uploadProgress}%</span>
                      </div>
                    )}
                    {uploadProgress === 100 && (
                      <div className="upload-complete">✅ Complete! Auto-filling form...</div>
                    )}
                  </div>
                  <button type="button" className="remove-button" onClick={handleRemove}>
                    ✕
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Auto-fill notification */}
          {file && autoFilledFields.size > 0 && (
            <motion.div
              className="autofill-notification"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="notification-content">
                ✨ {autoFilledFields.size} field(s) auto-filled from resume. Review and edit any field as needed.
              </div>
            </motion.div>
          )}

          {/* Personal Information Section */}
          <motion.div
            className="form-section"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <h2>Personal Information</h2>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">
                  First Name *
                  {isAutoFilled('firstName') && (
                    <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                  )}
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className={isAutoFilled('firstName') ? 'auto-filled' : ''}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="lastName">
                  Last Name *
                  {isAutoFilled('lastName') && (
                    <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                  )}
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className={isAutoFilled('lastName') ? 'auto-filled' : ''}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email">
                  Email *
                  {isAutoFilled('email') && (
                    <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                  )}
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={isAutoFilled('email') ? 'auto-filled' : ''}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="phone">
                  Phone *
                  {isAutoFilled('phone') && (
                    <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                  )}
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className={isAutoFilled('phone') ? 'auto-filled' : ''}
                  required
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            className="form-section"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <h2>Address</h2>
            <div className="form-group">
              <label htmlFor="address">
                Street Address
                {isAutoFilled('address') && (
                  <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                )}
              </label>
              <input
                type="text"
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className={isAutoFilled('address') ? 'auto-filled' : ''}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="city">
                  City
                  {isAutoFilled('city') && (
                    <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                  )}
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className={isAutoFilled('city') ? 'auto-filled' : ''}
                />
              </div>
              <div className="form-group">
                <label htmlFor="country">
                  Country
                  {isAutoFilled('country') && (
                    <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                  )}
                </label>
                <input
                  type="text"
                  id="country"
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                  className={isAutoFilled('country') ? 'auto-filled' : ''}
                />
              </div>
              <div className="form-group">
                <label htmlFor="zipCode">
                  Zip Code
                  {isAutoFilled('zipCode') && (
                    <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                  )}
                </label>
                <input
                  type="text"
                  id="zipCode"
                  name="zipCode"
                  value={formData.zipCode}
                  onChange={handleChange}
                  className={isAutoFilled('zipCode') ? 'auto-filled' : ''}
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            className="form-section"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <h2>Professional Information</h2>
            <div className="form-group">
              <label htmlFor="experience">
                Years of Experience
                {isAutoFilled('experience') && (
                  <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                )}
              </label>
              <input
                type="number"
                id="experience"
                name="experience"
                value={formData.experience}
                onChange={handleChange}
                className={isAutoFilled('experience') ? 'auto-filled' : ''}
                min="0"
              />
            </div>
            {selectedEmploymentType?.id !== 'guest-user' && (
              <div className="form-group">
                <label>
                  Work Experience
                  {isAutoFilled('experiences') && (
                    <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                  )}
                </label>
                {formData.experiences.map((exp, index) => (
                  <div key={index} className="experience-entry" style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid rgba(50, 130, 184, 0.3)', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, color: '#3282b8', fontSize: '0.9rem' }}>Experience {index + 1}</h4>
                      {formData.experiences.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newExperiences = formData.experiences.filter((_, i) => i !== index)
                            setFormData({ ...formData, experiences: newExperiences })
                          }}
                          style={{
                            background: '#ff4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`experience-role-${index}`}>Job Title/Role *</label>
                        <input
                          type="text"
                          id={`experience-role-${index}`}
                          value={exp.role || ''}
                          onChange={(e) => {
                            const newExperiences = [...formData.experiences]
                            newExperiences[index] = { ...newExperiences[index], role: e.target.value }
                            setFormData({ ...formData, experiences: newExperiences })
                          }}
                          placeholder="e.g., Software Engineer, Senior Developer"
                          required
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`experience-company-${index}`}>Company Name *</label>
                        <input
                          type="text"
                          id={`experience-company-${index}`}
                          value={exp.company || ''}
                          onChange={(e) => {
                            const newExperiences = [...formData.experiences]
                            newExperiences[index] = { ...newExperiences[index], company: e.target.value }
                            setFormData({ ...formData, experiences: newExperiences })
                          }}
                          placeholder="Company name"
                          required
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`experience-location-${index}`}>Location</label>
                        <input
                          type="text"
                          id={`experience-location-${index}`}
                          value={exp.location || ''}
                          onChange={(e) => {
                            const newExperiences = [...formData.experiences]
                            newExperiences[index] = { ...newExperiences[index], location: e.target.value }
                            setFormData({ ...formData, experiences: newExperiences })
                          }}
                          placeholder="e.g., Mumbai, India"
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`experience-start-${index}`}>Start Date</label>
                        <input
                          type="text"
                          id={`experience-start-${index}`}
                          value={exp.start_date || ''}
                          onChange={(e) => {
                            const newExperiences = [...formData.experiences]
                            newExperiences[index] = { ...newExperiences[index], start_date: e.target.value }
                            setFormData({ ...formData, experiences: newExperiences })
                          }}
                          placeholder="e.g., Jan 2020 or 2020-01"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`experience-end-${index}`}>End Date</label>
                        <input
                          type="text"
                          id={`experience-end-${index}`}
                          value={exp.end_date || ''}
                          onChange={(e) => {
                            const newExperiences = [...formData.experiences]
                            newExperiences[index] = { ...newExperiences[index], end_date: e.target.value, is_current: false }
                            setFormData({ ...formData, experiences: newExperiences })
                          }}
                          placeholder="e.g., Dec 2022 or Present"
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, display: 'flex', alignItems: 'center', paddingTop: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={exp.is_current || false}
                            onChange={(e) => {
                              const newExperiences = [...formData.experiences]
                              newExperiences[index] = { 
                                ...newExperiences[index], 
                                is_current: e.target.checked,
                                end_date: e.target.checked ? 'Present' : newExperiences[index].end_date
                              }
                              setFormData({ ...formData, experiences: newExperiences })
                            }}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          <span>Currently working here</span>
                        </label>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor={`experience-description-${index}`}>Job Description</label>
                      <textarea
                        id={`experience-description-${index}`}
                        value={exp.description || ''}
                        onChange={(e) => {
                          const newExperiences = [...formData.experiences]
                          newExperiences[index] = { ...newExperiences[index], description: e.target.value }
                          setFormData({ ...formData, experiences: newExperiences })
                        }}
                        placeholder="Describe your responsibilities and achievements"
                        rows="3"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="form-group">
              <label htmlFor="role">
                Professional Role *
                {isAutoFilled('role') && (
                  <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                )}
              </label>
              <input
                type="text"
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className={isAutoFilled('role') ? 'auto-filled' : ''}
                placeholder="e.g., Software Engineer, Data Scientist"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="skills">
                Skills (comma separated)
                {isAutoFilled('skills') && (
                  <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                )}
              </label>
              <input
                type="text"
                id="skills"
                name="skills"
                value={formData.skills}
                onChange={handleChange}
                className={isAutoFilled('skills') ? 'auto-filled' : ''}
                placeholder="e.g., React, Node.js, Python"
              />
            </div>
            {true && (
              <>
                {/* Currently Working Toggle */}
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Currently Working?</label>
                  <div className="relocation-toggle-group" style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      className={`toggle-option ${formData.currentlyWorking ? 'active' : ''}`}
                      onClick={() => setFormData(prev => ({ ...prev, currentlyWorking: true }))}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '12px',
                        border: '2px solid #3282b8',
                        background: formData.currentlyWorking ? '#3282b8' : 'rgba(255, 255, 255, 0.5)',
                        color: formData.currentlyWorking ? 'white' : '#3282b8',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: formData.currentlyWorking ? '0 4px 12px rgba(50, 130, 184, 0.3)' : 'none'
                      }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className={`toggle-option ${!formData.currentlyWorking ? 'active' : ''}`}
                      onClick={() => setFormData(prev => ({ ...prev, currentlyWorking: false }))}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '12px',
                        border: '2px solid #3282b8',
                        background: !formData.currentlyWorking ? '#3282b8' : 'rgba(255, 255, 255, 0.5)',
                        color: !formData.currentlyWorking ? 'white' : '#3282b8',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: !formData.currentlyWorking ? '0 4px 12px rgba(50, 130, 184, 0.3)' : 'none'
                      }}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Current Company Name (conditional) */}
                {formData.currentlyWorking && (
                  <motion.div
                    className="form-group"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ marginBottom: '1.5rem' }}
                  >
                    <label htmlFor="currentCompany">
                      Current Company Name
                      {isAutoFilled('currentCompany') && (
                        <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                      )}
                    </label>
                    <input
                      type="text"
                      id="currentCompany"
                      name="currentCompany"
                      value={formData.currentCompany}
                      onChange={handleChange}
                      placeholder="e.g., Google, Microsoft, Accenture"
                      autoComplete="off"
                      className={isAutoFilled('currentCompany') ? 'auto-filled' : ''}
                    />
                  </motion.div>
                )}

                {/* Ready to Relocate Toggle */}
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Ready to Relocate?</label>
                  <div className="relocation-toggle-group" style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      className={`toggle-option ${formData.readyToRelocate ? 'active' : ''}`}
                      onClick={() => setFormData(prev => ({ ...prev, readyToRelocate: true }))}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '12px',
                        border: '2px solid #3282b8',
                        background: formData.readyToRelocate ? '#3282b8' : 'rgba(255, 255, 255, 0.5)',
                        color: formData.readyToRelocate ? 'white' : '#3282b8',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: formData.readyToRelocate ? '0 4px 12px rgba(50, 130, 184, 0.3)' : 'none'
                      }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className={`toggle-option ${!formData.readyToRelocate ? 'active' : ''}`}
                      onClick={() => setFormData(prev => ({ ...prev, readyToRelocate: false, preferredLocation: '' }))}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '12px',
                        border: '2px solid #3282b8',
                        background: !formData.readyToRelocate ? '#3282b8' : 'rgba(255, 255, 255, 0.5)',
                        color: !formData.readyToRelocate ? 'white' : '#3282b8',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: !formData.readyToRelocate ? '0 4px 12px rgba(50, 130, 184, 0.3)' : 'none'
                      }}
                    >
                      No
                    </button>
                  </div>
                </div>

                {formData.readyToRelocate && (
                  <motion.div
                    className="form-group"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ marginBottom: '1.5rem' }}
                  >
                    <label htmlFor="preferredLocation">Preferred Relocation Location</label>
                    <input
                      type="text"
                      id="preferredLocation"
                      name="preferredLocation"
                      value={formData.preferredLocation}
                      onChange={handleChange}
                      placeholder="e.g. Mumbai, Remote, Overseas"
                      autoComplete="off"
                    />
                  </motion.div>
                )}

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label htmlFor="noticePeriod">Notice Period (Days)</label>
                  <input
                    type="number"
                    id="noticePeriod"
                    name="noticePeriod"
                    value={formData.noticePeriod}
                    onChange={handleChange}
                    placeholder="e.g., 30"
                    min="0"
                  />
                </div>
              </>
            )}
            {selectedEmploymentType?.id !== 'guest-user' && (
              <div className="form-group">
                <label>
                  Education
                  {isAutoFilled('education') && (
                    <span className="auto-filled-badge" title="Auto-filled from resume">✨</span>
                  )}
                </label>
                {formData.education.map((edu, index) => (
                  <div key={index} className="education-entry" style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid rgba(50, 130, 184, 0.3)', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, color: '#3282b8', fontSize: '0.9rem' }}>Education {index + 1}</h4>
                      {formData.education.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newEducation = formData.education.filter((_, i) => i !== index)
                            setFormData({ ...formData, education: newEducation })
                          }}
                          style={{
                            background: '#ff4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`education-degree-${index}`}>Degree/Qualification *</label>
                        <input
                          type="text"
                          id={`education-degree-${index}`}
                          value={edu.degree || ''}
                          onChange={(e) => {
                            const newEducation = [...formData.education]
                            newEducation[index] = { ...newEducation[index], degree: e.target.value }
                            setFormData({ ...formData, education: newEducation })
                          }}
                          placeholder="e.g., 10th, 12th, B.Tech, M.Tech, MBA"
                          required
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`education-institution-${index}`}>School/College/University</label>
                        <input
                          type="text"
                          id={`education-institution-${index}`}
                          value={edu.institution || ''}
                          onChange={(e) => {
                            const newEducation = [...formData.education]
                            newEducation[index] = { ...newEducation[index], institution: e.target.value }
                            setFormData({ ...formData, education: newEducation })
                          }}
                          placeholder="Institution name"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`education-field-${index}`}>Field of Study</label>
                        <input
                          type="text"
                          id={`education-field-${index}`}
                          value={edu.field_of_study || ''}
                          onChange={(e) => {
                            const newEducation = [...formData.education]
                            newEducation[index] = { ...newEducation[index], field_of_study: e.target.value }
                            setFormData({ ...formData, education: newEducation })
                          }}
                          placeholder="e.g., Computer Science, Mathematics"
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`education-grade-${index}`}>Grade/CGPA/Percentage</label>
                        <input
                          type="text"
                          id={`education-grade-${index}`}
                          value={edu.grade || ''}
                          onChange={(e) => {
                            const newEducation = [...formData.education]
                            newEducation[index] = { ...newEducation[index], grade: e.target.value }
                            setFormData({ ...formData, education: newEducation })
                          }}
                          placeholder="e.g., 8.5 CGPA, 85%"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`education-start-${index}`}>Start Year</label>
                        <input
                          type="text"
                          id={`education-start-${index}`}
                          value={edu.start_date || ''}
                          onChange={(e) => {
                            const newEducation = [...formData.education]
                            newEducation[index] = { ...newEducation[index], start_date: e.target.value }
                            setFormData({ ...formData, education: newEducation })
                          }}
                          placeholder="e.g., 2018"
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label htmlFor={`education-end-${index}`}>End Year</label>
                        <input
                          type="text"
                          id={`education-end-${index}`}
                          value={edu.end_date || ''}
                          onChange={(e) => {
                            const newEducation = [...formData.education]
                            newEducation[index] = { ...newEducation[index], end_date: e.target.value }
                            setFormData({ ...formData, education: newEducation })
                          }}
                          placeholder="e.g., 2022 or Present"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* LinkedIn & Portfolio - shown for all portals (Guest, Freelancer, Employee) so links are stored */}
          <motion.div
            className="form-section"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <h2>Links</h2>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="linkedIn">LinkedIn Profile</label>
                <input
                  type="url"
                  id="linkedIn"
                  name="linkedIn"
                  value={formData.linkedIn}
                  onChange={handleChange}
                  placeholder="https://linkedin.com/in/yourprofile"
                />
              </div>
              <div className="form-group">
                <label htmlFor="portfolio">Portfolio/Website</label>
                <input
                  type="url"
                  id="portfolio"
                  name="portfolio"
                  value={formData.portfolio}
                  onChange={handleChange}
                  placeholder="https://yourportfolio.com"
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            className="form-actions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
          >
            {!isPortalUser() && (
              <button
                type="button"
                className="back-button"
                onClick={() => navigate(getBackPath())}
              >
                ← Back
              </button>
            )}
            <button
              type="submit"
              className="submit-button"
              disabled={submitting || !file}
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </motion.div>
        </motion.form>
      </div>
      )}
    </div>
  )
}

export default Application

