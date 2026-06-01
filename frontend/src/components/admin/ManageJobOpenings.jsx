import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  getJobOpenings,
  getJobApplicants,
  createJobOpening,
  updateJobOpening,
  deleteJobOpening,
  API_BASE_URL,
  API_ENDPOINTS
} from '../../config/api'
import { emitAdminActivity } from '../../utils/adminActivity'
import './ManageJobOpenings.css'
import './AdminDashboard.css'

const getInitials = (name) => {
  const s = typeof name === 'string' ? name : (name?.name || name?.full_name || '')
  if (!s || s === 'N/A') return '??'
  return s.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().substring(0, 2)
}
const formatUserType = (type) => {
  if (!type || typeof type !== 'string') return 'N/A'
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
const renderSafe = (value, fallback = 'N/A') => {
  if (value == null) return fallback
  if (typeof value === 'object') {
    if (typeof value.email === 'string' && value.email.trim()) return value.email
    if (typeof value.name === 'string' && value.name.trim()) return value.name
    return typeof value === 'object' && JSON.stringify(value) !== '{}' ? JSON.stringify(value) : fallback
  }
  return value
}
const cleanCertText = (text) => {
  if (typeof text !== 'string') return ''
  return text.replace(/^[●☐☑✓✔✅❌□■▪▫•◦‣⁃∙⦿⦾]+\s*/g, '').replace(/^[\-\*\d\.]+\s*/g, '').trim()
}
const EMPTY_PLACEHOLDERS = ['', 'n/a', '-', 'no work experience records found', 'no education records found', 'no skills detected', 'no certifications found']
const isFilled = (value) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'number' && !Number.isNaN(value)) return true
  if (typeof value === 'boolean') return true
  const s = String(value).trim()
  if (!s) return false
  return !EMPTY_PLACEHOLDERS.includes(s.toLowerCase())
}

