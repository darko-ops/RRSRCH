// components/admin/AdminDashboard.jsx
import React, { useState } from 'react';
import { Eye, Users, Settings, Download, User } from 'lucide-react';
import { Header } from '../shared/Header';
import { MetricsCards } from '../shared/MetricsCards';
import { AccessConstellationMap } from '../shared/AccessConstellationMap';
import { AuditExplorer } from './AuditExplorer';
import { ReviewerQueue } from '../reviewer/ReviewerQueue';
import { mockUsers } from '../../data/mockData';
import ConfigEditor from './ConfigEditor';
import { mockUsers, mockReviewers } from '../../data/mockData';


function AdminDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('audit');
  const [data, setData] = useState(mockUsers);
  const [constellationMetrics, setConstellationMetrics] = useState(null);

  function handleUpdateStatus(itemId, status, reviewer, comments) {
    setData(data.map(item => 
      item.id === itemId 
        ? { ...item, status, reviewer, comments }
        : item
    ));
  }

  function handleUserClick(clickedUser, group) {
    console.log('User clicked in constellation:', clickedUser, group);
    // Could open modal, navigate to user detail page, etc.
  }

  const tabs = [
    { id: 'audit', name: 'Audit Explorer', icon: Eye },
    { id: 'reviewer', name: 'Reviewer Queue', icon: Users },
    { id: 'config', name: 'Config Editor', icon: Settings },
    { id: 'export', name: 'Export & Logs', icon: Download },
    { id: 'users', name: 'User Management', icon: User }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={onLogout} />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Constellation Map - Full Admin View */}
        <AccessConstellationMap 
          data={data}
          onMetricsUpdate={setConstellationMetrics}
          onUserClick={handleUserClick}
        />
        
        {/* Metrics Cards */}
        <MetricsCards data={data} constellationMetrics={constellationMetrics} />
        
        // Fixed Tab Content Section for AdminDashboard.jsx

import ConfigEditor from './ConfigEditor'; // Add this import at the top

// Then replace your tab content section with this:

        {/* Tab Content */}
        <div className="px-4 sm:px-0">
          {activeTab === 'audit' && <AuditExplorer data={data} />}
          
          {activeTab === 'reviewer' && (
            <ReviewerQueue 
              data={data} 
              currentUser={user} 
              onUpdateStatus={handleUpdateStatus}
              showReviewerSelector={true} // Admin can see all reviewers
            />
          )}
          
          {activeTab === 'config' && (
            <ConfigEditor 
              config={config} 
              reviewers={reviewers}
              onSave={(configData) => {
                // Handle saving configuration
                setConfig(configData.config);
                setReviewers(configData.reviewers);
                console.log('Saving config:', configData);
              }}
            />
          )}
          
          {activeTab === 'export' && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">Export & Logs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-3">Export Options</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>• CSV/JSON/Excel export of review data</p>
                    <p>• Configuration backup reports</p>
                    <p>• Audit trail documentation</p>
                    <p>• Compliance reporting</p>
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-3">System Logs</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>• User access events</p>
                    <p>• Review decisions audit</p>
                    <p>• Configuration changes</p>
                    <p>• System performance metrics</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'users' && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">User Management</h3>
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <Users className="h-5 w-5 text-green-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">User Administration</h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>Manage system users, roles, and permissions for the Bouncr dashboard.</p>
                      <p className="mt-2">Features include: Add/remove users, assign reviewer roles, configure permission levels, and manage authentication.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;