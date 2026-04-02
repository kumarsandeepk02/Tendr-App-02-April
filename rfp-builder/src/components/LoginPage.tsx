import React from 'react';
import { LogIn, FileText } from 'lucide-react';

interface LoginPageProps {
  onLogin: () => void;
  isLoading: boolean;
}

export default function LoginPage({ onLogin, isLoading }: LoginPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <FileText className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-900">Tendr</h1>
          </div>
          <p className="text-gray-500 text-lg">
            Modern procurement, simplified.
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Welcome back
          </h2>
          <p className="text-gray-500 mb-6">
            Sign in to start building RFPs, RFIs, and procurement documents with AI.
          </p>

          <button
            onClick={onLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <LogIn className="w-5 h-5" />
            )}
            {isLoading ? 'Connecting...' : 'Sign in'}
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">
            Powered by WorkOS &middot; Enterprise-grade security
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-400 mt-6">
          Built by Molecule One
        </p>
      </div>
    </div>
  );
}
