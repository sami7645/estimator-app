import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function PaymentPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isSubscribed } = useAuth()

  useEffect(() => {
    if (isSubscribed) {
      navigate('/subscribe', { replace: true })
    } else if (isAuthenticated) {
      navigate('/subscribe', { replace: true })
    } else {
      navigate('/signup', { replace: true })
    }
  }, [isAuthenticated, isSubscribed, navigate])

  return null
}
