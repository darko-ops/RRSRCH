// components/shared/Header.jsx
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

// components/shared/MetricsCards.jsx
import React from 'react';
import { Users, Clock, AlertTriangle } from 'lucide-react';

export function MetricsCards({ data, constellationMetrics = null }) {
  const metrics = constellationMetrics || {
    totalMembers: data.filter(item => item.status !== 'rejected').length,
    pending: data.filter(item => item.status === 'pending').length,
    risks: data.filter(item => item.reasons.includes('Privileged') || item.reasons.includes('Admin')).length
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <Users className="h-8 w-8 text-blue-500" />
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Members</p>
            <p className="text-2xl font-bold text-gray-900">{metrics.totalMembers}</p>
          </div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <Clock className="h-8 w-8 text-red-500" />
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Pending</p>
            <p className="text-2xl font-bold text-gray-900">{metrics.pending}</p>
          </div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <AlertTriangle className="h-8 w-8 text-yellow-500" />
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Risks</p>
            <p className="text-2xl font-bold text-gray-900">{metrics.risks}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// data/mockData.js
export const mockUsers = [
  { id: 1, email: 'alex@acme.com', app: 'GitHub', group: 'engineering', lastLogin: '2024-05-01', status: 'pending', reasons: 'Inactive for more than 45 days' },
  { id: 2, email: 'sam@acme.com', app: 'Figma', group: 'marketing', lastLogin: '2024-07-25', status: 'approved', reasons: 'Privileged role: Admin' },
  { id: 3, email: 'jane@acme.com', app: 'Salesforce', group: 'sales', lastLogin: '2024-03-15', status: 'pending', reasons: 'Inactive for more than 45 days; Privileged role' },
  { id: 4, email: 'mike@acme.com', app: 'Slack', group: 'engineering', lastLogin: '2024-07-20', status: 'rejected', reasons: 'Orphaned account' },
  { id: 5, email: 'sarah@acme.com', app: 'Jira', group: 'product', lastLogin: '2024-06-10', status: 'pending', reasons: 'Privileged role: DevOps' },
];

export const mockReviewers = {
  apps: { 
    'Salesforce': 'john@company.com', 
    'GitHub': 'alice@company.com',
    'Jira': 'eng-lead@company.com'
  },
  groups: { 
    'engineering': 'alice@company.com', 
    'finance': 'cfo@company.com',
    'marketing': 'marketing-lead@company.com'
  },
  users: { 
    'vipuser@company.com': 'ceo@company.com',
    'alex@acme.com': 'alice@company.com' 
  }
};