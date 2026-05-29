import React, { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CACHE_LOGO_SRC } from '../../config/brandAssets'
import './AdminTransition.css'

const getTimeGreeting = () => {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const LogoutTransition = ({ onComplete, userProfile, name: nameProp }) => {
  const [stage, setStage] = useState(0)

  const greeting = useMemo(() => getTimeGreeting(), [])
  const userName = (nameProp || userProfile?.name || '').trim() || 'User'

  const screens = [
    { type: 'greeting', text: greeting },
    { type: 'name', text: userName },
    { type: 'farewell', text: 'Thank you for using the platform' },
    { type: 'powered' }
  ]

  const stageDuration = 2400
  const totalDuration = screens.length * stageDuration + 800

  useEffect(() => {
    const stageTimer = setInterval(() => {
      setStage((prev) => (prev < screens.length - 1 ? prev + 1 : prev))
    }, stageDuration)

    const completeTimer = setTimeout(() => {
      onComplete()
    }, totalDuration)

    return () => {
      clearInterval(stageTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete, screens.length, stageDuration, totalDuration])

  const isPoweredScreen = screens[stage].type === 'powered'

  return (
    <div className="admin-transition-overlay">
      <div className="transition-background">
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
        <div className="gradient-orb orb-3" />
      </div>

      <div className="content-wrapper content-wrapper-text-only">
        <motion.div
          className="status-container transition-welcome-container"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <AnimatePresence mode="wait">
            {isPoweredScreen ? (
              <motion.div
                key="powered"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.45 }}
                className="transition-screen-powered-wrap"
              >
                <span className="transition-powered-by-text transition-powered-by-text-centre">Powered by</span>
                <img src={CACHE_LOGO_SRC} alt="CACHE" className="transition-powered-by-logo transition-powered-by-logo-centre" />
              </motion.div>
            ) : (
              <motion.div
                key={stage}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.45 }}
                className={`transition-screen-text transition-screen-${screens[stage].type}`}
              >
                {screens[stage].text}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="progress-bar-container">
            <motion.div
              className="progress-bar-fill"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: totalDuration / 1000 - 0.5, ease: 'easeInOut' }}
            />
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default LogoutTransition
