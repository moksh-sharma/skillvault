import { useNavigate } from 'react-router-dom'
import { CACHE_LOGO_SRC } from '../config/brandAssets'
import './CareersHeader.css'

const CareersHeader = () => {
  const navigate = useNavigate()
  return (
    <header className="careers-header">
      <div className="careers-header-content">
        <div className="careers-logo" onClick={() => navigate('/')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate('/')}>
          <img src={CACHE_LOGO_SRC} alt="CACHE" />
          <span className="careers-logo-text">Cache Digitech</span>
        </div>
        <nav className="careers-header-nav">
          <a href="/" className="careers-nav-link">Home</a>
          <a href="/careers.html" className="careers-nav-link careers-nav-link--active">Careers</a>
          <button type="button" className="careers-btn careers-btn-ghost" onClick={() => navigate('/login')}>Log in</button>
          <button type="button" className="careers-btn careers-btn-primary" onClick={() => navigate('/signup')}>Sign up</button>
        </nav>
      </div>
    </header>
  )
}

export default CareersHeader

