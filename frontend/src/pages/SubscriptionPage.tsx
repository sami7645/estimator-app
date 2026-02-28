import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Check, CreditCard, Lock, SkipForward, Mail, Star, Zap, Building2,
  Users, Database, Shield, CalendarDays, AlertTriangle, ArrowRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  fetchSubscription,
  createSubscription,
  skipSubscription,
  cancelSubscription,
  type Subscription,
} from '../api'
import './SubscriptionPage.css'

const PLANS = [
  {
    id: 'free',
    name: 'Starter',
    price: '$0',
    period: '/month',
    features: [
      '1 project',
      '5 plan pages',
      'Basic annotations',
      'Excel export',
    ],
    icon: Star,
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    period: '/month',
    features: [
      'Unlimited projects',
      'Unlimited pages',
      'ML auto-detection',
      'Team sharing (3 users)',
      'Priority support',
      'All exports (PDF + Excel)',
      'Per-trade datasets',
    ],
    icon: Zap,
    highlight: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: '$149',
    period: '/month',
    features: [
      'Everything in Pro',
      'Team seats (50 users)',
      'Higher upload limits',
      'Advanced ML training',
    ],
    icon: Building2,
    highlight: false,
  },
]

type PageView = 'loading' | 'manage' | 'plan' | 'payment' | 'success'

