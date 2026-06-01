import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { API_BASE_URL } from '../../config/api'
import './SearchTalent.css'

const SearchTalent = () => {
  const [filters, setFilters] = useState({
    userType: '',
    minExperience: '',
    maxExperience: '',
    location: '',
    phone: '',
    email: '',
    department: '',
    role: '',
    skills: ''
  })
  const [searchResults, setSearchResults] = useState([])
  const [hasSearched, setHasSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sortByDate, setSortByDate] = useState('newest') // 'newest' | 'oldest' - latest resume on top
  const [skillsModalResult, setSkillsModalResult] = useState(null)

  // Apply sort: newest first (default, matches API) or oldest first
  const displayedResults = sortByDate === 'oldest'
    ? [...searchResults].sort((a, b) => new Date(a.uploaded_at || 0) - new Date(b.uploaded_at || 0))
    : [...searchResults].sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0))

  const userTypes = ['Company Employee', 'Freelancer', 'Guest User']

  const roleOptions = ['Data Analytics', 'Data Engineer', 'Cloud Operator', 'DevOps', 'SDE', 'Network Engineer']
  const departmentOptions = ['Data & AI', 'Cloud', 'Cyber Security', 'Infra']
  const skillOptions = ['Python', 'Java', 'C++', 'C', 'JS', 'PowerBI', 'AI/ML', 'Excel', 'SQL', 'AWS']
  const locationOptions = ['Gurgaon', 'Delhi', 'Noida', 'Pune', 'Hyderabad', 'Mumbai', 'Bangalore']

  const handleInputChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSearch = async () => {
    try {
      setLoading(true)
      setHasSearched(true)

      // Build query parameters
      const params = new URLSearchParams()

      if (filters.skills) params.append('skills', filters.skills)
      if (filters.userType) params.append('user_types', filters.userType)
      const minExp = filters.minExperience !== '' && filters.minExperience != null ? String(filters.minExperience).trim() : ''
      const maxExp = filters.maxExperience !== '' && filters.maxExperience != null ? String(filters.maxExperience).trim() : ''
      if (minExp !== '' && !Number.isNaN(Number(minExp))) params.append('min_experience', minExp)
      if (maxExp !== '' && !Number.isNaN(Number(maxExp))) params.append('max_experience', maxExp)
      if (filters.location) params.append('locations', filters.location)
      if (filters.role) params.append('roles', filters.role)
      if (filters.email) params.append('q', filters.email)

      const token = localStorage.getItem('authToken')

      const response = await fetch(`${API_BASE_URL}/resumes/search?${params.toString()}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        }
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setSearchResults(data.resumes || data || [])
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
      alert('Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setFilters({
      userType: '',
      minExperience: '',
      maxExperience: '',
      location: '',
      phone: '',
      email: '',
      department: '',
      role: '',
      skills: ''
    })
    setSearchResults([])
    setHasSearched(false)
  }

  const getInitials = (name) => {
    if (!name || name === 'Unknown') return '??'
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="search-talent">
      <motion.div
        className="search-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2>Search Talent</h2>
      </motion.div>

      <motion.div
        className="search-filters-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h3>Filter Candidates</h3>

        <div className="filters-grid">
          <div className="filter-group">
            <label>User Type</label>
            <select
              value={filters.userType}
              onChange={(e) => handleInputChange('userType', e.target.value)}
            >
              <option value="">All User Types</option>
              {userTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Min Experience (Years)</label>
            <input
              type="number"
              value={filters.minExperience}
              onChange={(e) => handleInputChange('minExperience', e.target.value)}
              placeholder="e.g. 2"
              min="0"
            />
          </div>

          <div className="filter-group">
            <label>Max Experience (Years)</label>
            <input
              type="number"
              value={filters.maxExperience}
              onChange={(e) => handleInputChange('maxExperience', e.target.value)}
              placeholder="e.g. 10"
              min="0"
            />
          </div>

          <div className="filter-group">
            <label>Location</label>
            <div className="hybrid-input-wrapper">
              <input
                type="text"
                list="location-list"
                value={filters.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="City or Region"
                className="hybrid-input"
              />
              <datalist id="location-list">
                {locationOptions.map((location) => (
                  <option key={location} value={location} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="filter-group">
            <label>Email / Phone</label>
            <input
              type="text"
              value={filters.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Search by contact info"
            />
          </div>

          <div className="filter-group">
            <label>Role</label>
            <div className="hybrid-input-wrapper">
              <input
                type="text"
                list="role-list"
                value={filters.role}
                onChange={(e) => handleInputChange('role', e.target.value)}
                placeholder="Job Role"
                className="hybrid-input"
              />
              <datalist id="role-list">
                {roleOptions.map((role) => (
                  <option key={role} value={role} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="filter-group">
            <label>Technical Skills</label>
            <div className="hybrid-input-wrapper">
              <input
                type="text"
                list="skills-list"
                value={filters.skills}
                onChange={(e) => handleInputChange('skills', e.target.value)}
                placeholder="e.g. Python, React (comma separated)"
                className="hybrid-input"
              />
              <datalist id="skills-list">
                {skillOptions.map((skill) => (
                  <option key={skill} value={skill} />
                ))}
              </datalist>
            </div>
          </div>
        </div>

        <div className="filter-actions">
          <button className="search-btn" onClick={handleSearch} disabled={loading}>
            {loading ? 'Searching...' : 'Search Candidates'}
          </button>
          <button className="clear-btn" onClick={handleClear} disabled={loading}>
            Clear Filters
          </button>
        </div>
      </motion.div>

      <motion.div
        className="search-results-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <div className="results-header">
          <h3>Search Results</h3>
          <div className="results-header-right">
            <div className="results-sort">
              <label htmlFor="sort-by-date">Sort:</label>
              <select
                id="sort-by-date"
                className="sort-select"
                value={sortByDate}
                onChange={(e) => setSortByDate(e.target.value)}
                title="Show latest or oldest resumes first"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            <span className="results-count">
              {searchResults.length} {searchResults.length === 1 ? 'Candidate' : 'Candidates'} Found
            </span>
          </div>
        </div>

        <div className="results-content">
          {!hasSearched ? (
            <p className="empty-message">Enter filters above and click Search to find talent.</p>
          ) : searchResults.length === 0 ? (
            <p className="empty-message">No candidates found matching your criteria.</p>
          ) : (
            <div className="results-list">
              {displayedResults.map((result, index) => {
                const name = result.name || result.full_name || 'Unknown Candidate';
                const initials = getInitials(name);
                const matchedSkills = result.matched_skills || [];
                const allSkills = result.skills || [];

                return (
                  <motion.div
                    key={result.id || result.resume_id || index}
                    className="talent-premium-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <div className="talent-card-header">
                      <div className="talent-profile-main">
                        <div className={`talent-avatar ${String(result.user_type || result.source_type || 'candidate').toLowerCase().replace(/\s+/g, '_')}`}>{initials}</div>
                        <div className="talent-title-area">
                          <h4>{name}</h4>
                          <div className="talent-badges">
                            <span className={`talent-type-badge ${String(result.user_type || result.source_type || 'candidate').toLowerCase().replace(/\s+/g, '_')}`}>
                              {result.user_type || result.source_type || 'Candidate'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="talent-card-body">
                      {/* Field heading + value in a box */}
                      <div className="talent-fields-list">
                        <div className="talent-field-box">
                          <span className="talent-field-label">Experience</span>
                          <div className="talent-field-value">{result.experience_years ? `${result.experience_years} Years` : 'N/A'}</div>
                        </div>
                        <div className="talent-field-box">
                          <span className="talent-field-label">Notice</span>
                          <div className="talent-field-value">{result.notice_period !== undefined ? `${result.notice_period} Days` : 'N/A'}</div>
                        </div>
                        <div className="talent-field-box">
                          <span className="talent-field-label">Current Role</span>
                          <div className="talent-field-value">{result.role || 'Not Mentioned'}</div>
                        </div>
                        <div className="talent-field-box">
                          <span className="talent-field-label">Location</span>
                          <div className="talent-field-value">{result.location || 'N/A'}</div>
                        </div>
                        {allSkills.length > 0 && (
                          <div className="talent-field-box">
                            <span className="talent-field-label">Featured Skills</span>
                            <div className="talent-field-value talent-field-value-skills">
                              {allSkills.slice(0, 4).map((skill, idx) => (
                                <span
                                  key={idx}
                                  className={`talent-skill-badge ${matchedSkills.includes(skill) ? 'matched' : ''}`}
                                >
                                  {skill}
                                </span>
                              ))}
                              {allSkills.length > 4 && (
                                <button
                                  type="button"
                                  className="talent-more-count talent-more-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSkillsModalResult(result)
                                  }}
                                  title="View all skills"
                                >
                                  +{allSkills.length - 4} more
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="talent-card-footer">
                      <div className="match-status">
                        {filters.skills && (
                          <div className="match-pill">
                            <span className="match-value">
                              {Math.round((matchedSkills.length / filters.skills.split(',').filter(s => s.trim()).length) * 100)}% Match
                            </span>
                          </div>
                        )}
                      </div>
                      <a href={`${API_BASE_URL.replace(/\/api\/?$/, '')}${result.file_url || ''}`} target="_blank" rel="noreferrer" className="talent-action-btn">
                        <span>📄</span> Resume
                      </a>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* Full skills popup - rendered in viewport center via portal */}
      {skillsModalResult && createPortal(
        <div
          className="skills-modal-overlay"
          onClick={() => setSkillsModalResult(null)}
          role="presentation"
        >
          <div className="skills-modal-center-wrap">
            <motion.div
              className="skills-modal-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
            <div className="skills-modal-header">
              <div className="talent-profile-main">
                <div className={`talent-avatar ${String(skillsModalResult.user_type || skillsModalResult.source_type || 'candidate').toLowerCase().replace(/\s+/g, '_')}`}>
                  {getInitials(skillsModalResult.name || skillsModalResult.full_name || 'Unknown')}
                </div>
                <div className="talent-title-area">
                  <h4>{skillsModalResult.name || skillsModalResult.full_name || 'Unknown Candidate'}</h4>
                  <div className="talent-badges">
                    <span className={`talent-type-badge ${String(skillsModalResult.user_type || skillsModalResult.source_type || 'candidate').toLowerCase().replace(/\s+/g, '_')}`}>
                      {skillsModalResult.user_type || skillsModalResult.source_type || 'Candidate'}
                    </span>
                  </div>
                </div>
              </div>
              <button type="button" className="skills-modal-close" onClick={() => setSkillsModalResult(null)} aria-label="Close">&times;</button>
            </div>
            <div className="skills-modal-body">
              <div className="talent-fields-list">
                <div className="talent-field-box">
                  <span className="talent-field-label">Experience</span>
                  <div className="talent-field-value">{skillsModalResult.experience_years ? `${skillsModalResult.experience_years} Years` : 'N/A'}</div>
                </div>
                <div className="talent-field-box">
                  <span className="talent-field-label">Notice</span>
                  <div className="talent-field-value">{skillsModalResult.notice_period !== undefined ? `${skillsModalResult.notice_period} Days` : 'N/A'}</div>
                </div>
                <div className="talent-field-box">
                  <span className="talent-field-label">Current Role</span>
                  <div className="talent-field-value">{skillsModalResult.role || 'Not Mentioned'}</div>
                </div>
                <div className="talent-field-box">
                  <span className="talent-field-label">Location</span>
                  <div className="talent-field-value">{skillsModalResult.location || 'N/A'}</div>
                </div>
                <div className="talent-field-box">
                  <span className="talent-field-label">All Skills</span>
                  <div className="talent-field-value talent-field-value-skills skills-modal-all-skills">
                    {((skillsModalResult.skills || [])).map((skill, idx) => (
                      <span key={idx} className="talent-skill-badge">{skill}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {skillsModalResult.file_url && (
              <div className="skills-modal-footer">
                <a href={`${API_BASE_URL.replace(/\/api\/?$/, '')}${skillsModalResult.file_url || ''}`} target="_blank" rel="noreferrer" className="talent-action-btn">
                  <span>📄</span> Resume
                </a>
              </div>
            )}
          </motion.div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default SearchTalent


