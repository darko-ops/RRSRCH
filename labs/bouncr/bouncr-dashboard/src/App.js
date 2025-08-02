import React, { useState, useEffect } from 'react';
import { 
  User, 
  Shield, 
  Settings, 
  Download, 
  Users, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Clock,
  LogOut,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  Database,
  FileText,
  Lock,
  Filter
} from 'lucide-react';

// Mock data
const mockUsers = [
  { id: 1, email: 'alex@acme.com', app: 'GitHub', group: 'engineering', lastLogin: '2024-05-01', status: 'pending', reasons: 'Inactive for more than 45 days' },
  { id: 2, email: 'sam@acme.com', app: 'Figma', group: 'marketing', lastLogin: '2024-07-25', status: 'approved', reasons: 'Privileged role: Admin' },
  { id: 3, email: 'jane@acme.com', app: 'Salesforce', group: 'sales', lastLogin: '2024-03-15', status: 'pending', reasons: 'Inactive for more than 45 days; Privileged role' },
  { id: 4, email: 'mike@acme.com', app: 'Slack', group: 'engineering', lastLogin: '2024-07-20', status: 'rejected', reasons: 'Orphaned account' },
  { id: 5, email: 'sarah@acme.com', app: 'Jira', group: 'product', lastLogin: '2024-06-10', status: 'pending', reasons: 'Privileged role: DevOps' },
];

const mockConfig = {
  ttl_days: 90,
  inactivity_days: 45,
  backup_cadence: 'monthly',
  orphaned_account: true,
  ignore_groups: ['contractors', 'interns'],
  risky_roles: ['Admin', 'SuperUser', 'DevOps', 'Security'],
  ignore_apps: ['Zoom', 'Slack', 'Microsoft Teams'],
  notify_method: 'slack',
  retry_limit: 3,
  escalate_days: 5
};

const mockReviewers = {
  apps: { 
    'Salesforce': 'john@company.com', 
    'GitHub': 'alice@company.com',
    'Jira': 'eng-lead@company.com'
  },
  groups: { 
    'engineering': 'eng-lead@company.com', 
    'finance': 'cfo@company.com',
    'marketing': 'marketing-lead@company.com'
  },
  users: { 
    'vipuser@company.com': 'ceo@company.com',
    'alex@acme.com': 'eng-lead@company.com' 
  }
};

// Authentication Hook
const useAuth = () => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('bouncr_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = (username, password) => {
    const users = {
      admin: { password: 'admin123', role: 'admin', permissions: ['all'] },
      alice: { password: 'alice123', role: 'reviewer', permissions: ['view_audit', 'manage_reviews'] },
      john: { password: 'john123', role: 'reviewer', permissions: ['view_audit', 'manage_reviews'] },
      viewer: { password: 'viewer123', role: 'viewer', permissions: ['view_audit'] }
    };

    const userAuth = users[username];
    if (userAuth && userAuth.password === password) {
      const userData = {
        username: username,
        name: username === 'admin' ? 'Administrator' : 
              username === 'alice' ? 'Alice Johnson' :
              username === 'john' ? 'John Smith' : 'Viewer User',
        email: `${username}@company.com`,
        role: userAuth.role,
        permissions: userAuth.permissions
      };
      setUser(userData);
      localStorage.setItem('bouncr_user', JSON.stringify(userData));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('bouncr_user');
  };

  const hasPermission = (permission) => {
    return user?.permissions?.includes('all') || user?.permissions?.includes(permission);
  };

  return { user, login, logout, hasPermission, isLoading };
};

