import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import Navbar from '../components/Navbar'
import AdminDashboard from '../components/admin/AdminDashboard'
import AdminPortalLinks from '../components/admin/AdminPortalLinks'
import SearchTalent from '../components/admin/SearchTalent'
import SearchUsingJD from '../components/admin/SearchUsingJD'
import AddNewResume from '../components/admin/AddNewResume'
import Records from '../components/admin/Records'
import ManageJobOpenings from '../components/admin/ManageJobOpenings'
import EmployeeListConfig from '../components/admin/EmployeeListConfig'
import AdminUsers from '../components/admin/AdminUsers'
import CyberBackground from '../components/admin/CyberBackground'
import HelpAssistant from '../components/admin/HelpAssistant'
import AdminGuideWalkthrough from '../components/admin/AdminGuideWalkthrough'
import { getAdminGuideSteps } from '../components/admin/adminGuideSteps'
import './Admin.css'

const Admin = () => {
  const { userProfile } = useApp()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [initialFilter, setInitialFilter] = useState(null)
  const [guideActive, setGuideActive] = useState(false)
  const [guideStep, setGuideStep] = useState(0)

  const navigateToRecords = (filter = null) => {
    setInitialFilter(filter)
    setActiveTab('records')
  }

  const isAdminRoleOnly = (userProfile?.mode ?? '').toLowerCase() === 'admin'

  const tabs = useMemo(() => {
    const all = [
      { id: 'dashboard', label: 'Dashboard', icon: '📊', colorClass: 'tab-dashboard' },
      { id: 'links', label: 'Links', icon: '🔗', colorClass: 'tab-links' },
      { id: 'records', label: 'Records', icon: '📂', colorClass: 'tab-records' },
      { id: 'search-talent', label: 'Search Talent', icon: '🔍', colorClass: 'tab-search-talent' },
      { id: 'search-jd', label: 'Search Using JD', icon: '📝', colorClass: 'tab-search-jd' },
      { id: 'add-resume', label: 'Add New Resume', icon: '➕', colorClass: 'tab-add-resume' },
      { id: 'manage-jobs', label: 'Manage Jobs', icon: '💼', colorClass: 'tab-manage-jobs' },
      { id: 'employee-list', label: 'Employee List', icon: '👥', colorClass: 'tab-employee-list' },
      { id: 'users', label: 'Users', icon: '👤', colorClass: 'tab-users' }
    ]
    if (isAdminRoleOnly) return all
    return all.filter((t) => t.id !== 'employee-list' && t.id !== 'users')
  }, [isAdminRoleOnly])

  const guideSteps = useMemo(() => getAdminGuideSteps(isAdminRoleOnly), [isAdminRoleOnly])
  const guideHighlightTab = guideActive ? guideSteps[guideStep]?.tab ?? null : null

  const startGuide = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    setGuideStep(0)
    setGuideActive(true)
  }

  useEffect(() => {
    if (!isAdminRoleOnly && (activeTab === 'employee-list' || activeTab === 'users')) {
      setActiveTab('dashboard')
    }
  }, [isAdminRoleOnly, activeTab])

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <AdminDashboard onNavigateToRecords={navigateToRecords} />
      case 'links':
        return <AdminPortalLinks />
      case 'records':
        return <Records initialFilter={initialFilter} setInitialFilter={setInitialFilter} />
      case 'search-talent':
        return <SearchTalent />
      case 'search-jd':
        return <SearchUsingJD />
      case 'add-resume':
        return <AddNewResume />
      case 'manage-jobs':
        return <ManageJobOpenings />
      case 'employee-list':
        return <EmployeeListConfig />
      case 'users':
        return <AdminUsers />
      default:
        return <AdminDashboard onNavigateToRecords={navigateToRecords} />
    }
  }

  return (
    <div className="admin-container">
      <CyberBackground />
      <Navbar
        userProfile={userProfile}
        showProfile={true}
        adminTabs={tabs}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onStartGuide={startGuide}
        guideHighlightTab={guideHighlightTab}
      />

      <div className="admin-content">
        <div className="admin-content-area" key={activeTab}>
          {renderContent()}
        </div>
      </div>

      {guideActive && (
        <AdminGuideWalkthrough
          steps={guideSteps}
          stepIndex={guideStep}
          setStepIndex={setGuideStep}
          onClose={() => setGuideActive(false)}
          setActiveTab={setActiveTab}
        />
      )}

      {import.meta.env.VITE_ENABLE_HELP_ASSISTANT === 'true' ? <HelpAssistant /> : null}
    </div>
  )
}

export default Admin

