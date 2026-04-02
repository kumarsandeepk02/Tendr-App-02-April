import React from 'react';
import { useAuth } from './hooks/useAuth';
import LoginPage from './components/LoginPage';
import App from './App';

export default function AuthGate() {
  const { isAuthenticated, isLoading, login, logout, profile } = useAuth();

  // Loading state — checking session
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated — show login
  if (!isAuthenticated) {
    return <LoginPage onLogin={login} isLoading={false} />;
  }

  // Authenticated — render the app
  return <App />;
}
