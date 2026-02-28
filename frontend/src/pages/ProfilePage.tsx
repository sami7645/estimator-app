import React, { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Lock, FolderKanban, ArrowRight, Mail, Users, Database, CreditCard } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fetchMyProjects, authChangePassword, fetchMyMessages, fetchSubscription } from '../api'
import type { Project, ContactMessage, Subscription } from '../api'
import './ProfilePage.css'

export default function ProfilePage() {
  const { isAuthenticated, user, token } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)
  const [subscription, setSubscription] = useState<Subscription | null>(null)

  useEffect(() => {
    if (!token) {
      setLoadingProjects(false)
      setLoadingMessages(false)
      return
    }
    fetchMyProjects(token)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false))
    fetchMyMessages(token)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false))
    fetchSubscription(token)
      .then(setSubscription)
      .catch(() => {})
  }, [token])

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (!token) return
    setChangingPassword(true)
    try {
      await authChangePassword(token, {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setPasswordSuccess('Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError((err as Error).message)
    } finally {
      setChangingPassword(false)
    }
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="profile-page">
      <motion.div
        className="profile-inner"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="profile-page-title">Account</h1>

        <section className="profile-section">
          <h2 className="profile-section-title">
            <User size={20} /> Profile
          </h2>
          <div className="profile-info">
            <div className="profile-info-row">
              <span className="profile-info-label">Username</span>
              <span className="profile-info-value">{user?.username}</span>
            </div>
            <div className="profile-info-row">
              <span className="profile-info-label">Email</span>
              <span className="profile-info-value">{user?.email || '—'}</span>
            </div>
          </div>
        </section>

        {/* Quick links */}
        <div className="profile-quick-links">
          <Link to="/subscribe" className="profile-quick-link">
            <CreditCard size={20} />
            <div>
              <strong>Subscription</strong>
              <span>{subscription ? (subscription.plan === 'pro' ? 'Pro Plan' : subscription.plan === 'business' ? 'Business Plan' : 'Free Plan') : 'No plan'}</span>
            </div>
            <ArrowRight size={16} />
          </Link>
          <Link to="/team" className="profile-quick-link">
            <Users size={20} />
            <div>
              <strong>Team</strong>
              <span>{subscription?.team_members?.length ?? 0} member{(subscription?.team_members?.length ?? 0) !== 1 ? 's' : ''}</span>
            </div>
            <ArrowRight size={16} />
          </Link>
          <Link to="/datasets" className="profile-quick-link">
            <Database size={20} />
            <div>
              <strong>ML Datasets</strong>
              <span>Manage training data</span>
            </div>
            <ArrowRight size={16} />
          </Link>
        </div>

        <section className="profile-section">
          <h2 className="profile-section-title">
            <FolderKanban size={20} /> My projects
          </h2>
          {loadingProjects ? (
            <p className="profile-muted">Loading…</p>
          ) : projects.length === 0 ? (
            <div className="profile-empty">
              <p className="profile-muted">You don&apos;t have any projects yet. Create one from the Designer.</p>
              <Link to="/designer" className="site-btn site-btn-ghost profile-cta">
                Open Designer <ArrowRight size={18} />
              </Link>
            </div>
          ) : (
            <ul className="profile-projects-list">
              {projects.map((p) => (
                <li key={p.id} className="profile-project-item">
                  <span className="profile-project-name">{p.name}</span>
                  <Link to="/designer" className="profile-project-link">
                    Open in Designer <ArrowRight size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="profile-section">
          <h2 className="profile-section-title">
            <Mail size={20} /> Contact replies
          </h2>
          {loadingMessages ? (
            <p className="profile-muted">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="profile-muted">No contact messages yet. Replies from support will appear here.</p>
          ) : (
            <ul className="profile-messages-list">
              {messages.map((m) => (
                <li key={m.id} className="profile-message-item">
                  <div className="profile-message-meta">
                    <span className="profile-message-date">
                      {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="profile-message-text">{m.message}</p>
                  {m.reply ? (
                    <div className="profile-message-reply">
                      <strong>Reply:</strong> {m.reply}
                      {m.replied_at && (
                        <span className="profile-message-replied-at">
                          {' '}({new Date(m.replied_at).toLocaleDateString()})
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="profile-muted profile-message-pending">No reply yet.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="profile-section">
          <h2 className="profile-section-title">
            <Lock size={20} /> Change password
          </h2>
          <form onSubmit={handleChangePassword} className="profile-form">
            {passwordError && <div className="profile-error">{passwordError}</div>}
            {passwordSuccess && <div className="profile-success">{passwordSuccess}</div>}
            <div className="form-row">
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Your current password"
                required
                autoComplete="current-password"
              />
            </div>
            <div className="form-row">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="form-row">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="site-btn site-btn-primary" disabled={changingPassword}>
              {changingPassword ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>
      </motion.div>
    </div>
  )
}
