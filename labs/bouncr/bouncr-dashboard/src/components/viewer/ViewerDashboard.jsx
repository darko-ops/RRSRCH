// components/viewer/ViewerDashboard.jsx
import React, { useState } from 'react';
import { Header } from '../shared/Header';
import { MetricsCards } from '../shared/MetricsCards';
import { AccessConstellationMap } from '../shared/AccessConstellationMap';
import { AuditExplorer } from '../admin/AuditExplorer';
import { mockUsers } from '../../data/mockData';

function ViewerDashboard({ user, onLogout }) {
  const [data] = useState(mockUsers); // Read-only for viewers
  const [constellationMetrics, setConstellationMetrics] = useState(null);

  function handleUserClick(clickedUser, group) {
    console.log('User clicked in constellation:', clickedUser, group);
    // Viewers can see details but not take actions
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={onLogout} />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Read-only banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Read-Only Access</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>You have view-only access to the access review dashboard. You can explore data but cannot make changes or approve/reject reviews.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Constellation Map - Read-only */}
        <AccessConstellationMap 
          data={data}
          onMetricsUpdate={setConstellationMetrics}
          onUserClick={handleUserClick}
          hideViewSelector={false} // Viewers can change views to explore
        />
        
        {/* Metrics Cards */}
        <MetricsCards data={data} constellationMetrics={constellationMetrics} />
        
        {/* Audit Explorer Only - No Review Actions */}
        <div className="px-4 sm:px-0">
          <AuditExplorer data={data} readOnly={true} />
        </div>
      </main>
    </div>
  );
}

export default ViewerDashboard;