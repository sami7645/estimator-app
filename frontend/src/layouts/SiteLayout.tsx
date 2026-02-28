import React, { useState, useRef, useEffect } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  User,
  Plus,
  Compass,
  ArrowLeft,
  Eye,
  Users,
  Database,
  CreditCard,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fetchPlanSet } from '../api'
import './SiteLayout.css'

const NAV_LINKS = [
  { sectionId: 'how-it-works', label: 'How It Works' },
  { sectionId: 'trades', label: 'Trades' },
  { sectionId: 'why', label: 'Why Us?' },
  { sectionId: 'resources', label: 'Resources' },
  { sectionId: 'pricing', label: 'Pricing' },
  { sectionId: 'contact', label: 'Contact' },
]

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

export default function SiteLayout() {
  const { isAuthenticated, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [planSetName, setPlanSetName] = useState<string | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const isHome = location.pathname === '/'
  const isDesigner = location.pathname.startsWith('/designer')
  const isDesignerViewer =
    location.pathname.startsWith('/designer/plan-set/') &&
    location.pathname.endsWith('/view')
  const isDesignerPlanSet =
    location.pathname.startsWith('/designer/plan-set/') && !isDesignerViewer
  const planSetMatch = location.pathname.match(/^\/designer\/plan-set\/(\d+)/)
  const currentPlanSetId = planSetMatch ? planSetMatch[1] : null
  const isDesignerShell = isDesigner && !isDesignerViewer

  useEffect(() => {
    if (isDesignerPlanSet && currentPlanSetId) {
      const planSetId = parseInt(currentPlanSetId, 10)
      if (!Number.isNaN(planSetId)) {
        void fetchPlanSet(planSetId).then((planSet) => {
          setPlanSetName(planSet.name)
        }).catch(() => {
          setPlanSetName(null)
        })
      }
    } else {
      setPlanSetName(null)
    }
  }, [isDesignerPlanSet, currentPlanSetId])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [profileMenuOpen])

  const handleNavClick = (sectionId: string) => {
    setMobileMenuOpen(false)
    if (isHome) {
      scrollToSection(sectionId)
    } else {
      navigate({ pathname: '/', hash: sectionId })
    }
  }

  const handleLogout = async () => {
    await logout()
    setMobileMenuOpen(false)
    setProfileMenuOpen(false)
    navigate('/')
  }

  const goDesigner = () => {
    setMobileMenuOpen(false)
    setProfileMenuOpen(false)
    navigate('/designer')
  }

  const goDesignerWithHash = (hash: string) => {
    setMobileMenuOpen(false)
    setProfileMenuOpen(false)
    navigate({ pathname: '/designer', hash })
  }

  const closeProfileMenu = () => setProfileMenuOpen(false)

  return (
    <div className={`site-layout ${isDesignerShell ? 'site-layout-designer' : ''}`}>
      {!isDesignerViewer && (
        <div className="site-header-wrap">
          <header className="site-header">
            <div className="site-header-left">
              <Link to="/" className="site-logo" onClick={() => setMobileMenuOpen(false)}>
                <span className="site-logo-icon" aria-hidden>
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <rect width="32" height="32" rx="6" fill="url(#logo-gradient)" />
                    <path
                      d="M8 12h16M8 16h12M8 20h14"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient
                        id="logo-gradient"
                        x1="0"
                        y1="0"
                        x2="32"
                        y2="32"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop stopColor="#6366f1" />
                        <stop offset="1" stopColor="#4338ca" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
                <span className="site-logo-text">
                  Estimator<span className="site-logo-dot">.ai</span>
                </span>
              </Link>
              {planSetName && (
                <span className="site-header-project-name">{planSetName}</span>
              )}
            </div>

            <div className="site-nav-center">
              {!isDesigner && (
                <nav className={`site-nav ${mobileMenuOpen ? 'open' : ''}`}>
                  {NAV_LINKS.map(({ sectionId, label }) => (
                    <button
                      key={sectionId}
                      type="button"
                      className="site-nav-link"
                      onClick={() => handleNavClick(sectionId)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
              )}
            </div>

            <div className="site-header-right" ref={profileRef}>
              {isAuthenticated ? (
                <>
                  {isDesigner && !isDesignerViewer && (
                    <div className="site-header-designer-actions">
                      {isDesignerPlanSet ? (
                        <>
                          <button
                            type="button"
                            className="site-header-designer-btn"
                            title="Back to projects"
                            onClick={goDesigner}
                          >
                            <ArrowLeft size={16} />
                          </button>
                          {currentPlanSetId && (
                            <button
                              type="button"
                              className="site-header-designer-btn"
                              title="Open in viewer"
                              onClick={() => navigate(`/designer/plan-set/${currentPlanSetId}/view`)}
                            >
                              <Eye size={16} />
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="site-header-designer-btn"
                            title="New project"
                            onClick={() => goDesignerWithHash('#new')}
                          >
                            <Plus size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="site-profile-trigger"
                    onClick={() => setProfileMenuOpen((o) => !o)}
                    aria-label="Account menu"
                    aria-expanded={profileMenuOpen}
                  >
                    <span className="site-profile-avatar">
                      {user?.username ? user.username.charAt(0).toUpperCase() : '?'}
                    </span>
                  </button>
                  {profileMenuOpen && (
                    <div className="site-profile-dropdown">
                      <div className="site-profile-dropdown-user">Hi, {user?.username}</div>
                      <Link
                        to="/profile"
                        className="site-profile-dropdown-item"
                        onClick={closeProfileMenu}
                      >
                        <User size={18} /> Profile
                      </Link>
                      <Link
                        to="/team"
                        className="site-profile-dropdown-item"
                        onClick={closeProfileMenu}
                      >
                        <Users size={18} /> Team
                      </Link>
                      <Link
                        to="/datasets"
                        className="site-profile-dropdown-item"
                        onClick={closeProfileMenu}
                      >
                        <Database size={18} /> Datasets
                      </Link>
                      <Link
                        to="/subscribe"
                        className="site-profile-dropdown-item"
                        onClick={closeProfileMenu}
                      >
                        <CreditCard size={18} /> Subscription
                      </Link>
                      <button
                        type="button"
                        className="site-profile-dropdown-item"
                        onClick={handleLogout}
                      >
                        <LogOut size={18} /> Logout
                      </button>
                      <button
                        type="button"
                        className="site-profile-dropdown-item site-profile-dropdown-primary"
                        onClick={goDesigner}
                      >
                        <LayoutDashboard size={18} /> Open Designer
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="site-header-auth-buttons">
                  <Link to="/login" className="site-btn site-btn-ghost site-header-btn">
                    Login
                  </Link>
                  <Link to="/signup" className="site-btn site-btn-primary site-header-btn">
                    Sign up
                  </Link>
                </div>
              )}
            </div>

            <div className="site-mobile-nav-toggle">
              <button
                type="button"
                className="site-menu-toggle"
                onClick={() => setMobileMenuOpen((o) => !o)}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </header>

          {/* Mobile full menu (nav + profile options when hamburger is open) */}
          <div className={`site-mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
            {!isDesigner &&
              NAV_LINKS.map(({ sectionId, label }) => (
                <button
                  key={sectionId}
                  type="button"
                  className="site-mobile-nav-link"
                  onClick={() => handleNavClick(sectionId)}
                >
                  {label}
                </button>
              ))}
            {isAuthenticated ? (
              <>
                <Link
                  to="/profile"
                  className="site-btn site-btn-ghost site-mobile-btn"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <User size={18} /> Profile
                </Link>
                <Link
                  to="/team"
                  className="site-btn site-btn-ghost site-mobile-btn"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Users size={18} /> Team
                </Link>
                <Link
                  to="/datasets"
                  className="site-btn site-btn-ghost site-mobile-btn"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Database size={18} /> Datasets
                </Link>
                <button
                  type="button"
                  className="site-btn site-btn-ghost site-mobile-btn"
                  onClick={handleLogout}
                >
                  <LogOut size={18} /> Logout
                </button>
                <button
                  type="button"
                  className="site-btn site-btn-primary site-mobile-btn"
                  onClick={goDesigner}
                >
                  <LayoutDashboard size={18} /> Open Designer
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="site-btn site-btn-ghost site-mobile-btn"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="site-btn site-btn-primary site-mobile-btn"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Try Now
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      <main className="site-main">
        <Outlet />
      </main>

      {!isDesigner && !isDesignerViewer && (
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div className="site-footer-brand">
              <span className="site-logo-text">
                Estimator<span className="site-logo-dot">.ai</span>
              </span>
              <p>Professional takeoff and estimation for construction plans.</p>
            </div>
            <div className="site-footer-links">
              <Link to="/#how-it-works">How It Works</Link>
              <Link to="/#pricing">Pricing</Link>
              <Link to="/#contact">Contact</Link>
              <Link to="/profile">Profile</Link>
              <Link to="/designer">Designer</Link>
            </div>
            <div className="site-footer-copy">
              © {new Date().getFullYear()} Estimator.ai. All rights reserved.
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
