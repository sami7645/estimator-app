import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Database, BarChart3 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fetchDatasetStats, type DatasetStats } from '../api'
import './DatasetPage.css'

const TRADES = [
  { value: 'acoustic', label: 'Acoustic', color: '#6366f1' },
  { value: 'electrical', label: 'Electrical', color: '#f59e0b' },
  { value: 'plumbing', label: 'Plumbing', color: '#3b82f6' },
  { value: 'mechanical', label: 'Mechanical', color: '#10b981' },
  { value: 'other', label: 'Other', color: '#8b5cf6' },
]

export default function DatasetPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<DatasetStats>({})
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!token) return
    try {
      const st = await fetchDatasetStats(token)
      setStats(st)
    } catch (err) {
      console.error('Failed to load datasets:', err)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="dataset-page">
        <div className="dataset-loading">Loading datasets...</div>
      </div>
    )
  }

  return (
    <div className="dataset-page">
      <motion.div
        className="dataset-inner"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="dataset-header">
          <h1><Database size={28} /> ML Datasets</h1>
          <p className="dataset-subtitle">
            Manage training datasets per trade. More data = better auto-detection accuracy.
          </p>
        </div>

        {/* Stats overview */}
        <div className="dataset-stats-grid">
          {TRADES.map((trade) => {
            const s = stats[trade.value]
            return (
              <div key={trade.value} className="dataset-stat-card">
                <div className="dataset-stat-header" style={{ borderLeftColor: trade.color }}>
                  <span className="dataset-stat-name">{trade.label}</span>
                  <span className="dataset-stat-total">{s?.total ?? 0} items</span>
                </div>
                <div className="dataset-stat-bars">
                  <div className="dataset-stat-bar-row">
                    <span className="dataset-stat-bar-label">Items</span>
                    <span className="dataset-stat-bar-value">{s?.total ?? 0}</span>
                  </div>
                  <div className="dataset-stat-bar-row">
                    <span className="dataset-stat-bar-label">Est. accuracy</span>
                    <div className="dataset-accuracy-bar-wrap">
                      <div
                        className="dataset-accuracy-bar"
                        style={{
                          width: `${s?.estimated_accuracy ?? 0}%`,
                          backgroundColor: trade.color,
                        }}
                      />
                      <span className="dataset-accuracy-label">{s?.estimated_accuracy ?? 0}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="dataset-info-banner">
          <BarChart3 size={18} />
          <div>
            <strong>How it works:</strong> Use &quot;Add Page to Dataset&quot; from the viewer after annotating. The ML engine uses these
            examples to detect similar items on new pages. More data means better accuracy.
          </div>
        </div>

        <div className="dataset-footer-actions">
          <button
            className="site-btn site-btn-ghost"
            onClick={() => navigate('/designer')}
          >
            Go to Designer
          </button>
        </div>
      </motion.div>
    </div>
  )
}
