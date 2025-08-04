
import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { Header } from '../shared/Header';
import { MetricsCards } from '../shared/MetricsCards';
import { AccessConstellationMap } from '../shared/AccessConstellationMap';
import { AuditExplorer } from './AuditExplorer';
import { mockUsers } from '../../data/mockData';
import ConfigEditor from './ConfigEditor';
import UserManagement from './UserManagement';  // Import the real UserManagement
import SidebarNavigation from '../shared/SidebarNavigation';

function AdminDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState(mockUsers);
  const [constellationMetrics, setConstellationMetrics] = useState(null);

  function handleUserClick(clickedUser, group) {
    console.log('User clicked in constellation:', clickedUser, group);
  }

  // Handle sidebar navigation
  const handlePageChange = (pageId) => {
    setActiveTab(pageId);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            <AccessConstellationMap 
              data={data}
              onMetricsUpdate={setConstellationMetrics}
              onUserClick={handleUserClick}
            />
            <MetricsCards data={data} constellationMetrics={constellationMetrics} />
          </div>
        );
      
      case 'audit-explorer':
      case 'audit':
        return <AuditExplorer data={data} />;
      
      case 'user-management':
        return <UserManagement />;  // Use the real UserManagement component
      
      case 'config-editor':
      case 'config':
        return <ConfigEditor />;
      
      case 'export-logs':
      case 'export':
        return (
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium mb-4">Export & Logs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Export Options</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>• CSV/JSON/Excel export of review data</p>
                  <p>• Configuration backup reports</p>
                </div>
              </div>
            </div>
          </div>
        );
      
      default:
        return <AuditExplorer data={data} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <SidebarNavigation 
        currentPage={activeTab}
        onPageChange={handlePageChange}
        userRole={user.role}
      />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} onLogout={onLogout} />
        
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default AdminDashboard;