export default function SubscriptionPage() {
  const { token, refreshUser, isSubscribed, subscriptionPlan } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [view, setView] = useState<PageView>('loading')
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [selectedPlan, setSelectedPlan] = useState('pro')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [nameOnCard, setNameOnCard] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cancelConfirm, setCancelConfirm] = useState(false)

  const loadSubscription = useCallback(async (preserveView = false) => {
    if (!token) { setView('plan'); return }
    try {
      const sub = await fetchSubscription(token)
      setSubscription(sub)
      if (!preserveView) {
        const hasActivePaid = sub.status === 'active' && sub.plan !== 'free'
        setView(hasActivePaid ? 'manage' : 'plan')
      }
    } catch {
      if (!preserveView) {
        setView('plan')
      }
    }
  }, [token])

  useEffect(() => { loadSubscription() }, [loadSubscription])

  // Reload subscription when navigating to this page (e.g., after subscribing and redirecting back)
  useEffect(() => {
    if (token && location.pathname === '/subscribe') {
      loadSubscription()
    }
  }, [location.pathname, token, loadSubscription])

  // Reload subscription when switching to 'manage' view to ensure fresh data
  useEffect(() => {
    if (view === 'manage' && token) {
      loadSubscription(true) // Preserve view, just refresh data
    }
  }, [view, token, loadSubscription])

  const formatCardNumber = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
  }

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    if (digits.length >= 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return digits
  }

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setLoading(true)
    setError('')
    try {
      await createSubscription(token, selectedPlan)
      await refreshUser()
      await loadSubscription() // Reload subscription data to get latest status
      setView('success')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSkip() {
    if (!token) return
    setLoading(true)
    try {
      await skipSubscription(token, selectedPlan)
      await refreshUser()
      await loadSubscription() // Reload subscription data to get latest status
      setView('success')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!token) return
    setLoading(true)
    try {
      await cancelSubscription(token)
      await refreshUser()
      await loadSubscription()
      setCancelConfirm(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function planLabel(plan: string) {
    if (plan === 'pro') return 'Pro'
    if (plan === 'business') return 'Business'
    return 'Starter'
  }

  // ─── Loading ───
  if (view === 'loading') {
    return (
      <div className="subscribe-page">
        <div className="subscribe-loading">Loading subscription...</div>
      </div>
    )
  }

  // ─── Success ───
  if (view === 'success') {
    return (
      <div className="subscribe-page">
        <motion.div
          className="subscribe-success"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="subscribe-success-icon">
            <Check size={48} />
          </div>
          <h1>You're all set!</h1>
          <p>Your {planLabel(selectedPlan)} plan is now active.</p>
          <div className="subscribe-success-actions">
            <button className="site-btn site-btn-primary" onClick={() => navigate('/team')}>
              Invite Team Members
            </button>
            <button className="site-btn site-btn-ghost" onClick={async () => {
              await loadSubscription()
              setView('manage')
            }}>
              Manage Subscription
            </button>
            <button className="site-btn site-btn-ghost" onClick={() => navigate('/designer')}>
              Go to Designer
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // ─── Manage Subscription (already subscribed) ───
  if (view === 'manage' && subscription) {
    const teamCount = subscription.team_members?.length ?? 0
    // Calculate max_team_members based on plan (in case DB value is outdated)
    const maxTeamMembers = subscription.plan === 'business' ? 50 : subscription.plan === 'pro' ? 3 : 3
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null

    return (
      <div className="subscribe-page">
        <motion.div
          className="subscribe-inner"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="subscribe-header">
            <h1>Manage Subscription</h1>
            <p className="subscribe-subtitle">Your current plan and billing details.</p>
          </div>

          {/* Current plan card */}
          <div className="manage-plan-card">
            <div className="manage-plan-header">
              <div className="manage-plan-icon">
                {subscription.plan === 'pro' ? <Zap size={28} /> : <Building2 size={28} />}
              </div>
              <div className="manage-plan-info">
                <h2>{planLabel(subscription.plan)} Plan</h2>
                <span className={`manage-status-badge ${subscription.status}`}>
                  {subscription.status === 'active' ? 'Active' : subscription.status === 'cancelled' ? 'Cancelled' : subscription.status}
                </span>
              </div>
              <div className="manage-plan-price">
                <span className="manage-price-amount">
                  {subscription.plan === 'pro' ? '$49' : subscription.plan === 'business' ? '$149' : '$0'}
                </span>
                <span className="manage-price-period">/month</span>
              </div>
            </div>

            {periodEnd && (
              <div className="manage-plan-detail">
                <CalendarDays size={16} />
                <span>
                  {subscription.status === 'cancelled'
                    ? `Access until ${periodEnd}`
                    : `Next billing date: ${periodEnd}`
                  }
                </span>
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="manage-links-grid">
            <Link to="/team" className="manage-link-card">
              <Users size={22} />
              <div>
                <strong>Team Members</strong>
                <span>{teamCount} / {maxTeamMembers} members</span>
              </div>
              <ArrowRight size={16} />
            </Link>
            <Link to="/datasets" className="manage-link-card">
              <Database size={22} />
              <div>
                <strong>ML Datasets</strong>
                <span>Manage training data</span>
              </div>
              <ArrowRight size={16} />
            </Link>
            <Link to="/designer" className="manage-link-card">
              <Zap size={22} />
              <div>
                <strong>Designer</strong>
                <span>Open project workspace</span>
              </div>
              <ArrowRight size={16} />
            </Link>
          </div>

          {/* Email notice */}
          <div className="manage-email-notice">
            <Mail size={16} />
            <span>Email receipts & invoices</span>
            <span className="subscribe-coming-soon">Coming Soon</span>
          </div>

          {/* Plan features */}
          <div className="manage-features-card">
            <h3>Your plan includes</h3>
            <ul className="manage-features-list">
              {(PLANS.find(p => p.id === subscription.plan) ?? PLANS[1]).features.map(f => (
                <li key={f}><Check size={16} /> {f}</li>
              ))}
            </ul>
          </div>

          {error && <div className="subscribe-error">{error}</div>}

          {/* Actions */}
          <div className="manage-actions">
            {subscription.status === 'active' && (
              <>
                {subscription.plan === 'pro' && (
                  <button
                    className="site-btn site-btn-ghost"
                    onClick={() => {
                      setSelectedPlan('business')
                      setView('payment')
                    }}
                  >
                    Upgrade to Business
                  </button>
                )}
                {!cancelConfirm ? (
                  <button
                    className="site-btn manage-cancel-btn"
                    onClick={() => setCancelConfirm(true)}
                  >
                    Cancel Subscription
                  </button>
                ) : (
                  <div className="manage-cancel-confirm">
                    <AlertTriangle size={18} />
                    <span>Are you sure? You'll lose access at the end of your billing period.</span>
                    <div className="manage-cancel-btns">
                      <button
                        className="site-btn site-btn-primary"
                        onClick={handleCancel}
                        disabled={loading}
                      >
                        {loading ? 'Cancelling…' : 'Yes, cancel'}
                      </button>
                      <button
                        className="site-btn site-btn-ghost"
                        onClick={() => setCancelConfirm(false)}
                      >
                        Keep plan
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {subscription.status === 'cancelled' && (
              <button
                className="site-btn site-btn-primary"
                onClick={() => {
                  setSelectedPlan(subscription.plan)
                  setView('payment')
                }}
              >
                Resubscribe
              </button>
            )}
          </div>
        </motion.div>
      </div>
    )
  }

  // ─── Payment step ───
  if (view === 'payment') {
    return (
      <div className="subscribe-page">
        <motion.div
          className="subscribe-inner"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="subscribe-header">
            <h1>Payment Details</h1>
            <p className="subscribe-subtitle">
              {selectedPlan === 'pro' ? 'Pro plan — $49/month' : selectedPlan === 'business' ? 'Business plan — $149/month' : 'Starter plan — Free'}
            </p>
          </div>

          <div className="subscribe-card-wrap">
            <div className="subscribe-form-card">
              <div className="subscribe-form-header">
                <CreditCard size={22} />
                <span>Payment method</span>
                <span className="subscribe-secure">
                  <Lock size={14} /> Secure
                </span>
              </div>

              <form onSubmit={handleSubscribe} className="subscribe-form">
                {error && <div className="subscribe-error">{error}</div>}

                <div className="subscribe-form-row">
                  <label htmlFor="sub-name">Name on card</label>
                  <input id="sub-name" type="text" value={nameOnCard}
                    onChange={(e) => setNameOnCard(e.target.value)} placeholder="John Doe" autoComplete="cc-name" />
                </div>
                <div className="subscribe-form-row">
                  <label htmlFor="sub-number">Card number</label>
                  <input id="sub-number" type="text" value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="4242 4242 4242 4242" maxLength={19} autoComplete="cc-number" />
                </div>
                <div className="subscribe-form-row-group">
                  <div className="subscribe-form-row">
                    <label htmlFor="sub-expiry">Expiry</label>
                    <input id="sub-expiry" type="text" value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      placeholder="MM/YY" maxLength={5} autoComplete="cc-exp" />
                  </div>
                  <div className="subscribe-form-row">
                    <label htmlFor="sub-cvc">CVC</label>
                    <input id="sub-cvc" type="text" value={cvc}
                      onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="123" maxLength={4} autoComplete="cc-csc" />
                  </div>
                </div>

                <div className="subscribe-email-notice">
                  <Mail size={16} />
                  <span>Email confirmation</span>
                  <span className="subscribe-coming-soon">Coming Soon</span>
                </div>

                <div className="subscribe-actions">
                  <button type="submit" className="site-btn site-btn-primary subscribe-submit" disabled={loading}>
                    {loading ? 'Processing…' : `Subscribe — ${selectedPlan === 'pro' ? '$49/mo' : selectedPlan === 'business' ? '$149/mo' : 'Free'}`}
                  </button>
                  <button type="button" className="site-btn site-btn-ghost subscribe-skip" onClick={handleSkip} disabled={loading}>
                    <SkipForward size={18} /> Skip for now
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="subscribe-back-row">
            <button className="site-btn site-btn-ghost" onClick={() => setView('plan')}>
              &larr; Back to plans
            </button>
          </div>

          <p className="subscribe-note">
            By subscribing you agree to our terms. Cancel anytime from your account.
            Skip to simulate a successful subscription for testing.
          </p>
        </motion.div>
      </div>
    )
  }

  // ─── Plan selection (default / not subscribed) ───
  return (
    <div className="subscribe-page">
      <motion.div
        className="subscribe-inner subscribe-inner-wide"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="subscribe-header">
          <h1>Choose Your Plan</h1>
          <p className="subscribe-subtitle">
            Start free and upgrade as you grow. Cancel anytime.
          </p>
        </div>

        <div className="subscribe-plans-grid">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`subscribe-plan-card ${plan.highlight ? 'highlighted' : ''} ${selectedPlan === plan.id ? 'selected' : ''}`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              {plan.highlight && <div className="subscribe-plan-badge">Most Popular</div>}
              <div className="subscribe-plan-icon"><plan.icon size={28} /></div>
              <h3>{plan.name}</h3>
              <div className="subscribe-plan-price">
                <span className="subscribe-plan-amount">{plan.price}</span>
                <span className="subscribe-plan-period">{plan.period}</span>
              </div>
              <ul className="subscribe-plan-features">
                {plan.features.map((f) => (
                  <li key={f}><Check size={16} /> {f}</li>
                ))}
              </ul>
              <button
                className={`site-btn ${selectedPlan === plan.id ? 'site-btn-primary' : 'site-btn-ghost'} subscribe-plan-btn`}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedPlan(plan.id)
                  if (plan.id === 'free') {
                    handleSkip()
                  } else {
                    setView('payment')
                  }
                }}
              >
                {plan.id === 'free' ? 'Start Free' : 'Get Started'}
              </button>
            </div>
          ))}
        </div>

        <div className="subscribe-email-banner">
          <Mail size={20} />
          <span>Email notifications for billing & invoices</span>
          <span className="subscribe-coming-soon">Coming Soon</span>
        </div>
      </motion.div>
    </div>
  )
}
