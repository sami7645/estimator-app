import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { agreeToPrivacy } from '../api'
import './PrivacyAgreementPage.css'

export default function PrivacyAgreementPage() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAgree() {
    if (!agreed || !token) return
    setLoading(true)
    setError('')
    try {
      await agreeToPrivacy(token)
      navigate('/subscribe')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="privacy-page">
      <motion.div
        className="privacy-inner"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="privacy-icon-wrap">
          <Shield size={40} />
        </div>
        <h1>Privacy Agreement</h1>
        <p className="privacy-subtitle">
          Please review and accept our privacy policy to continue.
        </p>

        <div className="privacy-content">
          <div className="privacy-scroll-box">
            <h3>Data Collection & Usage</h3>
            <p>
              We collect and process your personal data including your name, email address,
              and usage patterns to provide and improve our construction estimation services.
              Your plan data, annotations, and project files are stored securely and are
              only accessible by you and team members you authorize.
            </p>

            <h3>Data Storage & Security</h3>
            <p>
              All data is encrypted at rest and in transit. We use industry-standard security
              measures to protect your information. Your construction plans and proprietary
              data remain your property and are never shared with third parties.
            </p>

            <h3>ML Training Data</h3>
            <p>
              When you contribute to the ML dataset, your annotations may be used to improve
              detection accuracy for your account. Your data is kept separate per trade and
              is not shared across users unless you explicitly opt in.
            </p>

            <h3>Team Sharing</h3>
            <p>
              When you invite team members, they gain access to your projects based on the
              permissions you assign (view or edit). You can revoke access at any time.
              Team members' activities are logged for your reference.
            </p>

            <h3>Payment Information</h3>
            <p>
              Payment processing is handled through Stripe. We do not store your credit card
              details on our servers. Stripe's security standards comply with PCI DSS Level 1.
            </p>

            <h3>Data Retention</h3>
            <p>
              Your data is retained for as long as your account is active. Upon account
              deletion, your data will be permanently removed within 30 days, except as
              required by law.
            </p>

            <h3>Your Rights</h3>
            <p>
              You have the right to access, modify, export, or delete your personal data
              at any time. Contact our support team for data-related requests.
            </p>
          </div>

          {error && <div className="privacy-error">{error}</div>}

          <label className="privacy-checkbox-row">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I have read and agree to the Privacy Policy and Terms of Service.
            </span>
          </label>

          <button
            className="site-btn site-btn-primary privacy-submit"
            onClick={handleAgree}
            disabled={!agreed || loading}
          >
            {loading ? (
              'Processing…'
            ) : (
              <>
                <CheckCircle size={18} /> Accept & Continue
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
