import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import AuthPage from './pages/AuthPage'
import ChatPage from './pages/ChatPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'

function Protected({ children }: { children: React.ReactNode }) { const { user, loading } = useAuth(); if (loading) return <div className="loading-screen">Loading Tandem...</div>; return user ? <>{children}</> : <Navigate to="/login" replace /> }
function RoutesView() { return <Routes><Route path="/login" element={<AuthPage />} /><Route path="/signup" element={<AuthPage signup />} /><Route path="/chats" element={<Protected><ChatPage /></Protected>} /><Route path="/profile" element={<Protected><ProfilePage /></Protected>} /><Route path="/settings" element={<Protected><ProfilePage settings /></Protected>} /><Route path="/admin" element={<Protected><AdminPage /></Protected>} /><Route path="*" element={<Navigate to="/chats" replace />} /></Routes> }
export default function App() { return <AuthProvider><RoutesView /></AuthProvider> }
