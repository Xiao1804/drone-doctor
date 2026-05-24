import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import DiagnosisPage from './pages/DiagnosisPage'
import ConversationPage from './pages/ConversationPage'
import ImageDiagnosisPage from './pages/ImageDiagnosisPage'
import HistoryPage from './pages/HistoryPage'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import './index.css'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/diagnosis" element={<DiagnosisPage />} />
          <Route path="/conversation" element={<ConversationPage />} />
          <Route path="/image-diagnosis" element={<ImageDiagnosisPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
