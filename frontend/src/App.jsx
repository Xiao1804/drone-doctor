import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ImageDiagnosisPage from './pages/ImageDiagnosisPage'
import HistoryPage from './pages/HistoryPage'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import GuidePage from './pages/GuidePage'
import FlightLogPage from './pages/FlightLogPage'
import ToastContainer from './components/Toast'
import './index.css'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <ToastContainer />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/diagnosis" element={<Navigate to="/guide" replace />} />
          <Route path="/conversation" element={<Navigate to="/guide" replace />} />
          <Route path="/image-diagnosis" element={<ImageDiagnosisPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/guide/:treeId" element={<GuidePage />} />
          <Route path="/flight-log" element={<FlightLogPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
