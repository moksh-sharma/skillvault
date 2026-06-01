import { useState } from 'react'
import { motion } from 'framer-motion'
import { API_ENDPOINTS, uploadFile } from '../../config/api'
import { emitAdminActivity } from '../../utils/adminActivity'
import './AddNewResume.css'

const AddNewResume = () => {
  const [files, setFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('idle') // idle, success, error
  const [message, setMessage] = useState('')

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

    if (e.dataTransfer.files) {
      handleFiles(Array.from(e.dataTransfer.files))
    }
  }

  const handleFileSelect = (e) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files))
    }
  }

  const handleFiles = (newFiles) => {
    const validFiles = newFiles.filter(file => {
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      if (!allowedTypes.includes(file.type)) {
        alert(`${file.name} is not a valid file. Only PDF and DOCX files are accepted.`)
        return false
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} is larger than 10MB. Please upload a smaller file.`)
        return false
      }
      return true
    })

    setFiles(prev => [...prev, ...validFiles])
  }

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleUploadAll = async () => {
    if (files.length === 0) {
      alert('Please select at least one file to upload')
      return
    }

    try {
      setUploading(true)
      setUploadStatus('idle')
      setMessage('')

      const formData = new FormData()
      files.forEach(file => {
        formData.append('files', file)
      })

      const response = await uploadFile(API_ENDPOINTS.ADMIN_UPLOAD_RESUMES, formData)

      console.log('📤 Upload response:', response)
      
      if (response.success === 0 && response.failed > 0) {
        // All uploads failed
        setUploadStatus('error')
        setMessage(`Failed to upload resumes. Errors: ${response.errors?.join(', ') || 'Unknown error'}`)
      } else {
        setUploadStatus('success')
        setMessage(`Successfully uploaded ${response.success} resumes. ${response.failed} failed.`)
        setFiles([])

        emitAdminActivity({ type: 'resume_upload', count: response.success })
        setTimeout(() => emitAdminActivity({ type: 'resume_upload', count: response.success }), 1500)
      }
    } catch (err) {
      console.error('Upload failed:', err)
      setUploadStatus('error')
      setMessage(err.message || 'Failed to upload resumes. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const validPDFs = files.filter(file => file.type === 'application/pdf').length

  return (
    <div className="add-new-resume">
      <motion.div
        className="resume-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2>Add New Resumes</h2>
      </motion.div>

      <motion.div
        className="upload-summary"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h3>Upload Summary</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Files Ready:</span>
            <span className="summary-value">{files.length}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total Size:</span>
            <span className="summary-value">{(totalSize / 1024 / 1024).toFixed(2)} MB</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Valid PDFs:</span>
            <span className="summary-value">{validPDFs}</span>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="upload-resume-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <h3>Upload Resume Files</h3>
        <div
          className={`resume-drop-zone ${dragActive ? 'drag-active' : ''} ${files.length > 0 ? 'has-files' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="upload-icon-large">☁️</div>
          <h4>Drag & Drop PDF or DOCX files here, or click to browse and select multiple files.</h4>
          <label htmlFor="resume-files-input" className="browse-resume-btn">
            Browse Files
          </label>
          <input
            id="resume-files-input"
            type="file"
            accept=".pdf,.docx"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        {files.length > 0 && (
          <div className="files-list">
            {files.map((file, index) => (
              <div key={index} className="file-item">
                <div className="file-item-icon">📄</div>
                <div className="file-item-info">
                  <span className="file-item-name">{file.name}</span>
                  <span className="file-item-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <button className="remove-file-item-btn" onClick={() => handleRemoveFile(index)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {message && (
          <div className={`upload-status-message ${uploadStatus}`}>
            {uploadStatus === 'success' ? '✅' : '❌'} {message}
          </div>
        )}

        <div className="upload-guidelines">
          <h4>Upload Guidelines</h4>
          <ul>
            <li>✓ Multiple files supported</li>
            <li>✓ PDF format only</li>
            <li>✓ Maximum file size: 10MB per file</li>
          </ul>
        </div>

        <button
          className={`upload-all-btn ${uploading ? 'uploading' : ''}`}
          onClick={handleUploadAll}
          disabled={files.length === 0 || uploading}
        >
          {uploading ? (
            <span className="loader-container">
              <span className="spinner-small"></span>
              Uploading...
            </span>
          ) : (
            'Upload All Resumes to Database'
          )}
        </button>
      </motion.div>
    </div>
  )
}

export default AddNewResume


