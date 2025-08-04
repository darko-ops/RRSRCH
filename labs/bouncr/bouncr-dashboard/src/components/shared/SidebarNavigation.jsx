import React, { useState } from 'react';
import { 
  Shield, 
  Users, 
  Search, 
  ClipboardCheck, 
  Settings, 
  FileText, 
  Eye,
  UserCheck,
  Database,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Home,
  Bell,
  HelpCircle
} from 'lucide-react';

const SidebarNavigation = ({ currentPage, onPageChange, userRole = 'admin' }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Define all available pages/components
  const adminPages = [
    { id: 'dashboard', name: 'Dashboard', icon: Home, description: 'Overview and metrics' },
    { id: 'user-management', name: 'User Management', icon: Users, description: 'Manage users and permissions' },
    { id: 'audit-explorer', name: 'Audit Explorer', icon: Search, description: 'Explore access data and patterns' },
    { id: 'config-editor', name: 'Config Editor', icon: Settings, description: 'Edit system configuration' },
    { id: 'export-logs', name: 'Export & Logs', icon: FileText, description: 'Export data and view logs' }
  ];

  const reviewerPages = [
    { id: 'reviewer-dashboard', name: 'Review Queue', icon: ClipboardCheck, description: 'Items assigned for review' },
    { id: 'reviewer-queue', name: 'My Reviews', icon: UserCheck, description: 'My review assignments' }
  ];

  const viewerPages = [
    { id: 'viewer-dashboard', name: 'Access Overview', icon: Eye, description: 'View-only access data' },
    { id: 'reports', name: 'Reports', icon: BarChart3, description: 'Access reports and analytics' }
  ];

  const sharedPages = [
    { id: 'notifications', name: 'Notifications', icon: Bell, description: 'System notifications' },
    { id: 'help', name: 'Help & Support', icon: HelpCircle, description: 'Documentation and support' }
  ];

  // Get pages based on user role
  const getPages = () => {
    switch (userRole) {
      case 'admin':
        return [...adminPages, ...sharedPages];
      case 'reviewer':
        return [...reviewerPages, ...sharedPages];
      case 'viewer':
        return [...viewerPages, ...sharedPages];
      default:
        return sharedPages;
    }
  };

  const pages = getPages();

  const handlePageClick = (pageId) => {
    onPageChange(pageId);
  };

  return (
    <div className={`bg-white shadow-lg border-r border-gray-200 transition-all duration-300 ${
      isCollapsed ? 'w-16' : 'w-64'
    } flex flex-col h-screen sticky top-0`}>
      
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <Shield className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">Bouncr</h1>
                <p className="text-xs text-gray-500 capitalize">{userRole} Portal</p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <Shield className="w-8 h-8 text-blue-600 mx-auto" />
          )}
          
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-600" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">
          {pages.map((page) => {
            const Icon = page.icon;
            const isActive = currentPage === page.id;
            
            return (
              <button
                key={page.id}
                onClick={() => handlePageClick(page.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  isActive
                    ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-600'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                } ${isCollapsed ? 'justify-center' : ''}`}
                title={isCollapsed ? page.name : ''}
              >
                <Icon className={`${isCollapsed ? 'w-6 h-6' : 'w-5 h-5'} flex-shrink-0`} />
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{page.name}</div>
                    <div className="text-xs text-gray-500 truncate">{page.description}</div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Role Indicator */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">
            Current Role
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              userRole === 'admin' ? 'bg-red-500' :
              userRole === 'reviewer' ? 'bg-yellow-500' : 'bg-green-500'
            }`}></div>
            <span className="text-sm font-medium text-gray-900 capitalize">{userRole}</span>
          </div>
        </div>
      )}

      {/* Collapse Indicator for Mobile */}
      {isCollapsed && (
        <div className="p-2 border-t border-gray-200">
          <div className={`w-2 h-2 rounded-full mx-auto ${
            userRole === 'admin' ? 'bg-red-500' :
            userRole === 'reviewer' ? 'bg-yellow-500' : 'bg-green-500'
          }`}></div>
        </div>
      )}
    </div>
  );
};

export default SidebarNavigation;