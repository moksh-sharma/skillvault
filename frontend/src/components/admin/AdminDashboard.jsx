import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Sector, LineChart, Line,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar
} from 'recharts'
import { API_BASE_URL } from '../../config/api'
import { emitAdminActivity } from '../../utils/adminActivity'
import './AdminDashboard.css'

// Helper to clean text from unwanted characters
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
    // If it's a known contact object structure, pick the best string field
    if (typeof value.email === 'string' && value.email.trim()) return value.email;
    if (typeof value.name === 'string' && value.name.trim()) return value.name;
    if (typeof value.full_name === 'string' && value.full_name.trim()) return value.full_name;
    if (typeof value.phone === 'string' && value.phone.trim()) return value.phone;

    // Fallback to stringifying if it's an object/array we can't otherwise render
    try {
      const stringified = JSON.stringify(value);
      return stringified === '{}' ? fallback : stringified;
    } catch (e) {
      return fallback;
    }
  }
  return value;
}

const NightingaleRoseWedge = (props) => {
  const {
    cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, maxTotal
  } = props;

  // Calculate the custom radius based on the total value
  // We use a square root scale to make the AREA proportional to the value (classic Nightingale)
  const normalizedValue = maxTotal > 0 ? (payload.total / maxTotal) : 0;
  const customOuterRadius = innerRadius + (outerRadius - innerRadius) * Math.sqrt(normalizedValue);

  const strokeColor = fill || '#6b7280'
  return (
    <g className="rose-wedge">
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={innerRadius}
        outerRadius={customOuterRadius}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={1}
        fillOpacity={0.35}
        className="wedge-sector"
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={customOuterRadius - 2}
        outerRadius={customOuterRadius}
        fill={strokeColor}
        fillOpacity={0.6}
      />
    </g>
  );
};

