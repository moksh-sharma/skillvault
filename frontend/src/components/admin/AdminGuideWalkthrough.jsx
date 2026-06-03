import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useLenis } from '@studio-freight/react-lenis'
import './AdminGuideWalkthrough.css'

/** Keep the page at the top during the tour (no scrollIntoView on tall sections). */
function scrollGuideToTop(lenis) {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
  lenis?.scrollTo?.(0, { immediate: true })
}

const PADDING = 8

function measureTarget(selector) {
  if (!selector) return null
  const el = document.querySelector(selector)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  }
}

function pickSpotlightRect(step) {
  const page = step.pageTarget ? measureTarget(step.pageTarget) : null
  const tab = step.target ? measureTarget(step.target) : null
  if (page && tab) {
    const top = Math.min(page.top, tab.top)
    const left = Math.min(page.left, tab.left)
    const right = Math.max(page.left + page.width, tab.left + tab.width)
    const bottom = Math.max(page.top + page.height, tab.top + tab.height)
    return { top, left, width: right - left, height: bottom - top }
  }
  return page || tab
}

function computeTooltipPosition(rect, placement) {
  const margin = 16
  const tooltipWidth = Math.min(420, window.innerWidth - 32)
  const estimatedHeight = 220

  if (!rect || placement === 'center') {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', className: 'admin-guide-tooltip--center' }
  }

  let top = rect.top + rect.height + margin
  let left = rect.left + rect.width / 2 - tooltipWidth / 2
  let transform = 'none'

  if (placement === 'top' || top + estimatedHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - estimatedHeight - margin)
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipWidth - margin))

  return {
    top: `${top}px`,
    left: `${left}px`,
    transform,
    className: '',
    width: tooltipWidth,
  }
}

const AdminGuideWalkthrough = ({
  steps,
  stepIndex,
  setStepIndex,
  onClose,
  setActiveTab,
}) => {
  const [spotlight, setSpotlight] = useState(null)
  const [tooltipStyle, setTooltipStyle] = useState({ className: 'admin-guide-tooltip--center' })
  const tabSwitchTimer = useRef(null)
  const lenis = useLenis()

  const step = steps[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex >= steps.length - 1

  const updateLayout = useCallback(() => {
    if (!step) return
    const rect = step.placement === 'center' ? null : pickSpotlightRect(step)
    setSpotlight(rect)
    setTooltipStyle(computeTooltipPosition(rect, step.placement))
  }, [step])

  useEffect(() => {
    if (!step) return

    if (step.tab && setActiveTab) {
      setActiveTab(step.tab)
    }

    const runMeasure = () => {
      scrollGuideToTop(lenis)
      updateLayout()
    }

    clearTimeout(tabSwitchTimer.current)
    tabSwitchTimer.current = setTimeout(runMeasure, step.tab ? 320 : 80)

    return () => clearTimeout(tabSwitchTimer.current)
  }, [step, stepIndex, setActiveTab, updateLayout, lenis])

  useEffect(() => {
    scrollGuideToTop(lenis)
  }, [lenis])

  useEffect(() => {
    const onResize = () => updateLayout()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [updateLayout])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && !isLast) setStepIndex((i) => Math.min(i + 1, steps.length - 1))
      if (e.key === 'ArrowLeft' && !isFirst) setStepIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFirst, isLast, onClose, setStepIndex, steps.length])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  if (!step) return null

  const goNext = () => {
    if (isLast) onClose()
    else setStepIndex((i) => i + 1)
  }

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1))

  return createPortal(
    <AnimatePresence mode="wait">
      <motion.div 
        key="admin-guide-root"
        className="admin-guide-root" 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="admin-guide-title"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {step.placement !== 'center' && spotlight ? (
          <motion.div
            className="admin-guide-spotlight"
            animate={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        ) : (
          <motion.div 
            className="admin-guide-backdrop" 
            onClick={onClose} 
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}

        <motion.div
          key={step.id}
          className={`admin-guide-tooltip ${tooltipStyle.className || ''}`}
          style={{
            width: tooltipStyle.width,
          }}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ 
            opacity: 1, 
            y: 0, 
            scale: 1,
            top: tooltipStyle.top,
            left: tooltipStyle.left,
            transform: tooltipStyle.transform,
          }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          data-lenis-prevent
          onClick={(e) => e.stopPropagation()}
        >
          <div className="admin-guide-tooltip-header">
            <span className="admin-guide-step-badge">
              Step {stepIndex + 1} of {steps.length}
            </span>
            <div className="admin-guide-progress">
              {steps.map((_, i) => (
                <div key={i} className={`admin-guide-dot ${i === stepIndex ? 'active' : i < stepIndex ? 'completed' : ''}`} />
              ))}
            </div>
          </div>
          <h3 id="admin-guide-title">{step.title}</h3>
          <p>{step.body}</p>
          <div className="admin-guide-actions">
            <button type="button" className="admin-guide-btn admin-guide-btn--skip" onClick={onClose}>
              Skip tour
            </button>
            <div className="admin-guide-actions-left">
              {!isFirst && (
                <button type="button" className="admin-guide-btn admin-guide-btn--ghost" onClick={goBack}>
                  Back
                </button>
              )}
              <button type="button" className="admin-guide-btn admin-guide-btn--primary" onClick={goNext}>
                {isLast ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

export default AdminGuideWalkthrough