const ManageJobOpenings = () => {
  const [jobOpenings, setJobOpenings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const JOB_TYPE_OPTIONS = [
    { value: '', label: 'Select job type' },
    { value: 'internship', label: 'Internship' },
    { value: 'full_time', label: 'Full-time' },
    { value: 'remote', label: 'Remote' },
    { value: 'hybrid', label: 'Hybrid' },
    { value: 'contract', label: 'Contract' }
  ]
  const [formData, setFormData] = useState({
    title: '',
    location: '',
    business_area: '',
    experience_required: '',
    job_type: '',
    description: '',
    status: 'active'
  })
  const [jdMethod, setJdMethod] = useState('write') // 'write' or 'upload'
  const [jdFile, setJdFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [applicantsModalJob, setApplicantsModalJob] = useState(null)
  const [applicantsList, setApplicantsList] = useState([])
  const [applicantsLoading, setApplicantsLoading] = useState(false)
  const [selectedApplicant, setSelectedApplicant] = useState(null)

  useEffect(() => {
    fetchJobOpenings()
  }, [])

  const handleViewApplicants = async (job) => {
    setApplicantsModalJob(job)
    setSelectedApplicant(null)
    setApplicantsList([])
    setApplicantsLoading(true)
    try {
      const data = await getJobApplicants(job.job_id || job.id)
      setApplicantsList(data.applicants || [])
    } catch (err) {
      console.error('Failed to fetch applicants:', err)
      setApplicantsList([])
    } finally {
      setApplicantsLoading(false)
    }
  }

  const fetchJobOpenings = async () => {
    try {
      setLoading(true)
      setError(null)
      // Admin should see all jobs (active and inactive), so pass status='all'
      let data
      try {
        data = await getJobOpenings({ status: 'all', limit: 1000 }) // Get all jobs for admin
      } catch (adminErr) {
        // If admin request fails (403), try fetching active jobs as fallback
        if (adminErr.status === 403 || adminErr.status === 401) {
          console.warn('Admin access denied, fetching active jobs instead:', adminErr)
          data = await getJobOpenings({ status: 'active', limit: 1000 })
        } else {
          throw adminErr
        }
      }
      console.log('Job openings response:', data)
      // Backend returns { jobs: [...] } or { job_openings: [...] } or array
      const jobs = Array.isArray(data) ? data : (data.jobs || data.job_openings || [])
      console.log('Extracted jobs:', jobs)
      setJobOpenings(jobs)
      if (jobs.length === 0) {
        console.log('No jobs found in response')
      }
    } catch (err) {
      console.error('Error fetching job openings:', err)
      const errorMessage = err.message || err.detail || 'Failed to load job openings'
      setError(errorMessage)
      // If it's a 403 error, it means admin access is required
      if (err.status === 403) {
        setError('Admin access required. Please make sure you are logged in as an admin.')
      }
      // Set empty array on error so UI doesn't break
      setJobOpenings([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // When creating a new job: require JD (either upload a file or write description)
    // When editing: no JD required - can e.g. just change status to inactive
    if (!editingJob) {
      if (jdMethod === 'upload' && !jdFile) {
        setError('Please upload a JD file or switch to "Write JD" method')
        return
      }
    }
    
    try {
      const fileToUpload = jdMethod === 'upload' ? jdFile : null
      let descriptionText = jdMethod === 'write' ? formData.description : ''
      // When editing with Upload selected but no new file, keep existing description so we don't clear it
      if (editingJob && jdMethod === 'upload' && !jdFile && (editingJob.description || formData.description)) {
        descriptionText = editingJob.description || formData.description || ''
      }
      
      const jobData = {
        ...formData,
        description: descriptionText
      }
      
      if (editingJob) {
        await updateJobOpening(editingJob.job_id, jobData, fileToUpload)
        emitAdminActivity({ type: 'job_updated', jobId: editingJob.job_id })
      } else {
        await createJobOpening(jobData, fileToUpload)
        emitAdminActivity({ type: 'job_created' })
      }
      await fetchJobOpenings()
      setShowForm(false)
      setEditingJob(null)
      setJdFile(null)
      setJdMethod('write')
      setFormData({
        title: '',
        location: '',
        business_area: '',
        experience_required: '',
        job_type: '',
        description: '',
        status: 'active'
      })
    } catch (err) {
      console.error('Error saving job opening:', err)
      setError(err.message || 'Failed to save job opening')
    }
  }

  const handleEdit = (job) => {
    setEditingJob(job)
    setFormData({
      title: job.title || '',
      location: job.location || '',
      business_area: job.business_area || '',
      experience_required: job.experience_required || '',
      job_type: job.job_type || '',
      description: job.description || '',
      status: job.status || 'active'
    })
    setJdFile(null)
    setJdMethod(job.jd_file_url ? 'upload' : 'write')
    setShowForm(true)
  }
  
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

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = (selectedFile) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Please upload a PDF, DOC, or DOCX file')
      return
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size should be less than 10MB')
      return
    }

    setJdFile(selectedFile)
    setError(null)
  }

  const handleRemoveFile = () => {
    setJdFile(null)
  }

  const handleDelete = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this job opening?')) {
      return
    }
    try {
      await deleteJobOpening(jobId)
      await fetchJobOpenings()
    } catch (err) {
      console.error('Error deleting job opening:', err)
      setError(err.message || 'Failed to delete job opening')
    }
  }

  return (
    <div className="manage-job-openings">
      <div className="header-section">
        <h1>Manage Job Openings</h1>
        <button
          className="btn-primary"
          onClick={() => {
            setShowForm(!showForm)
            setEditingJob(null)
            setJdFile(null)
            setJdMethod('write')
            setFormData({
              title: '',
              location: '',
              business_area: '',
              experience_required: '',
              job_type: '',
              description: '',
              status: 'active'
            })
          }}
        >
          {showForm ? 'Cancel' : '+ Add New Job Opening'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="job-form"
        >
          <h2>{editingJob ? 'Edit Job Opening' : 'Create New Job Opening'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-row form-row-two">
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Location *</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-row form-row-two">
              <div className="form-group">
                <label>Business Area *</label>
                <select
                  value={formData.business_area}
                  onChange={(e) => setFormData({ ...formData, business_area: e.target.value })}
                  required
                >
                  <option value="">Select Business Area</option>
                  <option value="Data/AI">Data/AI</option>
                  <option value="Inside Sales Executive">Inside Sales Executive</option>
                  <option value="Security Engineer">Security Engineer</option>
                  <option value="Networking Engineer">Networking Engineer</option>
                  <option value="IT Infrastructure Engineer">IT Infrastructure Engineer</option>
                  <option value="Business Development Manager">Business Development Manager</option>
                </select>
              </div>
              <div className="form-group">
                <label>Experience Required</label>
                <input
                  type="text"
                  value={formData.experience_required}
                  onChange={(e) => setFormData({ ...formData, experience_required: e.target.value })}
                  placeholder="e.g. 0-1, 1+, 2+, 5+ years"
                />
              </div>
            </div>
            <div className="form-row form-row-two">
              <div className="form-group">
                <label>Job Type</label>
                <select
                  value={formData.job_type}
                  onChange={(e) => setFormData({ ...formData, job_type: e.target.value })}
                >
                  {JOB_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <div className="jd-method-tabs">
                <button
                  type="button"
                  className={`jd-tab ${jdMethod === 'write' ? 'active' : ''}`}
                  onClick={() => {
                    setJdMethod('write')
                    setJdFile(null)
                  }}
                >
                  ✍️ Write JD
                </button>
                <button
                  type="button"
                  className={`jd-tab ${jdMethod === 'upload' ? 'active' : ''}`}
                  onClick={() => {
                    setJdMethod('upload')
                    setFormData({ ...formData, description: '' })
                  }}
                >
                  📁 Upload PDF
                </button>
              </div>

              {jdMethod === 'upload' ? (
                <div
                  className={`jd-drop-zone ${dragActive ? 'drag-active' : ''} ${jdFile ? 'has-file' : ''}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  {!jdFile ? (
                    <>
                      <div className="upload-icon">📁</div>
                      <h3>Upload File</h3>
                      <p>Drag and drop your PDF or DOCX here, or click to browse.</p>
                      <label htmlFor="jd-file-input" className="browse-jd-btn">
                        Browse Files
                      </label>
                      <input
                        id="jd-file-input"
                        type="file"
                        accept=".pdf,.docx,.doc"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                      />
                      <p className="file-format-hint">Accepted formats: PDF, DOC, DOCX (Max size: 10MB)</p>
                    </>
                  ) : (
                    <div className="file-preview-jd">
                      <div className="file-icon-jd">📄</div>
                      <div className="file-info-jd">
                        <h3>{jdFile.name}</h3>
                        <p>{(jdFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button type="button" className="remove-file-btn" onClick={handleRemoveFile}>
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={5}
                  placeholder="Enter job description here..."
                />
              )}
            </div>
            {editingJob && (
              <div className="form-group">
                <label>Status *</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  required
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingJob ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false)
                  setEditingJob(null)
                  setJdFile(null)
                  setJdMethod('write')
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {loading ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '80px 40px', 
          color: '#555',
          background: 'linear-gradient(135deg, rgba(255, 218, 198, 0.7) 0%, rgba(255, 232, 217, 0.7) 25%, rgba(232, 213, 255, 0.7) 50%, rgba(216, 226, 220, 0.7) 75%, rgba(184, 216, 255, 0.7) 100%)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          borderRadius: '20px',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 218, 198, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.3)'
        }}>
          <div style={{ 
            display: 'inline-block',
            width: '40px',
            height: '40px',
            border: '4px solid rgba(102, 126, 234, 0.2)',
            borderTopColor: '#667eea',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '20px'
          }}></div>
          <p style={{ 
            fontSize: '16px', 
            margin: 0, 
            fontWeight: '600',
            color: '#2d3748'
          }}>
            Loading job openings...
          </p>
        </div>
      ) : (
        <div className="job-openings-list">
          {jobOpenings.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '80px 40px', 
              background: 'linear-gradient(135deg, rgba(255, 218, 198, 0.7) 0%, rgba(255, 232, 217, 0.7) 25%, rgba(232, 213, 255, 0.7) 50%, rgba(216, 226, 220, 0.7) 75%, rgba(184, 216, 255, 0.7) 100%)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              borderRadius: '20px',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 218, 198, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }}>
              <div style={{ 
                fontSize: '48px',
                marginBottom: '20px',
                opacity: 0.6
              }}>💼</div>
              <p style={{ 
                fontSize: '20px', 
                marginBottom: '12px', 
                color: '#1a1a1a',
                fontWeight: '700',
                letterSpacing: '-0.02em'
              }}>
                No job openings found
              </p>
              <p style={{ 
                fontSize: '15px', 
                color: '#666',
                margin: 0,
                lineHeight: '1.6'
              }}>
                Click "+ Add New Job Opening" to create your first job opening.
              </p>
            </div>
          ) : (
            jobOpenings.map((job) => (
              <motion.div
                key={job.job_id || job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="job-card"
              >
                <div className="job-info">
                  <h3>{job.title || 'Untitled Job Opening'}</h3>
                  {job.location && (
                    <p><strong>Location:</strong> {job.location}</p>
                  )}
                  {job.business_area && (
                    <p><strong>Business Area:</strong> {job.business_area}</p>
                  )}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    marginTop: '8px',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{ 
                      color: job.status === 'active' ? '#059669' : '#dc2626',
                      textTransform: 'capitalize',
                      fontWeight: '600',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: job.status === 'active' 
                        ? 'rgba(16, 185, 129, 0.15)' 
                        : 'rgba(239, 68, 68, 0.15)',
                      border: job.status === 'active' 
                        ? '1px solid rgba(16, 185, 129, 0.25)' 
                        : '1px solid rgba(239, 68, 68, 0.25)',
                      fontSize: '11px',
                      letterSpacing: '0.02em'
                    }}>{job.status || 'active'}</span>
                  </div>
                </div>
                <div className="job-actions">
                  <button
                    type="button"
                    className="btn-view-applicants"
                    onClick={(e) => { e.stopPropagation(); handleViewApplicants(job) }}
                  >
                    View applicants
                  </button>
                  <button
                    className="btn-edit"
                    onClick={() => handleEdit(job)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => handleDelete(job.job_id || job.id)}
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* Applicants modal: full-page table same as Records */}
      {applicantsModalJob && createPortal(
        <div className="applicants-modal-overlay" onClick={() => { setApplicantsModalJob(null); setSelectedApplicant(null) }}>
          <div className="applicants-modal-content admin-dashboard records-dashboard" onClick={e => e.stopPropagation()}>
            <div className="applicants-modal-header">
              <h2>Applicants for {applicantsModalJob.title}</h2>
              <button type="button" className="applicants-modal-close" onClick={() => { setApplicantsModalJob(null); setSelectedApplicant(null) }} aria-label="Close">× Close</button>
            </div>
            {applicantsLoading ? (
              <p className="applicants-loading">Loading applicants...</p>
            ) : applicantsList.length === 0 ? (
              <p className="applicants-empty">No applicants for this job yet.</p>
            ) : (
              <div className="dashboard-section records-table-section">
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Applied for</th>
                        <th>Applied at</th>
                        <th>Type</th>
                        <th>Role</th>
                        <th>Location</th>
                        <th>Experience</th>
                        <th>Notice</th>
                        <th>Relocate</th>
                        <th>Skills</th>
                        <th>Certifications</th>
                        <th>Links</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applicantsList.map((resume, index) => (
                        <tr
                          key={resume.id || resume.resume_id || index}
                          className="clickable-row"
                          onClick={() => setSelectedApplicant(resume)}
                        >
                          <td><span className="id-badge">#{index + 1}</span></td>
                          <td>
                            <div className="name-cell">
                              <div className="avatar-sm">{getInitials(resume.name || resume.full_name || 'N/A')}</div>
                              <div className="name-info">
                                <span className="candidate-name" title={renderSafe(resume.name || resume.full_name)}>{renderSafe(resume.name || resume.full_name, 'Anonymous')}</span>
                                <span className="candidate-email-sub" title={renderSafe(resume.email)}>{renderSafe(resume.email, 'No Email')}</span>
                              </div>
                            </div>
                          </td>
                          <td><span className="role-text" title={resume.applied_for_job_title || applicantsModalJob?.title}>{resume.applied_for_job_title || applicantsModalJob?.title || '-'}</span></td>
                          <td><span className="notice-text">{resume.applied_at ? new Date(resume.applied_at).toLocaleDateString(undefined, { dateStyle: 'short' }) : '-'}</span></td>
                          <td>
                            <span className={`type-badge-new ${resume.user_type || resume.source_type || 'default'}`}>
                              {formatUserType(resume.user_type || resume.source_type)}
                            </span>
                          </td>
                          <td><span className="role-text" title={renderSafe(resume.role)}>{renderSafe(resume.role)}</span></td>
                          <td><span className="location-text" title={renderSafe(resume.location)}>{renderSafe(resume.location)}</span></td>
                          <td>
                            <span className="exp-badge-new">
                              {resume.experience_years ? `${parseFloat(resume.experience_years).toFixed(1)} yrs` : '0 yrs'}
                            </span>
                          </td>
                          <td><span className="notice-text">{resume.notice_period !== undefined ? `${resume.notice_period}d` : 'N/A'}</span></td>
                          <td>
                            <span className={`relocate-pill ${resume.ready_to_relocate ? 'yes' : 'no'}`}>
                              {resume.ready_to_relocate ? 'YES' : 'NO'}
                            </span>
                          </td>
                          <td>
                            <div className="skills-tags-new">
                              {(resume.skills || []).slice(0, 1).map((skill, idx) => (
                                <span key={idx} className="skill-tag-new">{skill}</span>
                              ))}
                              {resume.skills && resume.skills.length > 1 && (
                                <span className="more-count">+{resume.skills.length - 1}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="skills-tags-new">
                              {(resume.parsed_data?.resume_certificates || []).filter(c => c && c !== 'Not mentioned').slice(0, 1).map((cert, idx) => (
                                <span key={idx} className="cert-tag-new">{cleanCertText(cert)}</span>
                              ))}
                              {!(resume.parsed_data?.resume_certificates?.filter(c => c && c !== 'Not mentioned')?.length > 0) && (
                                <span className="na-text">N/A</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="links-cell" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {(resume.linked_in || resume.meta_data?.form_data?.linkedIn) && (
                                <a href={(resume.linked_in || resume.meta_data?.form_data?.linkedIn || '').trim().startsWith('http') ? (resume.linked_in || resume.meta_data?.form_data?.linkedIn) : `https://${(resume.linked_in || resume.meta_data?.form_data?.linkedIn || '').trim()}`} target="_blank" rel="noreferrer" className="link-icon-btn">LinkedIn</a>
                              )}
                              {(resume.portfolio || resume.meta_data?.form_data?.portfolio) && (
                                <a href={(resume.portfolio || resume.meta_data?.form_data?.portfolio || '').trim().startsWith('http') ? (resume.portfolio || resume.meta_data?.form_data?.portfolio) : `https://${(resume.portfolio || resume.meta_data?.form_data?.portfolio || '').trim()}`} target="_blank" rel="noreferrer" className="link-icon-btn">Portfolio</a>
                              )}
                              {!(resume.linked_in || resume.meta_data?.form_data?.linkedIn || resume.portfolio || resume.meta_data?.form_data?.portfolio) && <span className="na-text">-</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Applicant detail modal - same design as Records table pop-out + resume download */}
      {selectedApplicant && applicantsModalJob && (() => {
        const candidate = selectedApplicant
        const parsed = candidate.parsed_data || {}
        let certs = candidate.certificates || []
        if (certs.length === 0 && parsed.resume_certificates && Array.isArray(parsed.resume_certificates)) {
          certs = parsed.resume_certificates
            .filter(c => c && c !== 'Not mentioned')
            .map(name => (typeof name === 'object' ? name : { name, issuer: 'Detected', date_obtained: null }))
        }
        const educations = candidate.educations || []
        const skills = (candidate.skills && candidate.skills.length > 0) ? candidate.skills : (parsed.resume_skills || [])
        const resumeDownloadUrl = (candidate.file_url || candidate.id || candidate.resume_id)
          ? (candidate.file_url
              ? (candidate.file_url.startsWith('/') ? `${API_BASE_URL.replace('/api', '')}${candidate.file_url}` : candidate.file_url)
              : `${API_BASE_URL.replace('/api', '')}/api/resumes/${candidate.id || candidate.resume_id}/file`)
          : null
        return createPortal(
          <motion.div
            className="modal-overlay record-detail-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedApplicant(null)}
          >
            <motion.div
              className="modal-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <div className="header-top">
                  <div className="candidate-profile-summary">
                    <div className="profile-avatar-lg">{getInitials(candidate.name || candidate.full_name || 'N/A')}</div>
                    <div className="profile-info-main">
                      <h2>{renderSafe(candidate.name || candidate.full_name, 'Candidate Profile')}</h2>
                      <div className="header-badges-row">
                        <span className="premium-badge type">{formatUserType(candidate.user_type || candidate.source_type || 'Candidate')}</span>
                        {candidate.role && <span className="premium-badge role">{candidate.role}</span>}
                      </div>
                    </div>
                  </div>
                  <button className="close-btn-new" aria-label="Close" onClick={() => setSelectedApplicant(null)}>&times;</button>
                </div>
              </div>

              <div className="modal-body">
                <div className="modal-grid-container">
                  <section className="modal-section">
                    <h3 className="section-title-sm">Application &amp; Quick Contacts</h3>
                    <div className="record-fields-list">
                      <div className="record-field">
                        <span className="record-field-label">Applied for</span>
                        <div className="record-field-value record-field-value-filled">{candidate.applied_for_job_title || applicantsModalJob?.title || '-'}</div>
                      </div>
                      <div className="record-field">
                        <span className="record-field-label">Applied at</span>
                        <div className="record-field-value record-field-value-filled">
                          {candidate.applied_at ? new Date(candidate.applied_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                        </div>
                      </div>
                      <div className="record-field">
                        <span className="record-field-label">Email Address</span>
                        <div className={`record-field-value${isFilled(candidate.email) ? ' record-field-value-filled' : ''}`}>{renderSafe(candidate.email)}</div>
                      </div>
                      <div className="record-field">
                        <span className="record-field-label">Phone</span>
                        <div className={`record-field-value${isFilled(candidate.phone) ? ' record-field-value-filled' : ''}`}>{renderSafe(candidate.phone)}</div>
                      </div>
                      <div className="record-field">
                        <span className="record-field-label">Current Location</span>
                        <div className={`record-field-value${isFilled(candidate.location) ? ' record-field-value-filled' : ''}`}>{renderSafe(candidate.location)}</div>
                      </div>
                      <div className="record-field">
                        <span className="record-field-label">Total Experience</span>
                        <div className={`record-field-value${candidate.experience_years != null && candidate.experience_years !== '' ? ' record-field-value-filled' : ''}`}>{candidate.experience_years ? `${parseFloat(candidate.experience_years).toFixed(1)} Years` : 'N/A'}</div>
                      </div>
                      <div className="record-field">
                        <span className="record-field-label">Notice Period</span>
                        <div className={`record-field-value${candidate.notice_period !== undefined && candidate.notice_period !== null ? ' record-field-value-filled' : ''}`}>{candidate.notice_period !== undefined ? `${candidate.notice_period} Days` : 'N/A'}</div>
                      </div>
                      {(candidate.linked_in || candidate.meta_data?.form_data?.linkedIn) && (() => {
                        const linkedInUrl = candidate.linked_in || candidate.meta_data?.form_data?.linkedIn
                        const href = (() => { const u = (linkedInUrl || '').trim(); return (u.startsWith('http://') || u.startsWith('https://')) ? u : `https://${u}` })()
                        return (
                          <div className="record-field">
                            <span className="record-field-label">LinkedIn</span>
                            <div className="record-field-value record-field-value-filled"><a href={href} target="_blank" rel="noreferrer">{String(linkedInUrl).length > 60 ? String(linkedInUrl).slice(0, 57) + '...' : linkedInUrl}</a></div>
                          </div>
                        )
                      })()}
                      {(candidate.portfolio || candidate.meta_data?.form_data?.portfolio) && (() => {
                        const portfolioUrl = candidate.portfolio || candidate.meta_data?.form_data?.portfolio
                        const href = (() => { const u = (portfolioUrl || '').trim(); return (u.startsWith('http://') || u.startsWith('https://')) ? u : `https://${u}` })()
                        return (
                          <div className="record-field">
                            <span className="record-field-label">Portfolio / Website</span>
                            <div className="record-field-value record-field-value-filled"><a href={href} target="_blank" rel="noreferrer">{String(portfolioUrl).length > 60 ? String(portfolioUrl).slice(0, 57) + '...' : portfolioUrl}</a></div>
                          </div>
                        )
                      })()}
                      <div className="record-field">
                        <span className="record-field-label">Relocation Status &amp; Preference</span>
                        <div className="record-field-value record-field-value-filled">
                          {candidate.ready_to_relocate ? `Ready to Relocate${candidate.preferred_location ? ` - Preferred: ${candidate.preferred_location}` : ''}` : 'Not open to relocation'}
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="skills-certs-grid">
                    <div className="content-block">
                      <h3 className="section-title-sm">Core Skills</h3>
                      <div className="record-field">
                        <span className="record-field-label">Skills</span>
                        <div className="record-tags-wrap">
                          {skills.length > 0 ? skills.map((skill, idx) => (
                            <span key={idx} className="record-tag">{typeof skill === 'object' ? skill.name || skill : skill}</span>
                          )) : <span className="record-tag record-tag-empty">No skills detected</span>}
                        </div>
                      </div>
                    </div>
                    <div className="content-block">
                      <h3 className="section-title-sm">Certifications</h3>
                      <div className="record-field">
                        <span className="record-field-label">Certifications</span>
                        <div className="record-tags-wrap">
                          {certs.length > 0 ? certs.map((cert, idx) => (
                            <span key={idx} className="record-tag">{cleanCertText(typeof cert === 'object' ? cert.name : cert)}</span>
                          )) : <span className="record-tag record-tag-empty">No certifications found</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <section className="modal-section">
                    <h3 className="section-title-sm">Work Experience</h3>
                    {candidate.work_history && candidate.work_history.length > 0 ? (
                      <div className="experience-list record-fields-list">
                        {candidate.work_history.map((exp, idx) => (
                          <div key={idx} className="experience-item record-field-block">
                            <div className="record-field">
                              <span className="record-field-label">Role</span>
                              <div className={`record-field-value${isFilled(exp.role) ? ' record-field-value-filled' : ''}`}>{exp.role || '-'}</div>
                            </div>
                            <div className="record-field">
                              <span className="record-field-label">Company</span>
                              <div className={`record-field-value${isFilled(exp.company) ? ' record-field-value-filled' : ''}`}>{exp.company || '-'}</div>
                            </div>
                            <div className="record-field">
                              <span className="record-field-label">Location</span>
                              <div className={`record-field-value${isFilled(exp.location) ? ' record-field-value-filled' : ''}`}>{exp.location || '-'}</div>
                            </div>
                            <div className="record-field">
                              <span className="record-field-label">Period</span>
                              <div className={`record-field-value${(exp.start_date || exp.end_date) ? ' record-field-value-filled' : ''}`}>
                                {exp.start_date || ''} {exp.start_date && exp.end_date ? '-' : ''} {exp.end_date || ''}{exp.is_current ? ' (Current)' : ''}
                              </div>
                            </div>
                            {exp.description && (
                              <div className="record-field">
                                <span className="record-field-label">Description</span>
                                <div className="record-field-value record-field-value-filled">{exp.description}</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="record-field">
                        <span className="record-field-label">Work Experience</span>
                        <div className="record-field-value">No work experience records found</div>
                      </div>
                    )}
                  </section>

                  <section className="modal-section">
                    <h3 className="section-title-sm">Education</h3>
                    {educations.length > 0 ? (
                      <div className="education-list record-fields-list">
                        {educations.map((edu, idx) => (
                          <div key={idx} className="education-item record-field-block">
                            <div className="record-field">
                              <span className="record-field-label">Degree</span>
                              <div className={`record-field-value${isFilled(edu.degree) ? ' record-field-value-filled' : ''}`}>{edu.degree || '-'}</div>
                            </div>
                            <div className="record-field">
                              <span className="record-field-label">Institution</span>
                              <div className={`record-field-value${isFilled(edu.institution) ? ' record-field-value-filled' : ''}`}>{edu.institution || '-'}</div>
                            </div>
                            <div className="record-field">
                              <span className="record-field-label">Field of study</span>
                              <div className={`record-field-value${isFilled(edu.field_of_study) ? ' record-field-value-filled' : ''}`}>{edu.field_of_study || '-'}</div>
                            </div>
                            <div className="record-field">
                              <span className="record-field-label">Period</span>
                              <div className={`record-field-value${(edu.start_date || edu.end_date) ? ' record-field-value-filled' : ''}`}>
                                {edu.start_date || ''} {edu.start_date && edu.end_date ? '-' : ''} {edu.end_date || ''}
                              </div>
                            </div>
                            {edu.grade && (
                              <div className="record-field">
                                <span className="record-field-label">Grade</span>
                                <div className="record-field-value record-field-value-filled">{edu.grade}</div>
                              </div>
                            )}
                            {edu.description && (
                              <div className="record-field">
                                <span className="record-field-label">Description</span>
                                <div className="record-field-value record-field-value-filled">{edu.description}</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="record-field">
                        <span className="record-field-label">Education</span>
                        <div className="record-field-value">No education records found</div>
                      </div>
                    )}
                  </section>
                </div>
              </div>

              {resumeDownloadUrl && (
                <div className="modal-footer-premium">
                  <a href={resumeDownloadUrl} target="_blank" rel="noreferrer" className="view-resume-action-btn">
                    📄 View / Download Resume
                  </a>
                </div>
              )}
            </motion.div>
          </motion.div>,
          document.body
        )
      })()}
    </div>
  )
}

export default ManageJobOpenings

