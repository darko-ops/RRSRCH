
import React, { useState } from 'react';
import SidebarNavigation from './SidebarNavigation';
import { Header } from './Header';

// Import components that should work
import UserManagement from '../admin/UserManagement';
// We'll add more imports as we test them

// Import mock data
import { mockUsers } from '../../data/mockData';

const DashboardLayout = ({ user, onLogout }) => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [data] = useState(mockUsers);

  // Handle page changes
  const handlePageChange = (pageId) => {
    setCurrentPage(pageId);
  };

  // Render the current page component
  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
              <p className="text-gray-600">Welcome back, {user.name}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Welcome to Bouncr</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-medium text-blue-900">Total Users</h3>
                  <p className="text-2xl font-bold text-blue-600">{data.length}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h3 className="font-medium text-yellow-900">Pending Reviews</h3>
                  <p className="text-2xl font-bold text-yellow-600">
                    {data.filter(item => item.status === 'pending').length}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-medium text-green-900">Active Users</h3>
                  <p className="text-2xl font-bold text-green-600">
                    {data.filter(item => item.status === 'active').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'user-management':
        return <UserManagement />;
      
      case 'audit-explorer':
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Audit Explorer</h2>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">Recent Activity</h3>
                <div className="space-y-2">
                  {data.slice(0, 5).map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-sm">{item.email}</span>
                      <span className={`px-2 py-1 text-xs rounded ${
                        item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        item.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'config-editor':
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Configuration Editor</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Review Threshold (days)
                </label>
                <input 
                  type="number" 
                  defaultValue="45" 
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Auto-approve low risk users
                </label>
                <input type="checkbox" className="rounded" />
              </div>
              <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                Save Configuration
              </button>
            </div>
          </div>
        );
      
      case 'export-logs':
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Export & Logs</h2>
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Export Data</h3>
                <p className="text-sm text-gray-600 mb-3">Download access review data</p>
                <div className="space-x-2">
                  <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                    Export CSV
                  </button>
                  <button className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700">
                    Export PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'notifications':
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Notifications</h2>
            <div className="space-y-4">
              <div className="border-l-4 border-blue-400 bg-blue-50 p-4">
                <p className="text-sm text-blue-700">
                  Welcome to Bouncr! Your access review system is ready.
                </p>
              </div>
            </div>
          </div>
        );
      
      case 'help':
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Help & Support</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Getting Started</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>Navigate using the sidebar on the left</li>
                  <li>User Management: Add and manage user access</li>
                  <li>Audit Explorer: Review access patterns</li>
                  <li>Configuration: Customize review settings</li>
                </ul>
              </div>
            </div>
          </div>
        );
      
      default:
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900">Page Not Found</h2>
            <p className="text-gray-600 mt-2">The requested page could not be found.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <SidebarNavigation 
        currentPage={currentPage}
        onPageChange={handlePageChange}
        userRole={user.role}
      />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header user={user} onLogout={onLogout} />
        
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            {renderCurrentPage()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
