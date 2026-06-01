import { useState } from 'react'
import { motion } from 'framer-motion'
import { API_BASE_URL } from '../../config/api'
import { emitAdminActivity } from '../../utils/adminActivity'
import './SearchUsingJD.css'

const ResultCard = ({ match, index, dimensionLabels = {} }) => {
  const [showAllSkills, setShowAllSkills] = useState(false);

  // Helper to get initials
  const getInitials = (name) => {
    if (!name || name === 'Unknown Candidate') return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  const strictSkills = match.matched_skills || [];
  const evidenceSkills = match.evidence_skills || [];
  const displayMode = strictSkills.length > 0 ? 'strict' : (evidenceSkills.length > 0 ? 'evidence' : 'none');
  const skillsToShow = displayMode === 'strict' ? strictSkills : (displayMode === 'evidence' ? evidenceSkills : []);
  const displaySkills = showAllSkills ? skillsToShow : skillsToShow.slice(0, 5);
  const hasMoreSkills = skillsToShow.length > 5;

  const breakdownEntries = Object.entries(match.score_breakdown || {})
    .map(([dimId, points]) => ({ dimId, points: Number(points) || 0 }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 2);

  return (
    <motion.div
      className="result-card"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <div className="match-score-pill">
        <span className={`score-dot ${match.total_score >= 70 ? 'high' : match.total_score >= 40 ? 'medium' : 'low'}`}></span>
        {Math.round(match.total_score)}% Match
      </div>

      <div className="card-top-info">
        <div className="candidate-initials">
          {getInitials(match.candidate)}
        </div>
        <div className="candidate-meta">
          <div className="candidate-name-row">
            <h4>{match.candidate}</h4>
          </div>
          <div className="meta-badges">
            <span className="user-type-badge">{match.user_type}</span>
            {breakdownEntries.map((b) => (
              <span
                key={b.dimId}
                className="match-detail-badge"
                title={dimensionLabels[b.dimId] || b.dimId}
              >
                {(dimensionLabels[b.dimId] || b.dimId).slice(0, 10)}: {Math.round(b.points)} pts
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="info-blocks-grid">
        <div className="info-block">
          <span className="info-label">Current Role</span>
          <span className="info-value role-text-highlight">{match.role || 'N/A'}</span>
        </div>
        <div className="info-block">
          <span className="info-label">Experience</span>
          <span className="info-value">
            {match.experience_years ? `${match.experience_years} Years` : 'N/A'}
          </span>
        </div>
        <div className="info-block">
          <span className="info-label">Notice Period</span>
          <span className="info-value">
            {match.notice_period !== undefined ? `${match.notice_period} Days` : 'N/A'}
          </span>
        </div>
        <div className="info-block">
          <span className="info-label">Location</span>
          <span className="info-value">
            {match.location || 'N/A'}
            {match.ready_to_relocate && (
              <span className="relocate-subtext" title={`Preferred: ${match.preferred_location}`}>
                ✈️ {match.preferred_location || 'Open'}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="card-skills-section">
        <span className="skills-title">
          {displayMode === 'strict' ? 'Matched Skills' : (displayMode === 'evidence' ? 'Relevant Evidence Found' : 'Matched Skills')}
        </span>
        <div className="skills-tag-list">
          {displaySkills.length > 0 ? (
            displaySkills.map((skill, i) => (
              <span key={i} className="skill-result-tag">{skill}</span>
            ))
          ) : (
            <span className="na-text">No matching skills found</span>
          )}
        </div>
        {hasMoreSkills && (
          <button
            className="more-skills-btn"
            onClick={() => setShowAllSkills(!showAllSkills)}
          >
            {showAllSkills ? 'Show Less' : `+${skillsToShow.length - 5} more`}
          </button>
        )}
      </div>

      <div className="view-resume-action">
        <a href={`${API_BASE_URL}/resumes/${match.resume_id}/file`} target="_blank" rel="noreferrer" className="view-resume-link">
          📄 View Resume
        </a>
      </div>
    </motion.div>
  );
};

const SearchUsingJD = () => {
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)

  // New state variables for API integration
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)
  const [locationFilter, setLocationFilter] = useState('')
  const [userTypeFilter, setUserTypeFilter] = useState('') // '', 'Company Employee', 'Freelancer', 'Guest User'
  const [minExperience, setMinExperience] = useState('')
  const [maxExperience, setMaxExperience] = useState('')
  const [minNoticePeriod, setMinNoticePeriod] = useState('')
  const [maxNoticePeriod, setMaxNoticePeriod] = useState('') // max notice period in days (e.g. 30 = within 30 days)
  const [sortByDate, setSortByDate] = useState('newest') // 'newest' | 'oldest' - latest resume on top
  const [jdMethod, setJdMethod] = useState('upload') // 'upload' or 'manual'
  const [jdText, setJdText] = useState('')

  const normalizeUserType = (ut) => {
    if (!ut) return ''
    const s = String(ut).toLowerCase()
    if (s.includes('company') || s === 'company_employee') return 'Company Employee'
    if (s.includes('freelancer')) return 'Freelancer'
    if (s.includes('guest') || s === 'guest_user' || s === 'gmail') return 'Guest User'
    return ut
  }

  const filteredResults = (results?.results || []).filter((m) => {
    const locMatch = !locationFilter || (m.location && m.location.toLowerCase().includes(locationFilter.toLowerCase())) || (m.preferred_location && m.preferred_location.toLowerCase().includes(locationFilter.toLowerCase()))
    const normalized = normalizeUserType(m.user_type || m.source_type)
    const typeMatch = !userTypeFilter || normalized === userTypeFilter

    const expYears = Number(m.experience_years) || 0
    const minExp = minExperience !== '' && !Number.isNaN(Number(minExperience)) ? Number(minExperience) : null
    const maxExp = maxExperience !== '' && !Number.isNaN(Number(maxExperience)) ? Number(maxExperience) : null
    const expMatch = (!minExp || expYears >= minExp) && (!maxExp || expYears <= maxExp)

    const notice = m.notice_period != null ? Number(m.notice_period) : null
    const minNotice = minNoticePeriod !== '' && !Number.isNaN(Number(minNoticePeriod)) ? Number(minNoticePeriod) : null
    const maxNotice = maxNoticePeriod !== '' && !Number.isNaN(Number(maxNoticePeriod)) ? Number(maxNoticePeriod) : null
    const noticeMatch =
      (!minNotice || (notice != null && notice >= minNotice)) &&
      (!maxNotice || (notice == null || notice <= maxNotice))

    return locMatch && typeMatch && expMatch && noticeMatch
  })

  // Sort key: use uploaded_at if present (ISO string), else fall back to resume_id (higher id = newer)
  const sortKey = (m) => {
    const at = m.uploaded_at
    if (at) return new Date(at).getTime()
    const id = m.resume_id ?? m.id ?? 0
    return id
  }
  const displayedResults = [...filteredResults].sort((a, b) => {
    const keyA = sortKey(a)
    const keyB = sortKey(b)
    if (sortByDate === 'oldest') return keyA - keyB
    return keyB - keyA
  })

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
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowedTypes.includes(selectedFile.type)) {
      alert('Please upload a PDF or DOCX file')
      return
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      alert('File size should be less than 10MB')
      return
    }

    setFile(selectedFile)
    // Clear previous results when new file is selected
    setResults(null)
    setError(null)
  }

  const handleRemoveFile = () => {
    setFile(null)
    setResults(null)
  }

  const handleFindCandidates = async () => {
    if (jdMethod === 'upload' && !file) {
      alert('Please upload a job description file first')
      return
    }
    if (jdMethod === 'manual' && !jdText.trim()) {
      alert('Please enter or paste a job description first')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const formData = new FormData()
      if (jdMethod === 'upload') {
        formData.append('file', file)
      } else {
        formData.append('jd_text_manual', jdText)
      }

      // Append query parameters
      const params = new URLSearchParams()
      params.append('min_score', '10')
      params.append('top_n', '50')

      const token = localStorage.getItem('authToken')

      const response = await fetch(`${API_BASE_URL}/jd/analyze-v2?${params.toString()}`, {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = typeof errorData.detail === 'string'
          ? errorData.detail
          : (Array.isArray(errorData.detail)
            ? errorData.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join(', ')
            : JSON.stringify(errorData.detail) || 'Failed to analyze JD')
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('JD Analysis Results (v2):', data)
      setResults(data)
      emitAdminActivity({ type: 'jd_analysis' })

    } catch (err) {
      console.error('JD Analysis error:', err)
      const errorMsg = err instanceof Error ? err.message : (typeof err === 'string' ? err : JSON.stringify(err))
      setError(errorMsg === '{}' ? 'An unexpected error occurred' : errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="search-using-jd">
      {/* Selection removed here as requested */}

      <motion.div
        className="upload-jd-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <h2>Job Description</h2>

        <div className="jd-method-tabs">
          <button
            className={`jd-tab ${jdMethod === 'upload' ? 'active' : ''}`}
            onClick={() => setJdMethod('upload')}
          >
            📁 Upload File
          </button>
          <button
            className={`jd-tab ${jdMethod === 'manual' ? 'active' : ''}`}
            onClick={() => setJdMethod('manual')}
          >
            ✍️ Manual Entry
          </button>
        </div>

        {jdMethod === 'upload' ? (
          <div
            className={`jd-drop-zone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {!file ? (
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
                  accept=".pdf,.docx"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <p className="file-format-hint">Accepted formats: PDF, DOCX (Max size: 10MB)</p>
              </>
            ) : (
              <div className="file-preview-jd">
                <div className="file-icon-jd">📄</div>
                <div className="file-info-jd">
                  <h3>{file.name}</h3>
                  <p>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button className="remove-file-btn" onClick={handleRemoveFile}>
                  ✕
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="jd-manual-entry">
            <textarea
              placeholder="Paste the job description text here... (e.g. required skills, years of experience, responsibilities)"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              className="jd-textarea"
            />
          </div>
        )}

        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        <button
          className="find-candidates-btn"
          onClick={handleFindCandidates}
          disabled={loading || (jdMethod === 'upload' ? !file : !jdText.trim())}
        >
          {loading ? 'Analyzing...' : 'Find Matching Candidates'}
        </button>
      </motion.div>

      {/* Results Section */}
      {results && (
        <motion.div
          className="results-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="results-header">
            <h3>Analysis Results</h3>
            <div className="results-summary-badges">
              <div className="results-sort">
                <label htmlFor="jd-sort-by-date">Sort:</label>
                <select
                  id="jd-sort-by-date"
                  className="sort-select"
                  value={sortByDate}
                  onChange={(e) => setSortByDate(e.target.value)}
                  title="Show latest or oldest resumes first"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
              <span className="summary-badge total">
                Found {results.results?.length || 0} Total
              </span>
              <span className="summary-badge visible">
                Showing {filteredResults.length} Visible
              </span>
            </div>
          </div>

          <div className="extracted-requirements">
            <h4>Job Requirements Identified:</h4>
            <div className="jd-skills-tags">
              {results.jd_requirements?.required_skills
                ?.filter(skill => skill.length < 50)
                .map((skill, i) => (
                  <span key={i} className="jd-skill-tag required">{skill}</span>
                ))}
              {results.jd_requirements?.preferred_skills
                ?.filter(skill => skill.length < 50)
                .map((skill, i) => (
                  <span key={i} className="jd-skill-tag preferred">{skill}</span>
                ))}
            </div>
          </div>

          <div className="results-container-main">
            <aside className="results-sidebar">
              <div className="filter-group">
                <h4>User Type</h4>
                <select
                  className="sidebar-select"
                  value={userTypeFilter}
                  onChange={(e) => setUserTypeFilter(e.target.value)}
                  title="Filter by user type"
                >
                  <option value="">All</option>
                  <option value="Company Employee">Company Employee</option>
                  <option value="Freelancer">Freelancer</option>
                  <option value="Guest User">Guest User</option>
                </select>
              </div>
              <div className="filter-group">
                <h4>Min Experience (Years)</h4>
                <input
                  type="number"
                  className="sidebar-input"
                  placeholder="e.g. 2"
                  min="0"
                  value={minExperience}
                  onChange={(e) => setMinExperience(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <h4>Max Experience (Years)</h4>
                <input
                  type="number"
                  className="sidebar-input"
                  placeholder="e.g. 10"
                  min="0"
                  value={maxExperience}
                  onChange={(e) => setMaxExperience(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <h4>Min Notice Period (Days)</h4>
                <input
                  type="number"
                  className="sidebar-input"
                  placeholder="e.g. 0"
                  min="0"
                  value={minNoticePeriod}
                  onChange={(e) => setMinNoticePeriod(e.target.value)}
                  title="Show only candidates with notice period ≥ this many days"
                />
              </div>
              <div className="filter-group">
                <h4>Max Notice Period (Days)</h4>
                <input
                  type="number"
                  className="sidebar-input"
                  placeholder="e.g. 30"
                  min="0"
                  value={maxNoticePeriod}
                  onChange={(e) => setMaxNoticePeriod(e.target.value)}
                  title="Show only candidates with notice period ≤ this many days"
                />
              </div>
              <div className="filter-group">
                <h4>Preferred Location</h4>
                <div className="sidebar-search-box">
                  <input
                    type="text"
                    placeholder="Search location..."
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                  />
                  <span className="search-icon-sm">🔍</span>
                </div>
              </div>
            </aside>

            <div className="results-list-wrapper">
              <div className="results-list">
                {displayedResults.length === 0 ? (
                  <p className="no-matches">No candidates match the selected filters.</p>
                ) : (
                  displayedResults.map((match, index) => (
                    <ResultCard
                      key={match.resume_id}
                      match={match}
                      index={index}
                      dimensionLabels={Object.fromEntries((results.dimensions || []).map(d => [d.dimension_id, d.label]))}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default SearchUsingJD