const AdminDashboard = ({ onNavigateToRecords }) => {
  const [selectedUserType, setSelectedUserType] = useState('all')
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [timeframe, setTimeframe] = useState('month') // 'day', 'month', 'quarter'
  const [selectedState, setSelectedState] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)

  const INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
    "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Delhi", "Chandigarh", "Puducherry", "Jammu & Kashmir", "Andaman & Nicobar", "Lakshadweep", "Ladakh", "Dadra & Nagar Haveli"
  ].sort();

  useEffect(() => {
    fetchDashboardData(selectedUserType)

    // Refresh only when new data arrives (e.g. after resume upload), not on tab/focus
    const handleResumeUploaded = (event) => {
      console.log('📥 AdminDashboard: Received resumeUploaded event', event.detail)
      setTimeout(() => {
        console.log('🔄 AdminDashboard: Refreshing dashboard data after upload...')
        fetchDashboardData(selectedUserType)
      }, 1000)
    }

    window.addEventListener('resumeUploaded', handleResumeUploaded)
    return () => window.removeEventListener('resumeUploaded', handleResumeUploaded)
  }, [selectedUserType])

  const fetchDashboardData = async (userTypeFilter = 'all') => {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem('authToken')
      const query = (userTypeFilter && userTypeFilter !== 'all')
        ? `?user_type=${encodeURIComponent(userTypeFilter)}`
        : ''
      const response = await fetch(`${API_BASE_URL}/admin/stats${query}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        }
      })

      if (response.status === 401) {
        throw new Error('Unauthorized. Please log in as an admin.')
      }

      if (response.status === 403) {
        throw new Error('Access Denied. Your account permissions have changed. Please LOGOUT and LOGIN again to refresh your access.')
      }

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }

      const data = await response.json()
      
      // Debug logging
      console.log('📊 AdminDashboard: Raw API response:', data)
      console.log('📊 AdminDashboard: total_records =', data.total_records)
      console.log('📊 AdminDashboard: total_resumes =', data.total_resumes)

      // Transform backend data to match frontend format
      const transformedData = {
        totalRecords: data.total_records ?? data.total_resumes ?? 0,
        totalUsers: data.total_users || 0,
        totalJD: data.total_jd_analyses || 0,
        totalMatches: data.total_matches || 0,
        totalCategories: data.total_categories ?? 0,
        totalPlatformUsers: data.total_platform_users ?? 0,
        totalEmployees: data.total_employees ?? 0,
        totalRoles: data.total_roles ?? 0,
        userTypeCounts: data.user_type_breakdown || {},
        topSkills: data.top_skills || [],
        topSkillsByUserType: data.top_skills_by_user_type || {},
        departments: data.departments || Object.keys(data.user_type_breakdown || {}),
        departmentDistribution: data.departmentDistribution || data.user_type_breakdown || {},
        trends: data.trends || { day: [], month: [], quarter: [] },
        experienceDistribution: data.experience_distribution || [],
        noticePeriodDistribution: data.notice_period_distribution || [],
        relocationDistribution: data.relocation_distribution ?? (() => {
          const total = data.total_records ?? data.total_resumes ?? 0
          return total > 0 ? [{ name: 'Ready to Relocate', count: 0 }, { name: 'Not open to relocation', count: total }] : []
        })(),
        locationDistribution: data.location_distribution || [],
        roleDistribution: data.role_distribution || [],
        recentResumes: data.recentResumes || data.recent_resumes || [],
        recentJD: data.recent_jd_analyses || []
      }

      console.log('📊 AdminDashboard: Transformed data:', transformedData)
      console.log('📊 AdminDashboard: totalRecords =', transformedData.totalRecords)
      
      setDashboardData(transformedData)
      setError(null)
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError(err.message || 'Failed to load dashboard data. Please check if you are logged in as admin.')
    } finally {
      setLoading(false)
    }
  }

  const handleOutlookSync = async () => {
    try {
      setSyncing(true)
      setSyncStatus(null)
      const token = localStorage.getItem('authToken')

      const response = await fetch(`${API_BASE_URL}/resumes/outlook/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` })
        }
      })

      const data = await response.json()
      if (response.ok) {
        setSyncStatus({ success: true, message: 'Outlook sync pipeline activated!' })
        emitAdminActivity({ type: 'outlook_sync' })
        setTimeout(() => emitAdminActivity({ type: 'outlook_sync' }), 5000)
        setTimeout(() => setSyncStatus(null), 5000)
      } else {
        throw new Error(data.detail || 'Failed to trigger Outlook sync')
      }
    } catch (err) {
      setSyncStatus({ success: false, message: err.message })
      setTimeout(() => setSyncStatus(null), 7000)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="loading-message">
          <div className="spinner"></div>
          Loading dashboard data...
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
          <button onClick={() => fetchDashboardData(selectedUserType)} className="retry-btn">
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  if (!dashboardData) {
    return (
      <div className="admin-dashboard">
        <div className="error-message">No data available</div>
      </div>
    )
  }

  // API returns already-filtered data when user_type query is set; totalRecords and all graphs reflect current filter
  const talentPoolCount = dashboardData?.totalRecords ?? 0
  const topSkillsForChart = dashboardData?.topSkills ?? []

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <div className="header-text-group">
          <h2>Dashboard</h2>
          <button
            onClick={handleOutlookSync}
            disabled={syncing}
            className={`outlook-sync-btn ${syncing ? 'syncing' : ''}`}
            title="Sync resumes from HR Outlook inbox"
          >
            <span className="btn-icon">📧</span>
            {syncing ? 'Syncing...' : 'Sync Outlook'}
          </button>
          {syncStatus && (
            <div className={`sync-status-toast ${syncStatus.success ? 'success' : 'error'}`}>
              {syncStatus.message}
            </div>
          )}
        </div>
        <div className="user-type-filter-wrapper">
          <select
            value={selectedUserType}
            onChange={(e) => setSelectedUserType(e.target.value)}
            className="premium-cyber-select"
          >
            <option value="all">All Talent Categories</option>
            <option value="Company Employee">Company Employee</option>
            <option value="Freelancer">Freelancer</option>
            <option value="Guest User">Guest User</option>
            <option value="Admin Uploads">Admin Uploads</option>
          </select>
        </div>
      </div>

      <div className="stats-overview-grid">
        <motion.div
          className="stat-card-new"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="stat-icon-wrapper" style={{ background: 'rgba(0, 242, 255, 0.1)', color: '#00f2ff' }}>
            <span>📈</span>
          </div>
          <div className="stat-info-new">
            <span className="label">Talent Pool</span>
            <span className="value">{talentPoolCount ? talentPoolCount.toLocaleString() : '0'}</span>
          </div>
        </motion.div>

        <motion.div
          className="stat-card-new"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <div className="stat-icon-wrapper" style={{ background: 'rgba(127, 183, 176, 0.2)', color: '#0d9488' }}>
            <span>📂</span>
          </div>
          <div className="stat-info-new">
            <span className="label">Total Categories</span>
            <span className="value">{dashboardData.totalCategories ?? 0}</span>
          </div>
        </motion.div>

        <motion.div
          className="stat-card-new"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
            <span>👥</span>
          </div>
          <div className="stat-info-new">
            <span className="label">Platform Users</span>
            <span className="value">{dashboardData.totalPlatformUsers ?? 0}</span>
          </div>
        </motion.div>

        <motion.div
          className="stat-card-new"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <div className="stat-icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>
            <span>🏢</span>
          </div>
          <div className="stat-info-new">
            <span className="label">Total Employees</span>
            <span className="value">{dashboardData.totalEmployees ?? 0}</span>
          </div>
        </motion.div>

        <motion.div
          className="stat-card-new"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="stat-icon-wrapper" style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6' }}>
            <span>🎯</span>
          </div>
          <div className="stat-info-new">
            <span className="label">Total Roles</span>
            <span className="value">{dashboardData.totalRoles ?? 0}</span>
          </div>
        </motion.div>
      </div>

      <div className="dashboard-grid-new">
        <motion.div
          className="dashboard-section clay-card acquisition-trends"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="section-header-row">
            <h3>Onboarding Trends</h3>
            <div className="timeframe-toggles">
              <button
                className={`toggle-btn ${timeframe === 'day' ? 'active' : ''}`}
                onClick={() => setTimeframe('day')}
              >Day</button>
              <button
                className={`toggle-btn ${timeframe === 'month' ? 'active' : ''}`}
                onClick={() => setTimeframe('month')}
              >Month</button>
              <button
                className={`toggle-btn ${timeframe === 'quarter' ? 'active' : ''}`}
                onClick={() => setTimeframe('quarter')}
              >Quarter</button>
            </div>
          </div>

          <div className="chart-container" style={{ height: '350px', marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboardData.trends[timeframe] || []} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <filter id="line-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#9CA3AF"
                  fontSize={11}
                  fontWeight={600}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#9CA3AF"
                  fontSize={11}
                  fontWeight={600}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="custom-recharts-tooltip">
                          <p style={{ color: '#1F2937', fontSize: '12px', fontWeight: 600, margin: 0 }}>{label}</p>
                          <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', margin: '8px 0' }} />
                          {payload.map((entry, index) => (
                            <p key={index} style={{ color: '#6B7280', fontSize: '0.85rem', margin: '4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ backgroundColor: entry.color, width: '8px', height: '8px', borderRadius: '50%' }} />
                              {entry.name}: <span style={{ fontWeight: 600, color: '#1F2937' }}>{entry.value}</span>
                            </p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6B7280' }}
                />
                <Line
                  type="monotone"
                  dataKey="Company Employee"
                  stroke="#7FB7B0"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#7FB7B0', strokeWidth: 2, stroke: '#F4EFE8' }}
                  activeDot={{ r: 6, strokeWidth: 0, style: { filter: 'url(#line-glow)' } }}
                  animationDuration={1500}
                />
                <Line
                  type="monotone"
                  dataKey="Freelancer"
                  stroke="#A78BFA"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#A78BFA', strokeWidth: 2, stroke: '#F4EFE8' }}
                  activeDot={{ r: 6, strokeWidth: 0, style: { filter: 'url(#line-glow)' } }}
                  animationDuration={1500}
                  delay={200}
                />
                <Line
                  type="monotone"
                  dataKey="Guest User"
                  stroke="#EC4899"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#EC4899', strokeWidth: 2, stroke: '#F4EFE8' }}
                  activeDot={{ r: 6, strokeWidth: 0, style: { filter: 'url(#line-glow)' } }}
                  animationDuration={1500}
                  delay={400}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>


        <motion.div
          className="dashboard-section clay-card exp-distribution-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="section-header-row">
            <h3>Experience Distribution</h3>
          </div>
          <div className="chart-container" style={{ height: '280px', marginTop: '1.5rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboardData.experienceDistribution} margin={{ top: 10, right: 30, left: 10, bottom: 35 }}>
                <defs>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7FB7B0" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#7FB7B0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="exp"
                  stroke="#9CA3AF"
                  fontSize={10}
                  fontWeight={600}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  height={50}
                  padding={{ left: 10, right: 10 }}
                  label={{ value: 'Years of Experience', position: 'insideBottom', offset: 0, fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }}
                />
                <YAxis
                  stroke="#9CA3AF"
                  fontSize={12}
                  fontWeight={600}
                  axisLine={false}
                  tickLine={false}
                  hide={true}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="custom-recharts-tooltip">
                          <p style={{ color: '#1F2937', fontSize: '12px', fontWeight: 600, margin: 0 }}>{payload[0].payload.exp} Years Exp</p>
                          <p style={{ color: '#7FB7B0', fontSize: '14px', fontWeight: 600, margin: '4px 0 0' }}>Count: {payload[0].value}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#7FB7B0"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorExp)"
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Notice Period Windrose (Nightingale-style) - data from database */}
        <motion.div
          className="dashboard-section clay-card notice-windrose-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <div className="section-header-row">
            <h3>Notice Period</h3>
          </div>
          <div className="chart-container" style={{ height: '320px', marginTop: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {(!dashboardData.noticePeriodDistribution || dashboardData.noticePeriodDistribution.length === 0) ? (
              <div className="no-data-placeholder">
                <p>No notice period data in database</p>
              </div>
            ) : (() => {
              const roseData = dashboardData.noticePeriodDistribution.map(d => ({ name: d.name, value: 1, total: d.count || 0 }))
              const maxTotal = Math.max(...roseData.map(x => x.total), 1)
              const WINDROSE_COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#ec4899', '#a16207', '#6b7280']
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                    <Pie
                      data={roseData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={100}
                      paddingAngle={1}
                      dataKey="value"
                      nameKey="name"
                      shape={(props) => <NightingaleRoseWedge {...props} maxTotal={maxTotal} />}
                    >
                      {roseData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={WINDROSE_COLORS[index % WINDROSE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p = payload[0].payload
                          return (
                            <div className="custom-recharts-tooltip">
                              <p style={{ color: '#1F2937', fontSize: '12px', fontWeight: 600, margin: 0 }}>{p.name}</p>
                              <p style={{ color: '#7FB7B0', fontSize: '14px', fontWeight: 600, margin: '4px 0 0' }}>Candidates: {p.total}</p>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      align="center"
                      formatter={(value) => value}
                      wrapperStyle={{ fontSize: '10px', fontWeight: 600 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )
            })()}
          </div>
        </motion.div>

        {/* Relocation Arc diagram - data from database (ready_to_relocate) */}
        <motion.div
          className="dashboard-section clay-card relocation-arc-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="section-header-row">
            <h3>Relocation</h3>
          </div>
          <div className="chart-container" style={{ height: '320px', marginTop: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {(!dashboardData.relocationDistribution || dashboardData.relocationDistribution.length === 0) ? (
              <div className="no-data-placeholder">
                <p>No relocation data in database</p>
              </div>
            ) : (() => {
              const rel = Array.isArray(dashboardData.relocationDistribution) ? dashboardData.relocationDistribution : []
              const total = rel.reduce((s, d) => s + (d.count || 0), 0) || 1
              const arcData = rel.map((d, i) => ({
                name: d.name,
                count: d.count || 0,
                value: Math.round((100 * (d.count || 0)) / total),
                fill: ['#7FB7B0', '#D8B892'][i % 2]
              }))
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="20%"
                    outerRadius="90%"
                    data={arcData}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar
                      background
                      minAngle={15}
                      dataKey="value"
                      nameKey="name"
                    >
                      {arcData.map((entry, index) => (
                        <Cell key={`reloc-${index}`} fill={entry.fill} />
                      ))}
                    </RadialBar>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p = payload[0].payload
                          return (
                            <div className="custom-recharts-tooltip">
                              <p style={{ color: '#1F2937', fontSize: '12px', fontWeight: 600, margin: 0 }}>{p.name}</p>
                              <p style={{ color: '#7FB7B0', fontSize: '14px', fontWeight: 600, margin: '4px 0 0' }}>Candidates: {p.count}</p>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" formatter={(value) => value} wrapperStyle={{ fontSize: '10px', fontWeight: 600 }} />
                  </RadialBarChart>
                </ResponsiveContainer>
              )
            })()}
          </div>
        </motion.div>

        <motion.div
          className="dashboard-section clay-card skills-radar-section"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="section-header-row">
            <h3>Top Candidate Skills</h3>
          </div>

          <div className="skills-analytics-radar" style={{ height: '400px', marginTop: '1.5rem' }}>
            {topSkillsForChart.length === 0 ? (
              <div className="no-data-placeholder">
                <p>No skill data detected in database</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={topSkillsForChart.slice(0, 8)}>
                  <PolarGrid stroke="rgba(0,0,0,0.05)" />
                  <PolarAngleAxis
                    dataKey="skill"
                    tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 'auto']}
                    tick={false}
                    axisLine={false}
                  />
                  <Radar
                    name="Skills"
                    dataKey="count"
                    stroke="#7FB7B0"
                    strokeWidth={3}
                    fill="#7FB7B0"
                    fillOpacity={0.25}
                    dot={{ r: 4, fill: '#7FB7B0', fillOpacity: 1 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="custom-recharts-tooltip">
                            <p style={{ color: '#1F2937', fontSize: '12px', fontWeight: 600, margin: 0 }}>{payload[0].payload.skill}</p>
                            <p style={{ color: '#7FB7B0', fontSize: '14px', fontWeight: 600, margin: '4px 0 0' }}>Count: {payload[0].value}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div
          className="dashboard-section clay-card location-histogram-section"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="section-header-row">
            <div className="header-left">
              <h3>Geospatial Talent Density</h3>
            </div>
            <div className="location-filter-wrapper">
              <select
                className="premium-cyber-select"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                style={{ width: '180px' }}
              >
                <option value="">Top States</option>
                {INDIAN_STATES.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="location-analytics-histogram" style={{ height: '400px', marginTop: '1.5rem' }}>
            {dashboardData.locationDistribution.length === 0 ? (
              <div className="no-data-placeholder">
                <p>No location data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(() => {
                    const sorted = [...dashboardData.locationDistribution].sort((a, b) => b.count - a.count);
                    if (!selectedState) return sorted.slice(0, 8);

                    const topState = sorted.find(s => s.state === selectedState);
                    const others = sorted.filter(s => s.state !== selectedState);

                    if (topState) {
                      return [topState, ...others.slice(0, 7)];
                    } else {
                      // If selected state has 0 count in database
                      return [{ state: selectedState, count: 0 }, ...others.slice(0, 7)];
                    }
                  })()}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#A78BFA" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="highlightGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#EC4899" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#EC4899" stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="state"
                    type="category"
                    tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 600 }}
                    width={80}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(167, 139, 250, 0.06)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const isHighlighted = payload[0].payload.state === selectedState;
                        return (
                          <div className="custom-recharts-tooltip" style={{ borderColor: isHighlighted ? '#EC4899' : 'rgba(127, 183, 176, 0.3)' }}>
                            <p style={{ color: '#1F2937', fontSize: '12px', fontWeight: 600, margin: 0 }}>
                              {payload[0].payload.state}
                              {isHighlighted && <span style={{ marginLeft: '8px', color: '#EC4899', fontSize: '10px' }}>● Selected Focus</span>}
                            </p>
                            <p style={{ color: isHighlighted ? '#EC4899' : '#A78BFA', fontSize: '14px', fontWeight: 600, margin: '4px 0 0' }}>{payload[0].value} Professionals</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                    animationDuration={1500}
                  >
                    {(() => {
                      const data = (() => {
                        const sorted = [...dashboardData.locationDistribution].sort((a, b) => b.count - a.count);
                        if (!selectedState) return sorted.slice(0, 8);
                        const topState = sorted.find(s => s.state === selectedState);
                        const others = sorted.filter(s => s.state !== selectedState);
                        return topState ? [topState, ...others.slice(0, 7)] : [{ state: selectedState, count: 0 }, ...others.slice(0, 7)];
                      })();
                      return data.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.state === selectedState ? "url(#highlightGradient)" : "url(#barGradient)"}
                        />
                      ));
                    })()}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

      </div>



    </div>
  )
}

const getDepartmentColor = (dept) => {
  const colors = {
    'Company Employee': '#3282b8',
    'Freelancer': '#00d4ff',

    'Guest User': '#0f4c75',
    'Engineering': '#3282b8',
    'Design': '#00d4ff',
    'Marketing': '#bbe1fa',
    'Sales': '#0f4c75',
    'HR': '#43e97b'
  }
  return colors[dept] || '#3282b8'
}

export default AdminDashboard

