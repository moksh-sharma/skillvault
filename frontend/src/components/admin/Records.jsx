import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { API_BASE_URL, getAuthToken, API_ENDPOINTS } from '../../config/api'
import './AdminDashboard.css' // Reuse existing styles for consistency

// Helper to clean text (reused)
const cleanCertText = (text) => {
    if (typeof text !== 'string') return ''
    return text
        .replace(/^[●☐☑✓✔✅❌□■▪▫•◦‣⁃∙⦿⦾]+\s*/g, '')
        .replace(/^[\-\*\d\.]+\s*/g, '')
        .replace(/^[\s\W]+/, '')
        .trim()
}

const getInitials = (name) => {
    const safeName = typeof name === 'string' ? name : (name && typeof name === 'object' ? (name.name || name.full_name || '') : '');
    if (!safeName || safeName === 'N/A') return '??'
    return safeName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().substring(0, 2)
}

const formatUserType = (type) => {
    if (!type || typeof type !== 'string') return 'N/A'
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

const renderSafe = (value, fallback = 'N/A') => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') {
        if (typeof value.email === 'string' && value.email.trim()) return value.email;
        if (typeof value.name === 'string' && value.name.trim()) return value.name;
        if (typeof value.full_name === 'string' && value.full_name.trim()) return value.full_name;
        if (typeof value.phone === 'string' && value.phone.trim()) return value.phone;
        try {
            const stringified = JSON.stringify(value);
            return stringified === '{}' ? fallback : stringified;
        } catch (e) {
            return fallback;
        }
    }
    return value;
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

const TYPE_FILTER_OPTIONS = [
    { value: '', label: 'All' },
    { value: 'company_employee', label: 'Company Employee' },
    { value: 'freelancer', label: 'Freelancer' },
    { value: 'guest', label: 'Guest User' },
    { value: 'admin', label: 'Admin Uploads' },
]

const RECORD_TYPE_EDIT_OPTIONS = [
    { value: 'company_employee', label: 'Company Employee' },
    { value: 'freelancer', label: 'Freelancer' },
    { value: 'guest', label: 'Guest User' },
    { value: 'admin', label: 'Admin Uploads' },
]

