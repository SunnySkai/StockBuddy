import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './components/Home'
import PricingPage from './components/PricingPage'
import AuthPage from './pages/AuthPage'
import ProtectedRoute from './components/ProtectedRoute'
import OrganizationOnboardingPage from './pages/OrganizationOnboardingPage'
import JoinInvitationPage from './pages/JoinInvitationPage'
import MembersPage from './pages/MembersPage'
import EventsPage from './pages/EventsPage'
import InventoryPage from './pages/InventoryPage'
import VendorsPage from './pages/VendorsPage'
import BanksPage from './pages/BanksPage'
import BankDetailPage from './pages/BankDetailPage'
import VendorDetailPage from './pages/VendorDetailPage'
import CalendarPage from './pages/CalendarPage'
import OrganizationsPage from './pages/OrganizationsPage'
import TransactionsPage from './pages/TransactionsPage'
import DirectoryPage from './pages/DirectoryPage'
import { ChatbotPage } from './pages/ChatbotPage'

const App = () => {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute blockIfHasOrganization>
            <OrganizationOnboardingPage />
          </ProtectedRoute>
        }
      />
      <Route path="/join/:code" element={<JoinInvitationPage />} />
      <Route
        path="/members"
        element={
          <ProtectedRoute requireOrganization>
            <MembersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/organizations"
        element={
          <ProtectedRoute requireOrganization>
            <OrganizationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pricing"
        element={
          <ProtectedRoute requireOrganization>
            <PricingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute requireOrganization>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/events"
        element={
          <ProtectedRoute requireOrganization>
            <EventsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/directory"
        element={
          <ProtectedRoute requireOrganization>
            <DirectoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute requireOrganization>
            <InventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute requireOrganization>
            <CalendarPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendors"
        element={
          <ProtectedRoute requireOrganization>
            <VendorsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounting/banks"
        element={
          <ProtectedRoute requireOrganization>
            <BanksPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounting/banks/:bankId"
        element={
          <ProtectedRoute requireOrganization>
            <BankDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounting/transactions"
        element={
          <ProtectedRoute requireOrganization>
            <TransactionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendors/:vendorId"
        element={
          <ProtectedRoute requireOrganization>
            <VendorDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chatbot"
        element={
          <ProtectedRoute requireOrganization>
            <ChatbotPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
