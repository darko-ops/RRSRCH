import React, { useState } from 'react';
import { Shield, User, LogOut } from 'lucide-react';

export function Header({ user, onLogout }) {
  const [showProfile, setShowProfile] = useState(false);

  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-6">
          <div className="flex items-center">
            <Shield className="h-8 w-8 text-blue-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">Bouncr</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-700">
              <span className="font-medium">{user.name}</span>
              <span className="text-gray-500 ml-2">({user.role})</span>
            </div>
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="flex items-center px-3 py-2 text-sm text-gray-700 hover:text-gray-900"
            >
              <User className="w-4 h-4 mr-1" />
              Profile
            </button>
            <button
              onClick={onLogout}
              className="flex items-center px-3 py-2 text-sm text-gray-700 hover:text-gray-900"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Logout
            </button>
          </div>
        </div>
        
        {showProfile && (
          <div className="border-t border-gray-200 py-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">Profile Information</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p><strong>Username:</strong> {user.username}</p>
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Role:</strong> {user.role}</p>
                <p><strong>Permissions:</strong> {user.permissions.join(', ')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