const Records = ({ initialFilter, setInitialFilter }) => {
    const [searchTerm, setSearchTerm] = useState(initialFilter || '')
    const [typeFilter, setTypeFilter] = useState('')
    const [records, setRecords] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedCandidate, setSelectedCandidate] = useState(null)

    // Fetch records from database - always fresh data
    const fetchRecords = async () => {
        try {
            setLoading(true)
            setError(null)
            const token = localStorage.getItem('authToken')

            // Using the same endpoint as dashboard for now as it contains the recent records
            const response = await fetch(`${API_BASE_URL}/admin/stats`, {
                headers: {
                    ...(token && { Authorization: `Bearer ${token}` })
                }
            })

            if (response.status === 401) throw new Error('Unauthorized')
            if (response.status === 403) throw new Error('Access Denied')
            if (!response.ok) throw new Error('Failed to fetch records')

            const data = await response.json()
            // Extract recent resumes/records
            const recentResumes = data.recentResumes || data.recent_resumes || []
            setRecords(recentResumes)
        } catch (err) {
            console.error('Error fetching records:', err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // Initial fetch; refresh only when new data arrives (e.g. resume upload), not on tab/focus
    useEffect(() => {
        fetchRecords()

        const handleResumeUploaded = (event) => {
            console.log('📥 Records: Received resumeUploaded event', event.detail)
            setTimeout(() => {
                console.log('🔄 Records: Refreshing records after upload...')
                fetchRecords()
            }, 1000)
        }

        window.addEventListener('resumeUploaded', handleResumeUploaded)
        return () => window.removeEventListener('resumeUploaded', handleResumeUploaded)
    }, [])

    if (loading) {
        return (
            <div className="admin-dashboard">
                <div className="loading-message">
                    <div className="spinner"></div>
                    Loading records...
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="admin-dashboard">
                <div className="error-message">
                    <h3>Connection Error</h3>
                    <p>{error}</p>
                    <button onClick={fetchRecords} className="retry-btn">Retry</button>
                </div>
            </div>
        )
    }

    return (
        <div className="admin-dashboard records-dashboard">
            <div className="dashboard-header">
                <div className="header-text-group">
                    <h2>Candidate Records</h2>
                </div>

                <div className="records-search-wrapper">
                    <select
                        className="records-type-filter-select"
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        title="Filter by user type"
                    >
                        {TYPE_FILTER_OPTIONS.map((opt) => (
                            <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <div className="search-input-group">
                        <input
                            type="text"
                            placeholder="Search talent database..."
                            className="premium-cyber-input"
                            style={{ width: '280px' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {(searchTerm || typeFilter) && (
                        <button
                            className="reset-view-btn"
                            onClick={() => {
                                setSearchTerm('');
                                setTypeFilter('');
                                if (setInitialFilter) setInitialFilter(null);
                            }}
                            title="Clear All Filters"
                        >
                            ↺
                        </button>
                    )}
                </div>
            </div>

            <motion.div
                className="dashboard-section records-table-section"
                style={{ width: '100%', padding: '0', boxShadow: 'none' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div
                    className="table-container records-table-scroll"
                    data-lenis-prevent
                    tabIndex={0}
                    role="region"
                    aria-label="Candidate records table"
                    onWheel={(e) => {
                        const el = e.currentTarget
                        const canScrollY = el.scrollHeight > el.clientHeight
                        const canScrollX = el.scrollWidth > el.clientWidth
                        if (!canScrollY && !canScrollX) return
                        const atTop = el.scrollTop <= 0
                        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
                        const atLeft = el.scrollLeft <= 0
                        const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
                        const scrollingY = (e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)
                        const scrollingX = (e.deltaX < 0 && !atLeft) || (e.deltaX > 0 && !atRight)
                        if (scrollingY || scrollingX) e.stopPropagation()
                    }}
                >
                    <table className="data-table records-data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Candidate Details</th>
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
                            {(() => {
                                const getSourceType = (r) => {
                                    const st = (r.source_type || '').toLowerCase();
                                    if (st) return st;
                                    const ut = (r.user_type || '').toLowerCase().replace(/\s+/g, '_');
                                    if (ut.includes('company') || ut === 'company_employee') return 'company_employee';
                                    if (ut.includes('freelancer')) return 'freelancer';
                                    if (ut.includes('guest') || ut === 'gmail') return 'guest';
                                    if (ut.includes('admin')) return 'admin';
                                    return ut || '';
                                };
                                const filtered = records.filter(r => {
                                    const srcType = getSourceType(r);
                                    if (typeFilter) {
                                        if (typeFilter === 'company_employee' && srcType !== 'company_employee') return false;
                                        if (typeFilter === 'freelancer' && srcType !== 'freelancer') return false;
                                        if (typeFilter === 'guest' && srcType !== 'guest' && srcType !== 'gmail') return false;
                                        if (typeFilter === 'admin' && srcType !== 'admin') return false;
                                    }
                                    if (!searchTerm) return true;
                                    const search = searchTerm.toLowerCase();
                                    return (
                                        (r.name || r.full_name || '').toLowerCase().includes(search) ||
                                        (r.role || '').toLowerCase().includes(search) ||
                                        (r.location || '').toLowerCase().includes(search) ||
                                        (r.skills || []).some(s => (s && String(s).toLowerCase().includes(search)))
                                    );
                                });

                                if (filtered.length === 0) {
                                    const filterDesc = typeFilter ? TYPE_FILTER_OPTIONS.find(o => o.value === typeFilter)?.label || typeFilter : '';
                                    const msg = searchTerm && filterDesc
                                        ? `No results for "${searchTerm}" in ${filterDesc}`
                                        : searchTerm
                                            ? `No results found for "${searchTerm}"`
                                            : filterDesc
                                                ? `No ${filterDesc} records found`
                                                : 'No records found';
                                    return (
                                        <tr>
                                            <td colSpan="11" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                                {msg}
                                            </td>
                                        </tr>
                                    );
                                }

                                return filtered.map((resume, index) => (
                                    <tr
                                        key={resume.id || resume.resume_id}
                                        className="clickable-row"
                                        onClick={() => setSelectedCandidate(resume)}
                                    >
                                        <td><span className="id-badge">#{index + 1}</span></td>
                                        <td>
                                            <div className="name-cell">
                                                <div className="name-info">
                                                    <span className="candidate-name" title={renderSafe(resume.name || resume.full_name)}>{renderSafe(resume.name || resume.full_name, 'Anonymous')}</span>
                                                    <span className="candidate-email-sub" title={renderSafe(resume.email)}>{renderSafe(resume.email, 'No Email')}</span>
                                                </div>
                                            </div>
                                        </td>
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
                                                {(resume.parsed_data?.resume_certificates || [])
                                                    .filter(c => c && c !== "Not mentioned")
                                                    .slice(0, 1).map((cert, idx) => (
                                                        <span key={idx} className="cert-tag-new">{cleanCertText(cert)}</span>
                                                    ))}
                                                {resume.parsed_data?.resume_certificates?.filter(c => c && c !== "Not mentioned")?.length > 1 && (
                                                    <span className="more-count">+{resume.parsed_data.resume_certificates.filter(c => c && c !== "Not mentioned").length - 1}</span>
                                                )}
                                                {(!(resume.parsed_data?.resume_certificates?.filter(c => c && c !== "Not mentioned")?.length > 0)) && (
                                                    <span className="na-text">N/A</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="links-cell" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                {(resume.linked_in || resume.meta_data?.form_data?.linkedIn) && (() => {
                                                    const raw = resume.linked_in || resume.meta_data?.form_data?.linkedIn || ''
                                                    const u = raw.trim()
                                                    const href = (u.startsWith('http://') || u.startsWith('https://')) ? u : `https://${u}`
                                                    return (
                                                        <a href={href} target="_blank" rel="noreferrer" className="link-icon-btn" title="LinkedIn" style={{ padding: '4px 8px', background: 'rgba(10, 102, 194, 0.15)', color: '#0a66c2', borderRadius: '6px', textDecoration: 'none', fontSize: '0.85rem' }}>
                                                            LinkedIn
                                                        </a>
                                                    )
                                                })()}
                                                {(resume.portfolio || resume.meta_data?.form_data?.portfolio) && (() => {
                                                    const raw = resume.portfolio || resume.meta_data?.form_data?.portfolio || ''
                                                    const u = raw.trim()
                                                    const href = (u.startsWith('http://') || u.startsWith('https://')) ? u : `https://${u}`
                                                    return (
                                                        <a href={href} target="_blank" rel="noreferrer" className="link-icon-btn" title="Portfolio" style={{ padding: '4px 8px', background: 'rgba(50, 130, 184, 0.15)', color: '#3282b8', borderRadius: '6px', textDecoration: 'none', fontSize: '0.85rem' }}>
                                                            Portfolio
                                                        </a>
                                                    )
                                                })()}
                                                {!(resume.linked_in || resume.meta_data?.form_data?.linkedIn || resume.portfolio || resume.meta_data?.form_data?.portfolio) && (
                                                    <span className="na-text">-</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            })()}
                        </tbody>
                    </table>
                </div>
            </motion.div>

            {/* Reusing the Modal from Dashboard would require exporting it or duplicating. 
          For now I will duplicate the simple modal logic to ensure independence 
          or better yet, I should export CandidateDetailModal from AdminDashboard if possible.
          Let's verify if AdminDashboard exports it. */
            }
            <CandidateDetailModal
                candidate={selectedCandidate}
                onClose={() => setSelectedCandidate(null)}
                onTypeUpdated={(updated) => {
                    const updatedId = updated.id ?? updated.resume_id
                    setRecords(prev => prev.map(r => ((r.id ?? r.resume_id) === updatedId ? { ...r, ...updated, id: updated.id ?? r.id, resume_id: updated.resume_id ?? r.resume_id } : r)))
                    setSelectedCandidate(prev => (prev && (prev.id ?? prev.resume_id) === updatedId ? { ...prev, ...updated, id: updated.id ?? prev.id, resume_id: updated.resume_id ?? prev.resume_id } : prev))
                }}
                onRecordsRefresh={fetchRecords}
            />
        </div>
    )
}

// Duplicated modal for strict isolation as per usual React component patterns if not in shared file
const CandidateDetailModal = ({ candidate, onClose, onTypeUpdated, onRecordsRefresh }) => {
    const getCurrentSourceType = (c) => {
        const st = (c?.source_type || '').toLowerCase()
        if (st) return st
        const ut = (c?.user_type || '').toLowerCase().replace(/\s+/g, '_')
        if (ut.includes('company') || ut === 'company_employee') return 'company_employee'
        if (ut.includes('freelancer')) return 'freelancer'
        if (ut.includes('guest') || ut === 'gmail') return 'guest'
        if (ut.includes('admin')) return 'admin'
        return 'guest'
    }
    const [editSourceType, setEditSourceType] = useState(() => getCurrentSourceType(candidate))
    const [typeSaving, setTypeSaving] = useState(false)
    const [typeError, setTypeError] = useState('')

    useEffect(() => {
        if (candidate) {
            setEditSourceType(getCurrentSourceType(candidate))
            setTypeError('')
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = 'unset'
        }
        return () => {
            document.body.style.overflow = 'unset'
        }
    }, [candidate])

    const handleSaveType = async () => {
        const resumeId = candidate?.id ?? candidate?.resume_id
        if (resumeId == null || !onTypeUpdated) return
        const current = getCurrentSourceType(candidate)
        const targetType = current === 'company_employee' ? 'guest' : editSourceType
        if (targetType === current) return
        setTypeSaving(true)
        setTypeError('')
        try {
            const token = getAuthToken()
            const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ADMIN_UPDATE_RESUME_TYPE}/${resumeId}/type`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { Authorization: `Bearer ${token}` }),
                },
                body: JSON.stringify({
                    source_type: targetType,
                    ...(current === 'company_employee' && candidate?.source_id && { source_id: candidate.source_id }),
                }),
            })
            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.detail || response.statusText || 'Failed to update type')
            }
            const updated = await response.json()
            if (!updated.id && resumeId != null) updated.id = resumeId
            onTypeUpdated(updated)
            if (onRecordsRefresh) await onRecordsRefresh()
            onClose()
        } catch (err) {
            setTypeError(err.message || 'Failed to update record type')
        } finally {
            setTypeSaving(false)
        }
    }

    if (!candidate) return null

    const cleanText = (text) => {
        if (typeof text !== 'string') return ''
        return text
            .replace(/^[●☐☑✓✔✅❌□■▪▫•◦‣⁃∙⦿⦾]+\s*/g, '')
            .replace(/^[\-\*\d\.]+\s*/g, '')
            .replace(/^[\s\W]+/, '')
            .trim()
    }

    const parsed = candidate.parsed_data || {}

    let certs = candidate.certificates || []
    if (certs.length === 0 && parsed.resume_certificates && Array.isArray(parsed.resume_certificates)) {
        certs = parsed.resume_certificates
            .filter(c => c && c !== "Not mentioned")
            .map(name => ({ name: name, issuer: 'Detected', date_obtained: null }))
    }

    const educations = candidate.educations || []
    const skills = candidate.skills && candidate.skills.length > 0 ? candidate.skills : (parsed.resume_skills || [])

    return createPortal(
        <motion.div
            className="modal-overlay record-detail-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
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
                        <button className="close-btn-new" aria-label="Close" onClick={onClose}>&times;</button>
                    </div>
                </div>

                <div className="modal-body" data-lenis-prevent>
                    <div className="modal-grid-container">
                        {onTypeUpdated && getCurrentSourceType(candidate) === 'company_employee' && (
                            <section className="modal-section record-type-edit-section">
                                <h3 className="section-title-sm">Record type</h3>
                                <div className="record-type-edit-row">
                                    <button
                                        type="button"
                                        className="record-type-save-btn record-type-save-btn-red"
                                        onClick={handleSaveType}
                                        disabled={typeSaving}
                                    >
                                        {typeSaving ? 'Saving...' : 'Change to Guest User'}
                                    </button>
                                </div>
                                {typeError && <p className="record-type-error">{typeError}</p>}
                            </section>
                        )}
                        <section className="modal-section">
                            <h3 className="section-title-sm">Quick Contacts & Essentials</h3>
                            <div className="record-fields-list">
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
                                            <div className="record-field-value record-field-value-filled">
                                                <a href={href} target="_blank" rel="noreferrer">{linkedInUrl.length > 60 ? linkedInUrl.slice(0, 57) + '...' : linkedInUrl}</a>
                                            </div>
                                        </div>
                                    )
                                })()}
                                {(candidate.portfolio || candidate.meta_data?.form_data?.portfolio) && (() => {
                                    const portfolioUrl = candidate.portfolio || candidate.meta_data?.form_data?.portfolio
                                    const href = (() => { const u = (portfolioUrl || '').trim(); return (u.startsWith('http://') || u.startsWith('https://')) ? u : `https://${u}` })()
                                    return (
                                        <div className="record-field">
                                            <span className="record-field-label">Portfolio / Website</span>
                                            <div className="record-field-value record-field-value-filled">
                                                <a href={href} target="_blank" rel="noreferrer">{portfolioUrl.length > 60 ? portfolioUrl.slice(0, 57) + '...' : portfolioUrl}</a>
                                            </div>
                                        </div>
                                    )
                                })()}
                                <div className="record-field">
                                    <span className="record-field-label">Relocation Status & Preference</span>
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
                                        {skills.length > 0 ? (
                                            skills.map((skill, idx) => (
                                                <span key={idx} className="record-tag">{skill}</span>
                                            ))
                                        ) : (
                                            <span className="record-tag record-tag-empty">No skills detected</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="content-block">
                                <h3 className="section-title-sm">Certifications</h3>
                                <div className="record-field">
                                    <span className="record-field-label">Certifications</span>
                                    <div className="record-tags-wrap">
                                        {certs.length > 0 ? (
                                            certs.map((cert, idx) => (
                                                <span key={idx} className="record-tag">{cleanCertText(cert.name)}</span>
                                            ))
                                        ) : (
                                            <span className="record-tag record-tag-empty">No certifications found</span>
                                        )}
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
                                                    {exp.start_date || ''} {exp.start_date && exp.end_date ? '-' : ''} {exp.end_date || ''}
                                                    {exp.is_current ? ' (Current)' : ''}
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

                {(candidate.file_url || candidate.id || candidate.resume_id) && (
                    <div className="modal-footer-premium">
                        <a
                            href={(() => {
                                if (candidate.file_url) {
                                    // If file_url is a relative path (starts with /), construct full URL
                                    if (candidate.file_url.startsWith('/')) {
                                        // Remove /api from API_BASE_URL and append file_url
                                        const baseUrl = API_BASE_URL.replace('/api', '')
                                        return `${baseUrl}${candidate.file_url}`
                                    }
                                    // If it's already a full URL, use it as is
                                    return candidate.file_url
                                }
                                // Fallback: construct from API_BASE_URL
                                return `${API_BASE_URL.replace('/api', '')}/api/resumes/${candidate.id || candidate.resume_id}/file`
                            })()}
                            target="_blank"
                            rel="noreferrer"
                            className="view-resume-action-btn"
                        >
                            📄 View Full Resume
                        </a>
                    </div>
                )}
            </motion.div>
        </motion.div>,
        document.body
    )
}

export default Records