// Login Component
const LoginForm = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const demoUsers = [
    { username: 'admin', password: 'admin123', role: 'Administrator' },
    { username: 'alice', password: 'alice123', role: 'Reviewer' },
    { username: 'john', password: 'john123', role: 'Reviewer' },
    { username: 'viewer', password: 'viewer123', role: 'Viewer' }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onLogin(username, password)) {
      setError('');
    } else {
      setError('Invalid credentials');
    }
  };

  const handleDemoUser = (demoUser) => {
    setUsername(demoUser.username);
    setPassword(demoUser.password);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-blue-600" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">Bouncr</h2>
          <p className="mt-2 text-sm text-gray-600">Access Review Dashboard</p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
              />
            </div>
          </div>
          
          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}
          
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Lock className="w-4 h-4 mr-2" />
            Sign In
          </button>
        </form>
        
        <div className="mt-4 p-4 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-800 font-medium mb-3">Demo Accounts:</p>
          <div className="space-y-2">
            {demoUsers.map((user) => (
              <button
                key={user.username}
                onClick={() => handleDemoUser(user)}
                className="w-full text-left p-2 rounded text-sm bg-white text-blue-800 hover:bg-blue-100"
              >
                <span className="font-medium">{user.username}</span> / {user.password}
                <span className="text-blue-600 text-xs ml-2">({user.role})</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Header Component
const Header = ({ user, onLogout }) => {
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
};

// Metrics Cards Component
const MetricsCards = ({ data }) => {
  const pending = data.filter(item => item.status === 'pending').length;
  const approved = data.filter(item => item.status === 'approved').length;
  const rejected = data.filter(item => item.status === 'rejected').length;
  const total = data.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <Database className="h-8 w-8 text-blue-500" />
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Total Reviews</p>
            <p className="text-2xl font-bold text-gray-900">{total}</p>
          </div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <Clock className="h-8 w-8 text-red-500" />
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Pending</p>
            <p className="text-2xl font-bold text-gray-900">{pending}</p>
          </div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <CheckCircle className="h-8 w-8 text-green-500" />
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Approved</p>
            <p className="text-2xl font-bold text-gray-900">{approved}</p>
          </div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <XCircle className="h-8 w-8 text-yellow-500" />
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Rejected</p>
            <p className="text-2xl font-bold text-gray-900">{rejected}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Audit Explorer Component
const AuditExplorer = ({ data }) => {
  const [filteredData, setFilteredData] = useState(data);
  const [filters, setFilters] = useState({
    status: 'All',
    app: 'All',
    group: 'All',
    dateFrom: ''
  });

  useEffect(() => {
    let filtered = data;
    
    if (filters.status !== 'All') {
      filtered = filtered.filter(item => item.status === filters.status);
    }
    if (filters.app !== 'All') {
      filtered = filtered.filter(item => item.app === filters.app);
    }
    if (filters.group !== 'All') {
      filtered = filtered.filter(item => item.group === filters.group);
    }
    
    setFilteredData(filtered);
  }, [filters, data]);

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'bg-red-100 text-red-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-yellow-100 text-yellow-800'
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  const uniqueApps = [...new Set(data.map(item => item.app))];
  const uniqueGroups = [...new Set(data.map(item => item.group))];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-4 flex items-center">
          <Filter className="w-5 h-5 mr-2" />
          Filters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({...filters, status: e.target.value})}
              className="border border-gray-300 rounded-md px-3 py-2 w-full"
            >
              <option>All</option>
              <option>pending</option>
              <option>approved</option>
              <option>rejected</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Application</label>
            <select
              value={filters.app}
              onChange={(e) => setFilters({...filters, app: e.target.value})}
              className="border border-gray-300 rounded-md px-3 py-2 w-full"
            >
              <option>All</option>
              {uniqueApps.map(app => <option key={app} value={app}>{app}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
            <select
              value={filters.group}
              onChange={(e) => setFilters({...filters, group: e.target.value})}
              className="border border-gray-300 rounded-md px-3 py-2 w-full"
            >
              <option>All</option>
              {uniqueGroups.map(group => <option key={group} value={group}>{group}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
              className="border border-gray-300 rounded-md px-3 py-2 w-full"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium">Audit Results ({filteredData.length} items)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">App</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Group</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reasons</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.app}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.group}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.lastLogin}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{item.reasons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h4 className="text-lg font-medium mb-4">Top Apps by Risk</h4>
          {uniqueApps.slice(0, 5).map(app => {
            const count = filteredData.filter(item => item.app === app).length;
            const percentage = filteredData.length > 0 ? ((count / filteredData.length) * 100).toFixed(1) : 0;
            return (
              <div key={app} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                <span className="font-medium">{app}</span>
                <div className="text-right">
                  <span className="font-semibold">{count} items</span>
                  <span className="text-gray-500 text-sm ml-2">({percentage}%)</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h4 className="text-lg font-medium mb-4">Common Risk Reasons</h4>
          <div className="space-y-2">
            {[
              { reason: 'Inactivity > 45 days', count: filteredData.filter(item => item.reasons.includes('Inactive')).length },
              { reason: 'Privileged role', count: filteredData.filter(item => item.reasons.includes('Privileged')).length },
              { reason: 'Orphaned account', count: filteredData.filter(item => item.reasons.includes('Orphaned')).length }
            ].map(({ reason, count }) => (
              <div key={reason} className="flex justify-between py-2 border-b border-gray-100 last:border-b-0">
                <span>{reason}</span>
                <span className="font-semibold">{count} occurrences</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Reviewer Queue Component
const ReviewerQueue = ({ data, currentUser, onUpdateStatus }) => {
  const [selectedReviewer, setSelectedReviewer] = useState(currentUser?.email || '');
  const [reviewItems, setReviewItems] = useState([]);
  const [comments, setComments] = useState({});

  const allReviewers = [...new Set([
    ...Object.values(mockReviewers.apps),
    ...Object.values(mockReviewers.groups),
    ...Object.values(mockReviewers.users)
  ])];

  useEffect(() => {
    const assigned = data.filter(item => {
      return (
        mockReviewers.apps[item.app] === selectedReviewer ||
        mockReviewers.groups[item.group] === selectedReviewer ||
        mockReviewers.users[item.email] === selectedReviewer
      );
    });
    setReviewItems(assigned);
  }, [selectedReviewer, data]);

  const handleReview = (itemId, action) => {
    const comment = comments[itemId] || '';
    console.log(`${action} item ${itemId} with comment: ${comment}`);
    
    if (onUpdateStatus) {
      onUpdateStatus(itemId, action, selectedReviewer, comment);
    }
    
    setComments({ ...comments, [itemId]: '' });
  };

  const pendingItems = reviewItems.filter(item => item.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Reviewer Selection */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-4 flex items-center">
          <Users className="w-5 h-5 mr-2" />
          Select Reviewer
        </h3>
        <select
          value={selectedReviewer}
          onChange={(e) => setSelectedReviewer(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 w-full max-w-md"
        >
          <option value="">-- Select Reviewer --</option>
          {allReviewers.map(reviewer => (
            <option key={reviewer} value={reviewer}>{reviewer}</option>
          ))}
        </select>
      </div>

      {/* Pending Reviews */}
      {pendingItems.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-red-600 flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Pending Reviews ({pendingItems.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-200">
            {pendingItems.map((item) => (
              <div key={item.id} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="text-lg font-medium">{item.email} - {item.app}</h4>
                    <div className="mt-3 grid grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <p><strong>Group:</strong> {item.group}</p>
                        <p><strong>Last Login:</strong> {item.lastLogin}</p>
                      </div>
                      <div>
                        <p><strong>Reasons:</strong></p>
                        <p className="text-red-600">{item.reasons}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Comments (optional)
                      </label>
                      <textarea
                        value={comments[item.id] || ''}
                        onChange={(e) => setComments({ ...comments, [item.id]: e.target.value })}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        rows="2"
                        placeholder="Add review comments..."
                      />
                    </div>
                  </div>
                  <div className="ml-6 flex flex-col space-y-2">
                    <button
                      onClick={() => handleReview(item.id, 'approved')}
                      className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReview(item.id, 'rejected')}
                      className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Items Message */}
      {reviewItems.length === 0 && selectedReviewer && (
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No items assigned</h3>
          <p className="mt-1 text-sm text-gray-500">No review items are currently assigned to {selectedReviewer}</p>
        </div>
      )}

      {/* Select Reviewer Message */}
      {!selectedReviewer && (
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <Eye className="mx-auto h-12 w-12 text-blue-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Select a reviewer</h3>
          <p className="mt-1 text-sm text-gray-500">Choose a reviewer from the dropdown above to view their assigned items</p>
        </div>
      )}
    </div>
  );
};

// Config Editor Component
const ConfigEditor = ({ config, setConfig, reviewers, setReviewers }) => {
  const [activeTab, setActiveTab] = useState('global');

  const handleConfigSave = () => {
    console.log('Saving config:', config);
    alert('Configuration saved successfully!');
  };

  const handleReviewerSave = () => {
    console.log('Saving reviewers:', reviewers);
    alert('Reviewer assignments saved successfully!');
  };

  const addAppReviewer = () => {
    const app = prompt('Enter app name:');
    const reviewer = prompt('Enter reviewer email:');
    if (app && reviewer) {
      setReviewers({
        ...reviewers,
        apps: { ...reviewers.apps, [app]: reviewer }
      });
    }
  };

  const removeAppReviewer = (app) => {
    const newApps = { ...reviewers.apps };
    delete newApps[app];
    setReviewers({ ...reviewers, apps: newApps });
  };

  const tabs = [
    { id: 'global', name: 'Global Config', icon: Settings },
    { id: 'reviewers', name: 'Reviewers', icon: Users },
    { id: 'overrides', name: 'Overrides', icon: AlertTriangle }
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Global Config Tab */}
      {activeTab === 'global' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-6">Global Configuration</h3>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">TTL Days</label>
                <input
                  type="number"
                  value={config.ttl_days}
                  onChange={(e) => setConfig({...config, ttl_days: parseInt(e.target.value)})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Inactivity Threshold (Days)</label>
                <input
                  type="number"
                  value={config.inactivity_days}
                  onChange={(e) => setConfig({...config, inactivity_days: parseInt(e.target.value)})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Backup Frequency</label>
                <select
                  value={config.backup_cadence}
                  onChange={(e) => setConfig({...config, backup_cadence: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="6months">6 Months</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notification Method</label>
                <select
                  value={config.notify_method}
                  onChange={(e) => setConfig({...config, notify_method: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                >
                  <option value="slack">Slack</option>
                  <option value="email">Email</option>
                  <option value="teams">Microsoft Teams</option>
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.orphaned_account}
                  onChange={(e) => setConfig({...config, orphaned_account: e.target.checked})}
                  className="mr-3"
                />
                <span className="text-sm font-medium text-gray-700">Enable Orphaned Account Detection</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ignore Groups (one per line)</label>
              <textarea
                value={config.ignore_groups.join('\n')}
                onChange={(e) => setConfig({...config, ignore_groups: e.target.value.split('\n').filter(g => g.trim())})}
                className="border border-gray-300 rounded-md px-3 py-2 w-full h-24"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Risky Roles (one per line)</label>
              <textarea
                value={config.risky_roles.join('\n')}
                onChange={(e) => setConfig({...config, risky_roles: e.target.value.split('\n').filter(r => r.trim())})}
                className="border border-gray-300 rounded-md px-3 py-2 w-full h-24"
              />
            </div>

            <button
              onClick={handleConfigSave}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Configuration
            </button>
          </div>
        </div>
      )}

      {/* Reviewers Tab */}
      {activeTab === 'reviewers' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">App Reviewers</h3>
              <button
                onClick={addAppReviewer}
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add App Reviewer
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(reviewers.apps).map(([app, reviewer]) => (
                <div key={app} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                  <div>
                    <span className="font-medium">{app}</span>
                    <span className="text-gray-500 ml-2">→ {reviewer}</span>
                  </div>
                  <button
                    onClick={() => removeAppReviewer(app)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleReviewerSave}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Reviewer Assignments
          </button>
        </div>
      )}

      {/* Overrides Tab */}
      {activeTab === 'overrides' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-4">Review Overrides</h3>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-blue-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Coming Soon</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>Override configuration will allow you to set special exceptions for specific users or scenarios.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Export & Logs Component
const ExportLogs = () => {
  const [exportFormat, setExportFormat] = useState('CSV');
  const [includeAll, setIncludeAll] = useState(false);

  const handleExport = () => {
    alert(`Export started: ${exportFormat} format, ${includeAll ? 'all data' : 'recent data only'}`);
  };

  const mockLogs = [
    { timestamp: '2024-08-02 14:30:21', user: 'admin', action: 'dashboard_access', details: 'User logged into dashboard' },
    { timestamp: '2024-08-02 14:25:15', user: 'alice@company.com', action: 'review_approved', details: 'Approved access for sam@acme.com - Figma' },
    { timestamp: '2024-08-02 14:20:08', user: 'admin', action: 'config_updated', details: 'Updated global configuration' }
  ];

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-4">Export Data</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium mb-3">Export Reviews</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                >
                  <option value="CSV">CSV</option>
                  <option value="JSON">JSON</option>
                  <option value="Excel">Excel</option>
                </select>
              </div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeAll}
                  onChange={(e) => setIncludeAll(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Include all historical data</span>
              </label>
              <button
                onClick={handleExport}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 w-full justify-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Generate Export
              </button>
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-3">Export Configuration</h4>
            <button
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 w-full justify-center"
            >
              <FileText className="w-4 h-4 mr-2" />
              Generate Config Report
            </button>
          </div>
        </div>
      </div>

      {/* System Logs */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium">System Logs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {mockLogs.map((log, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.timestamp}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.user}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.action}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// User Management Component
const UserManagement = () => {
  const mockSystemUsers = [
    { username: 'admin', name: 'Administrator', email: 'admin@company.com', role: 'admin', created: '2024-01-01' },
    { username: 'alice', name: 'Alice Johnson', email: 'alice@company.com', role: 'reviewer', created: '2024-02-15' },
    { username: 'john', name: 'John Smith', email: 'john@company.com', role: 'reviewer', created: '2024-03-01' }
  ];

  const [users, setUsers] = useState(mockSystemUsers);
  const [activeTab, setActiveTab] = useState('view');
  const [newUser, setNewUser] = useState({
    username: '',
    name: '',
    email: '',
    password: '',
    role: 'viewer'
  });

  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUser.username || !newUser.name || !newUser.email || !newUser.password) {
      alert('All fields are required');
      return;
    }
    
    if (users.some(user => user.username === newUser.username)) {
      alert('Username already exists');
      return;
    }

    const userToAdd = {
      ...newUser,
      created: new Date().toISOString().split('T')[0]
    };
    
    setUsers([...users, userToAdd]);
    setNewUser({ username: '', name: '', email: '', password: '', role: 'viewer' });
    alert('User added successfully!');
  };

  const handleDeleteUser = (username) => {
    if (username === 'admin') {
      alert('Cannot delete admin user');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      setUsers(users.filter(user => user.username !== username));
    }
  };

  const getRoleBadge = (role) => {
    const badges = {
      admin: 'bg-red-100 text-red-800',
      reviewer: 'bg-blue-100 text-blue-800',
      viewer: 'bg-gray-100 text-gray-800'
    };
    return badges[role] || 'bg-gray-100 text-gray-800';
  };

  const tabs = [
    { id: 'view', name: 'View Users', icon: Eye },
    { id: 'add', name: 'Add User', icon: Plus }
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* View Users Tab */}
      {activeTab === 'view' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium">Current Users ({users.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.username} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadge(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.created}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleDeleteUser(user.username)}
                        className="text-red-600 hover:text-red-900"
                        disabled={user.username === 'admin'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User Tab */}
      {activeTab === 'add' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-6">Add New User</h3>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                >
                  <option value="viewer">Viewer</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

// Main Dashboard Component
const Dashboard = () => {
  const { user, login, logout, hasPermission, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('audit');
  const [data, setData] = useState(mockUsers);
  const [config, setConfig] = useState(mockConfig);
  const [reviewers, setReviewers] = useState(mockReviewers);

  const handleUpdateStatus = (itemId, status, reviewer, comments) => {
    setData(data.map(item => 
      item.id === itemId 
        ? { ...item, status, reviewer, comments }
        : item
    ));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-blue-600 animate-spin" />
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm onLogin={login} />;
  }

  const tabs = [
    { id: 'audit', name: 'Audit Explorer', icon: Eye, permission: 'view_audit' },
    { id: 'reviewer', name: 'Reviewer Queue', icon: Users, permission: 'manage_reviews' },
    { id: 'config', name: 'Config Editor', icon: Settings, permission: 'edit_config' },
    { id: 'export', name: 'Export & Logs', icon: Download, permission: 'export_data' },
    { id: 'users', name: 'User Management', icon: User, permission: 'manage_users' }
  ].filter(tab => hasPermission(tab.permission));

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={logout} />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <MetricsCards data={data} />
        
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="px-4 sm:px-0">
          {activeTab === 'audit' && <AuditExplorer data={data} />}
          {activeTab === 'reviewer' && (
            <ReviewerQueue 
              data={data} 
              currentUser={user} 
              onUpdateStatus={handleUpdateStatus}
            />
          )}
          {activeTab === 'config' && (
            <ConfigEditor 
              config={config} 
              setConfig={setConfig}
              reviewers={reviewers}
              setReviewers={setReviewers}
            />
          )}
          {activeTab === 'export' && <ExportLogs />}
          {activeTab === 'users' && <UserManagement />}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;