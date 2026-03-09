import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Zap,
  Ruler,
  FileSpreadsheet,
  Users,
  ChevronDown,
  Check,
  ArrowRight,
  BarChart3,
  Layers,
  BookOpen,
  MessageCircle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { submitContact, fetchSubscription, type Subscription } from '../api'
import { Shield } from 'lucide-react'
import './HomePage.css'

const fadeUp = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } }
const stagger = { initial: {}, whileInView: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }

export default function HomePage() {
  const location = useLocation()
  const { token, isAuthenticated } = useAuth()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [contactSending, setContactSending] = useState(false)
  const [contactSuccess, setContactSuccess] = useState(false)
  const [contactError, setContactError] = useState('')

  // Fetch latest subscription data
  useEffect(() => {
    if (token) {
      fetchSubscription(token)
        .then(setSubscription)
        .catch(() => setSubscription(null))
    } else {
      setSubscription(null)
    }
  }, [token])

  const subscriptionPlan = subscription?.plan ?? null
  const subscriptionStatus = subscription?.status ?? null
  const isSubscribed = !!(subscription && subscription.status === 'active' && subscription.plan !== 'free')
  const isActivePro = subscriptionPlan === 'pro' && subscriptionStatus === 'active'
  const isActiveBusiness = subscriptionPlan === 'business' && subscriptionStatus === 'active'

  useEffect(() => {
    const id = location.hash.slice(1)
    if (id) {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [location.pathname, location.hash])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="home-page">
      {/* Hero */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-image-wrap">
          <img
            src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1920&q=90"
            alt=""
            width={1920}
            height={1080}
            loading="eager"
          />
        </div>
        <div className="hero-orbs" aria-hidden>
          <span className="hero-orb hero-orb-1" />
          <span className="hero-orb hero-orb-2" />
          <span className="hero-orb hero-orb-3" />
        </div>
        <div className="hero-pattern" aria-hidden />
        <motion.div
          className="hero-inner"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.span
            className="hero-badge"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Free to start · No credit card
          </motion.span>
          <h1 className="hero-title">
            Takeoff & estimation,
            <br />
            <span className="hero-title-accent">done right.</span>
          </h1>
          <p className="hero-subtitle">
            Upload plans, define counts, and export to Excel. Built for estimators and contractors who need speed and accuracy.
          </p>
          <div className="hero-actions">
            <Link to="/signup" className="site-btn site-btn-primary hero-cta">
              Try Now — It&apos;s Free
            </Link>
            <Link to="/designer" className="site-btn site-btn-ghost hero-secondary">
              Open Designer
            </Link>
          </div>
          <div className="hero-features">
            <span><Check size={16} /> PDF upload</span>
            <span><Check size={16} /> Scale calibration</span>
            <span><Check size={16} /> Export to Excel</span>
          </div>
          <motion.div
            className="hero-scroll"
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            onClick={() => scrollTo('pricing')}
            onKeyDown={(e) => e.key === 'Enter' && scrollTo('pricing')}
            role="button"
            tabIndex={0}
            aria-label="Scroll down"
          >
            <ChevronDown size={24} />
          </motion.div>
        </motion.div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="section section-alt">
        <div className="section-inner">
          <motion.h2 className="section-title" {...fadeUp}>
            Pricing
          </motion.h2>
          <motion.p className="section-lead" {...fadeUp}>
            {isSubscribed ? 'You\'re on a premium plan.' : 'Simple plans. No hidden fees.'}
          </motion.p>

          {isSubscribed && (
            <motion.div className="pricing-active-banner" {...fadeUp}>
              <Shield size={20} />
              <span>
                You're currently on the <strong>{isActiveBusiness ? 'Business' : isActivePro ? 'Pro' : 'Starter'}</strong> plan.
              </span>
              <Link to="/subscribe" className="site-btn site-btn-primary pricing-manage-btn">
                Manage Subscription
              </Link>
            </motion.div>
          )}

          <motion.div className="pricing-grid pricing-grid-4" variants={stagger} initial="initial" whileInView="whileInView" viewport={{ once: true }}>
            {/* Demo */}
            <motion.div className={`pricing-card ${(!isSubscribed || subscriptionPlan === 'free' || subscriptionPlan === null) ? 'pricing-card-current' : ''}`} variants={fadeUp}>
              <h3>Demo</h3>
              <div className="pricing-price">
                <span className="pricing-amount">$0</span>
                <span className="pricing-period">/month</span>
              </div>
              <p className="pricing-desc">Try the designer with sample projects. No credit card required.</p>
              <ul className="pricing-features">
                <li><Check size={18} /> Up to 3 projects</li>
                <li><Check size={18} /> PDF upload & viewing</li>
                <li><Check size={18} /> Count definitions & export</li>
              </ul>
              {isAuthenticated ? (
                <Link to="/subscribe" className="site-btn site-btn-ghost pricing-btn">
                  {(!isSubscribed || subscriptionPlan === 'free' || subscriptionPlan === null) ? 'Current Plan' : 'Manage Plan'}
                </Link>
              ) : (
                <Link to="/signup" className="site-btn site-btn-ghost pricing-btn">Get started free</Link>
              )}
            </motion.div>

            {/* Starter */}
            <motion.div className={`pricing-card ${subscriptionPlan === 'starter' && subscriptionStatus === 'active' ? 'pricing-card-current' : ''}`} variants={fadeUp}>
              <h3>Starter</h3>
              <div className="pricing-price">
                <span className="pricing-amount">$75</span>
                <span className="pricing-period">/month</span>
              </div>
              <p className="pricing-desc">For individuals who need full access and unlimited projects.</p>
              <ul className="pricing-features">
                <li><Check size={18} /> Unlimited projects</li>
                <li><Check size={18} /> All Demo features</li>
                <li><Check size={18} /> Priority support</li>
                <li><Check size={18} /> 1 user</li>
              </ul>
              {isAuthenticated ? (
                <Link to="/subscribe" className="site-btn site-btn-ghost pricing-btn">
                  Manage Plan
                </Link>
              ) : (
                <Link to="/signup" className="site-btn site-btn-ghost pricing-btn">
                  Choose Starter
                </Link>
              )}
            </motion.div>

            {/* Pro */}
            <motion.div className={`pricing-card ${isActivePro ? 'pricing-card-current' : ''}`} variants={fadeUp}>
              {isActivePro
                ? <span className="pricing-badge pricing-badge-active">Your Plan</span>
                : <span className="pricing-badge">Popular</span>
              }
              <h3>Pro</h3>
              <div className="pricing-price">
                <span className="pricing-amount">$150</span>
                <span className="pricing-period">/month</span>
              </div>
              <p className="pricing-desc">For teams that need collaboration and ML auto-detection.</p>
              <ul className="pricing-features">
                <li><Check size={18} /> Everything in Starter</li>
                <li><Check size={18} /> ML auto-detection</li>
                <li><Check size={18} /> Team seats (5 users)</li>
                <li><Check size={18} /> Advanced reporting</li>
              </ul>
              {isAuthenticated ? (
                <Link to="/subscribe" className="site-btn site-btn-ghost pricing-btn">
                  Manage Plan
                </Link>
              ) : (
                <Link to="/signup" className="site-btn site-btn-primary pricing-btn">
                  Choose Pro <ArrowRight size={18} />
                </Link>
              )}
            </motion.div>

            {/* Business */}
            <motion.div className={`pricing-card ${isActiveBusiness ? 'pricing-card-current' : ''}`} variants={fadeUp}>
              {isActiveBusiness
                ? <span className="pricing-badge pricing-badge-active">Your Plan</span>
                : null
              }
              <h3>Business</h3>
              <div className="pricing-price">
                <span className="pricing-amount">$250</span>
                <span className="pricing-period">/month</span>
              </div>
              <p className="pricing-desc">For larger teams that need more users and higher upload limits.</p>
              <ul className="pricing-features">
                <li><Check size={18} /> Everything in Pro</li>
                <li><Check size={18} /> Team seats (50 users)</li>
                <li><Check size={18} /> Higher upload limits</li>
                <li><Check size={18} /> Advanced ML training</li>
              </ul>
              {isAuthenticated ? (
                <Link to="/subscribe" className="site-btn site-btn-ghost pricing-btn">
                  Manage Plan
                </Link>
              ) : (
                <Link to="/signup" className="site-btn site-btn-ghost pricing-btn">Get started</Link>
              )}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="section">
        <div className="section-inner">
          <motion.h2 className="section-title" {...fadeUp}>
            How It Works
          </motion.h2>
          <motion.p className="section-lead" {...fadeUp}>
            Three steps from plans to counts.
          </motion.p>
          <motion.div className="how-grid" variants={stagger} initial="initial" whileInView="whileInView" viewport={{ once: true }}>
            <motion.div className="how-card" variants={fadeUp}>
              <div className="how-card-image">
                <img src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=85" alt="" width={800} height={500} />
              </div>
              <div className="how-card-icon">
                <Layers size={28} />
              </div>
              <h3>Upload plans</h3>
              <p>Create a project, upload your PDF plans. We render each page as an image so you can annotate and count.</p>
            </motion.div>
            <motion.div className="how-card" variants={fadeUp}>
              <div className="how-card-image">
                <img src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=85" alt="" width={800} height={500} />
              </div>
              <div className="how-card-icon">
                <Ruler size={28} />
              </div>
              <h3>Define & draw</h3>
              <p>Add count definitions (area, linear feet, each). Draw on the plan with scale calibration. See totals update live.</p>
            </motion.div>
            <motion.div className="how-card" variants={fadeUp}>
              <div className="how-card-image">
                <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=85" alt="" width={800} height={500} />
              </div>
              <div className="how-card-icon">
                <FileSpreadsheet size={28} />
              </div>
              <h3>Export</h3>
              <p>Export counts to Excel with one click. Use the data in your bids and reports.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Trades */}
      <section id="trades" className="section">
        <div className="section-inner">
          <motion.h2 className="section-title" {...fadeUp}>
            Trades
          </motion.h2>
          <motion.p className="section-lead" {...fadeUp}>
            Built for the trades you work in.
          </motion.p>
          <motion.div className="trades-grid" variants={stagger} initial="initial" whileInView="whileInView" viewport={{ once: true }}>
            {['Electrical', 'Plumbing', 'Mechanical', 'Acoustic', 'General', 'Traditional ADU', 'Remodel'].map((trade, i) => (
              <motion.div key={trade} className="trade-card" variants={fadeUp}>
                <span className="trade-badge">{trade}</span>
                <p>Define count types and colors per trade. Filter and export by trade.</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Why Us */}
      <section id="why" className="section section-alt">
        <div className="section-inner">
          <motion.h2 className="section-title" {...fadeUp}>
            Why Estimator.ai?
          </motion.h2>
          <motion.p className="section-lead" {...fadeUp}>
            Trusted by teams who need accuracy and speed.
          </motion.p>
          <motion.div className="why-grid" variants={stagger} initial="initial" whileInView="whileInView" viewport={{ once: true }}>
            <motion.div className="why-card" variants={fadeUp}>
              <Zap size={24} className="why-icon" />
              <h3>Fast takeoffs</h3>
              <p>Spend less time on manual counting. Scale calibration and area/perimeter math handled for you.</p>
            </motion.div>
            <motion.div className="why-card" variants={fadeUp}>
              <BarChart3 size={24} className="why-icon" />
              <h3>Excel-ready</h3>
              <p>Export to Excel with one click. No copy-paste. Use in your existing bid workflow.</p>
            </motion.div>
            <motion.div className="why-card" variants={fadeUp}>
              <Users size={24} className="why-icon" />
              <h3>Team-friendly</h3>
              <p>Organize by project and plan set. Clear counts and definitions so everyone stays aligned.</p>
            </motion.div>
          </motion.div>
          {/* People & teams - high-res imagery */}
          <motion.div className="people-section" variants={stagger} initial="initial" whileInView="whileInView" viewport={{ once: true }}>
            <h3 className="people-section-title">Teams that ship on time</h3>
            <p className="people-section-lead">Thousands of estimators and contractors use Estimator every day.</p>
            <div className="people-grid">
              <motion.div className="people-grid-item" variants={fadeUp}>
                <img src="https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=1200&q=85" alt="Team collaboration" width={1200} height={800} />
                <span>Collaboration</span>
              </motion.div>
              <motion.div className="people-grid-item" variants={fadeUp}>
                <img src="https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=85" alt="Office workspace" width={1200} height={800} />
                <span>Workspace</span>
              </motion.div>
              <motion.div className="people-grid-item" variants={fadeUp}>
                <img src="https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&q=85" alt="Professional" width={1200} height={800} />
                <span>Professional</span>
              </motion.div>
              <motion.div className="people-grid-item people-grid-item-wide" variants={fadeUp}>
                <img src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1920&q=85" alt="Team meeting" width={1920} height={1080} />
                <span>Real teams, real results</span>
              </motion.div>
            </div>
          </motion.div>

          {/* Google Reviews */}
          <motion.div className="google-reviews-section" {...fadeUp}>
            <h3 className="google-reviews-title">What our customers say</h3>
            <p className="google-reviews-lead">See real reviews from estimators and contractors.</p>
            <a
              href="TODO_GOOGLE_REVIEW_LINK"
              target="_blank"
              rel="noopener noreferrer"
              className="site-btn site-btn-primary google-reviews-btn"
            >
              Read Our Google Reviews <ArrowRight size={18} />
            </a>
          </motion.div>
        </div>
      </section>

      {/* Resources */}
      <section id="resources" className="section">
        <div className="section-inner">
          <motion.h2 className="section-title" {...fadeUp}>
            Resources
          </motion.h2>
          <motion.p className="section-lead" {...fadeUp}>
            Learn and get the most out of Estimator.ai.
          </motion.p>
          <motion.div className="resources-grid" variants={stagger} initial="initial" whileInView="whileInView" viewport={{ once: true }}>
            <motion.a href="#" className="resource-card" variants={fadeUp}>
              <BookOpen size={24} />
              <h3>Documentation</h3>
              <p>Guides for projects, plan sets, and count definitions.</p>
            </motion.a>
            <motion.a href="#" className="resource-card" variants={fadeUp}>
              <Zap size={24} />
              <h3>Quick start</h3>
              <p>Get from upload to export in under 5 minutes.</p>
            </motion.a>
            <motion.a href="#" className="resource-card" variants={fadeUp}>
              <MessageCircle size={24} />
              <h3>Support</h3>
              <p>Contact us for help or feature requests.</p>
            </motion.a>
          </motion.div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="section">
        <div className="section-inner section-inner-narrow">
          <motion.h2 className="section-title" {...fadeUp}>
            Contact
          </motion.h2>
          <motion.p className="section-lead" {...fadeUp}>
            Questions? We&apos;d love to hear from you.
          </motion.p>
          <motion.form
            className="contact-form"
            {...fadeUp}
            onSubmit={async (e) => {
              e.preventDefault()
              setContactError('')
              setContactSuccess(false)
              setContactSending(true)
              try {
                await submitContact(
                  { name: contactName, email: contactEmail, message: contactMessage },
                  token ?? undefined
                )
                setContactSuccess(true)
                setContactName('')
                setContactEmail('')
                setContactMessage('')
              } catch (err) {
                setContactError((err as Error).message)
              } finally {
                setContactSending(false)
              }
            }}
          >
            {contactError && <div className="contact-form-error">{contactError}</div>}
            {contactSuccess && (
              <div className="contact-form-success">Message sent. We&apos;ll reply to your email.</div>
            )}
            <div className="form-row">
              <label htmlFor="contact-name">Name</label>
              <input
                id="contact-name"
                type="text"
                placeholder="Your name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="contact-email">Email</label>
              <input
                id="contact-email"
                type="email"
                placeholder="you@company.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="contact-message">Message</label>
              <textarea
                id="contact-message"
                rows={4}
                placeholder="How can we help?"
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="site-btn site-btn-primary" disabled={contactSending}>
              {contactSending ? 'Sending…' : 'Send message'}
            </button>
          </motion.form>
        </div>
      </section>
    </div>
  )
}
