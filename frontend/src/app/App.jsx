import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './AppShell.jsx'
import HomePage from '../pages/home/HomePage.jsx'
import BrainPage from '../pages/brain/BrainPage.jsx'
import ReviewPage from '../pages/review/ReviewPage.jsx'

export default function App() {
  return <Routes><Route element={<AppShell />}>
    <Route index element={<HomePage />} />
    <Route path="brain" element={<BrainPage />} />
    <Route path="review" element={<ReviewPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes>
}
