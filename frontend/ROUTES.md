# SkillVault - Frontend Routes Documentation

## Route Structure

This document outlines all the routes in the SkillVault frontend application.

### Base Routes

| Route | Component | Description | Auth Required |
|-------|-----------|-------------|---------------|
| `/` | Redirect | Redirects to `/login` | No |
| `/login` | `Login` | User login page | No |
| `/dashboard` | `Dashboard` | Main dashboard with employment type selection | Yes |
| `/application` | `Application` | Combined CV upload and personal information form | Yes |

### Route Flow

```
Login → Dashboard (Select Employment Type) → Application (Upload CV + Fill Info) → Submit
```

### Route Details

#### 1. `/login`
- **Component**: `src/pages/Login.jsx`
- **Purpose**: User authentication
- **Features**:
  - Email and password input
  - Form validation
  - API integration needed (see `src/config/api.js`)
- **Redirects to**: `/dashboard` on successful login

#### 2. `/dashboard`
- **Component**: `src/pages/Dashboard.jsx`
- **Purpose**: Main dashboard with employment type selection
- **Features**:
  - Navbar with "SkillVault" heading
  - Profile button
  - Admin toggle button
  - 4 employment type cards directly on dashboard:
    - Company Employee
    - Hired Forces
    - Freelancer
    - Guest User
  - Animated card selection
  - Auto-redirects to application page after selection
- **Protected**: Yes (requires authentication)

#### 3. `/application`
- **Component**: `src/pages/Application.jsx`
- **Purpose**: Combined CV upload and personal information form
- **Features**:
  - **CV Upload Section**:
    - Drag and drop file upload
    - File type validation (PDF, DOC, DOCX)
    - File size validation (max 5MB)
    - File preview with remove option
  - **Personal Information Form**:
    - Basic information (name, email, phone)
    - Address information
    - Professional information (experience, skills, education)
    - Links (LinkedIn, portfolio)
    - Form validation
  - Single submit button for both CV and personal info
  - API integration needed for submission
- **Protected**: Yes
- **Requires**: Selected employment type

### Navigation Components

#### Navbar
- **Component**: `src/components/Navbar.jsx`
- **Features**:
  - Center heading: "SkillVault" (clickable, navigates to dashboard)
  - Profile button (avatar with user initial)
  - Admin toggle button (when `showAdminToggle` prop is true)
- **Used in**: Dashboard, EmploymentTypeSelection, CVUpload, PersonalInfo

### State Management

The application uses React state for:
- Authentication status (`isAuthenticated`)
- User profile (`userProfile`)
- Selected employment type (`selectedEmploymentType`)

**TODO**: Consider implementing:
- Context API for global state
- Redux or Zustand for complex state management
- Persistent state (localStorage/sessionStorage)

### Future Routes (To Be Implemented)

- `/profile` - User profile page
- `/skillvault` - Admin dashboard (legacy `/admin` and `/techbank` redirect to `/skillvault`)
- `/applications` - User's submitted applications
- `/application/:id` - View specific application

### Route Protection

Routes are protected using conditional rendering in `App.jsx`:
- If user is not authenticated, redirect to `/login`
- Authentication state is managed in `App.jsx` (TODO: Move to Context/Redux)

### API Integration Reminders

See `src/config/api.js` for:
- API endpoint configuration
- API helper functions
- Integration TODO list

