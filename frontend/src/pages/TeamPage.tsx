import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, UserPlus, Shield, Edit3, Eye, Trash2, Search, Mail, Crown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  fetchSubscription,
  fetchTeamMembers,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
  searchUsers,
  type Subscription,
  type TeamMember,
  type UserSearchResult,
} from '../api'
import './TeamPage.css'

export default function TeamPage() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addRole, setAddRole] = useState<'viewer' | 'editor'>('editor')
  const [adding, setAdding] = useState(false)

  const loadData = useCallback(async () => {
    if (!token) return
    try {
      const [sub, team] = await Promise.all([
        fetchSubscription(token),
        fetchTeamMembers(token).catch(() => []),
      ])
      setSubscription(sub)
      setMembers(team)
    } catch {
      setError('Failed to load team data')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!token || searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchUsers(token, searchQuery)
        const memberIds = new Set(members.map((m) => m.user_id))
        setSearchResults(results.filter((r) => !memberIds.has(r.id)))
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, token, members])

  async function handleAddMember(usernameOrEmail: string) {
    if (!token) return
    setAdding(true)
    setError('')
    setSuccess('')
    try {
      const member = await addTeamMember(token, usernameOrEmail, addRole)
      setMembers((prev) => [...prev, member])
      setSearchQuery('')
      setSearchResults([])
      setSuccess(`${member.username} added as ${addRole}`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAdding(false)
    }
  }

  async function handleUpdateRole(memberId: number, role: 'viewer' | 'editor') {
    if (!token) return
    try {
      const updated = await updateTeamMember(token, memberId, role)
      setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleRemoveMember(memberId: number, username: string) {
    if (!token) return
    if (!confirm(`Remove ${username} from your team?`)) return
    try {
      await removeTeamMember(token, memberId)
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
      setSuccess(`${username} removed from team`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (loading) {
    return (
      <div className="team-page">
        <div className="team-loading">Loading team...</div>
      </div>
    )
  }

  // Calculate max_team_members based on plan (in case DB value is outdated)
  const maxMembers = subscription?.plan === 'business' ? 50 : subscription?.plan === 'pro' ? 3 : 3
  const spotsLeft = maxMembers - members.length

  return (
    <div className="team-page">
      <motion.div
        className="team-inner"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="team-header">
          <div className="team-header-text">
            <h1><Users size={28} /> Team Management</h1>
            <p className="team-subtitle">
              Manage your team members and their access permissions.
              {subscription && (
                <span className="team-plan-badge">
                  {subscription.plan === 'pro' ? 'Pro' : subscription.plan === 'business' ? 'Business' : 'Free'} Plan
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Owner info */}
        <section className="team-section">
          <h2 className="team-section-title">
            <Crown size={18} /> Account Owner
          </h2>
          <div className="team-owner-card">
            <div className="team-member-avatar">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="team-member-info">
              <span className="team-member-name">{user?.username}</span>
              <span className="team-member-email">{user?.email || 'No email'}</span>
            </div>
            <span className="team-role-badge owner">Owner</span>
          </div>
        </section>

        {/* Add member */}
        <section className="team-section">
          <h2 className="team-section-title">
            <UserPlus size={18} /> Add Team Member
            <span className="team-spots-badge">{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>
          </h2>

          {error && <div className="team-error">{error}</div>}
          {success && <div className="team-success">{success}</div>}

          <div className="team-add-form">
            <div className="team-search-wrap">
              <Search size={16} className="team-search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username or email..."
                className="team-search-input"
                disabled={spotsLeft <= 0}
              />
              {searching && <span className="team-search-spinner" />}
            </div>

            <div className="team-role-select">
              <button
                className={`team-role-option ${addRole === 'editor' ? 'active' : ''}`}
                onClick={() => setAddRole('editor')}
              >
                <Edit3 size={14} /> Can Edit
              </button>
              <button
                className={`team-role-option ${addRole === 'viewer' ? 'active' : ''}`}
                onClick={() => setAddRole('viewer')}
              >
                <Eye size={14} /> View Only
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="team-search-results">
                {searchResults.map((r) => (
                  <div key={r.id} className="team-search-result">
                    <div className="team-member-avatar small">
                      {r.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="team-result-info">
                      <span className="team-result-name">{r.username}</span>
                      <span className="team-result-email">{r.email || 'No email'}</span>
                    </div>
                    <button
                      className="site-btn site-btn-primary team-add-btn"
                      onClick={() => handleAddMember(r.username)}
                      disabled={adding || spotsLeft <= 0}
                    >
                      <UserPlus size={14} /> Add
                    </button>
                  </div>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
              <div className="team-no-results">
                No users found matching "{searchQuery}"
              </div>
            )}

            <div className="team-email-invite">
              <Mail size={16} />
              <span>Invite by email</span>
              <span className="team-coming-soon">Coming Soon</span>
            </div>
          </div>

          {spotsLeft <= 0 && (
            <div className="team-full-notice">
              Your team is full ({maxMembers} members). Upgrade your plan for more spots.
            </div>
          )}
        </section>

        {/* Current members */}
        <section className="team-section">
          <h2 className="team-section-title">
            <Shield size={18} /> Team Members ({members.length}/{maxMembers})
          </h2>

          {members.length === 0 ? (
            <div className="team-empty">
              No team members yet. Search for users above to invite them.
            </div>
          ) : (
            <div className="team-members-list">
              {members.map((member) => (
                <div key={member.id} className="team-member-card">
                  <div className="team-member-avatar">
                    {member.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="team-member-info">
                    <span className="team-member-name">{member.username}</span>
                    <span className="team-member-email">{member.email || member.invited_email || 'No email'}</span>
                  </div>
                  <div className="team-member-actions">
                    <select
                      className="team-role-dropdown"
                      value={member.role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value as 'viewer' | 'editor')}
                    >
                      <option value="editor">Can Edit</option>
                      <option value="viewer">View Only</option>
                    </select>
                    <button
                      className="team-remove-btn"
                      onClick={() => handleRemoveMember(member.id, member.username)}
                      title="Remove member"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="team-footer-actions">
          <button
            className="site-btn site-btn-ghost"
            onClick={() => navigate('/designer')}
          >
            Go to Designer
          </button>
          <button
            className="site-btn site-btn-ghost"
            onClick={() => navigate('/profile')}
          >
            Back to Profile
          </button>
        </div>
      </motion.div>
    </div>
  )
}
