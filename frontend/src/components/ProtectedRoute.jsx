import React from 'react'
import { Navigate } from 'react-router-dom'
import LoginForm from './LoginForm'

export default function ProtectedRoute({ token, onLogin, children }) {
  if (!token) {
    return <LoginForm onLogin={onLogin} />
  }
  return children
}
