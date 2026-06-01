/**
 * Admin portal walkthrough steps.
 * `tab` switches the active section when the step is shown.
 * `target` is a CSS selector for the spotlight (optional).
 */
export const getAdminGuideSteps = (isAdminRoleOnly = false) => {
  const steps = [
    {
      id: 'intro',
      title: 'Welcome to SkillVault Admin',
      body: 'This guided tour walks through every section of the admin portal - navigation, talent search, records, jobs, and more. Use Next to continue or Skip to exit anytime.',
      placement: 'center',
    },
    {
      id: 'guide-button',
      title: 'Restart the tour',
      body: 'Click the Guide button here whenever you need a refresher on how the portal works.',
      target: '[data-guide="admin-guide-btn"]',
      placement: 'bottom',
    },
    {
      id: 'dashboard',
      tab: 'dashboard',
      title: 'Dashboard',
      body: 'Your overview: candidate counts, experience and skills charts, role distribution, and recent activity. Click chart segments or stats to jump to filtered Records.',
      target: '[data-guide-tab="dashboard"]',
      pageTarget: '.admin-dashboard:not(.records-dashboard)',
      placement: 'bottom',
    },
    {
      id: 'links',
      tab: 'links',
      title: 'Links',
      body: 'Quick access to guest, freelancer, and employee application portals. Copy or share these URLs with candidates and internal teams.',
      target: '[data-guide-tab="links"]',
      pageTarget: '.admin-portal-links',
      placement: 'bottom',
    },
    {
      id: 'records',
      tab: 'records',
      title: 'Records',
      body: 'Browse every candidate in the database. Search, filter by user type, sort columns, and open a row for full profile details, skills, and resume links. The table scrolls horizontally and vertically.',
      target: '[data-guide-tab="records"]',
      pageTarget: '.records-dashboard',
      placement: 'bottom',
    },
    {
      id: 'search-talent',
      tab: 'search-talent',
      title: 'Search Talent',
      body: 'Filter candidates by experience, location, role, skills, and contact info. Run a search, then review results and open profiles or resumes from the list.',
      target: '[data-guide-tab="search-talent"]',
      pageTarget: '.search-talent',
      placement: 'bottom',
    },
    {
      id: 'search-jd',
      tab: 'search-jd',
      title: 'Search Using JD',
      body: 'Upload or paste a job description to find matching candidates. The system scores resumes against the JD so you can shortlist the best fits.',
      target: '[data-guide-tab="search-jd"]',
      pageTarget: '.search-using-jd',
      placement: 'bottom',
    },
    {
      id: 'add-resume',
      tab: 'add-resume',
      title: 'Add New Resume',
      body: 'Bulk-upload PDF or DOCX resumes into the talent database. Review the upload summary, then submit all files to parse and store candidate data.',
      target: '[data-guide-tab="add-resume"]',
      pageTarget: '.add-new-resume',
      placement: 'bottom',
    },
    {
      id: 'manage-jobs',
      tab: 'manage-jobs',
      title: 'Manage Jobs',
      body: 'Create and edit job openings, upload JD PDFs, publish roles to the careers page, and review applicants per job in a dedicated table.',
      target: '[data-guide-tab="manage-jobs"]',
      pageTarget: '.manage-job-openings',
      placement: 'bottom',
    },
  ]

  if (isAdminRoleOnly) {
    steps.push(
      {
        id: 'employee-list',
        tab: 'employee-list',
        title: 'Employee List',
        body: 'Maintain the company employee roster used for invites and internal matching. Upload or update the list and review who has left the organization.',
        target: '[data-guide-tab="employee-list"]',
        pageTarget: '.employee-list-config',
        placement: 'bottom',
      },
      {
        id: 'users',
        tab: 'users',
        title: 'Users',
        body: 'Invite employees to the admin portal, assign roles, and manage who has platform access. Invited users receive email instructions to set their password.',
        target: '[data-guide-tab="users"]',
        pageTarget: '.admin-users-page',
        placement: 'bottom',
      }
    )
  }

  steps.push({
    id: 'finish',
    title: "You're all set",
    body: 'Explore each tab at your own pace. Use Guide in the navigation bar to run this tour again.',
    placement: 'center',
  })

  return steps
}
