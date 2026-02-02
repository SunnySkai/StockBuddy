import type { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import LoadingScreen from './LoadingScreen'
import { useSession } from '../context/SessionContext'

type ProtectedRouteProps = {
  children: ReactElement
  requireOrganization?: boolean
  blockIfHasOrganization?: boolean
}

const ProtectedRoute = ({
  children,
  requireOrganization = false,
  blockIfHasOrganization = false
}: ProtectedRouteProps) => {
  const location = useLocation()
  const { status, hasOrganization } = useSession()

  if (status === 'checking') {
    return <LoadingScreen />
  }

  if (status !== 'authenticated') {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  if (requireOrganization && !hasOrganization) {
    return <Navigate to="/onboarding" replace />
  }

  if (blockIfHasOrganization && hasOrganization) {
    return <Navigate to="/" replace />
  }

  return children
}

export default ProtectedRoute
