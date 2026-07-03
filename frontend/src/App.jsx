import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ImageDiagnosisPage from './pages/ImageDiagnosisPage'
import AuthPage from './pages/AuthPage'
import GuidePage from './pages/GuidePage'
import FlightLogPage from './pages/FlightLogPage'
import AdminFeedbackPage from './pages/AdminFeedbackPage'
import FeedbackWidget from './components/FeedbackWidget'
import AdminCouponPage from './pages/AdminCouponPage'
import CompliancePage from './pages/CompliancePage'
import ToastContainer from './components/Toast'
import PersonalLearningBanner from './components/PersonalLearningBanner'
import Footer from './components/Footer'
import './index.css'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <ToastContainer />
        <FeedbackWidget />
        <PersonalLearningBanner />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/diagnosis" element={<Navigate to="/guide" replace />} />
          <Route path="/conversation" element={<Navigate to="/guide" replace />} />
          <Route path="/image-diagnosis" element={<ImageDiagnosisPage />} />
          <Route path="/auth" element={<Navigate to="/admin/login" replace />} />
          <Route path="/admin/login" element={<AuthPage />} />
          <Route path="/profile" element={<Navigate to="/" replace />} />
          <Route path="/history" element={<Navigate to="/" replace />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/guide/:treeId" element={<GuidePage />} />
          <Route path="/flight-log" element={<FlightLogPage />} />
          <Route path="/my-feedback" element={<Navigate to="/" replace />} />
          <Route path="/admin/feedback" element={<AdminFeedbackPage />} />
          <Route path="/admin/coupons" element={<AdminCouponPage />} />
        </Routes>
        <Footer />
      </div>
    </Router>
  )
}

export default App
