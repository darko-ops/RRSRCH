import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, Edit3, Trash2, Shield, AlertTriangle, CheckCircle, XCircle, Download, Upload, Users, UserX, Clock, Mail } from 'lucide-react';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [sortField, setSortField] = useState('lastLogin');
  const [sortDirection, setSortDirection] = useState('desc');

  // Mock user data - in real app this would come from your API
  useEffect(() => {
    const mockUsers = [
      {
        id: 'u001',
        email: 'alice.developer@company.com',
        firstName: 'Alice',
        lastName: 'Johnson',
        department: 'Engineering',
        title: 'Senior Developer',
        status: 'active',
        lastLogin: '2024-08-02T14:30:00Z',
        flaggedAccess: 2,
        riskLevel: 'medium',
        groups: ['engineering', 'github-admin'],
        apps: ['GitHub', 'AWS', 'Figma'],
        createdAt: '2023-01-15T10:00:00Z',
        reviewStatus: 'pending'
      },
      {
        id: 'u002', 
        email: 'bob.manager@company.com',
        firstName: 'Bob',
        lastName: 'Smith',
        department: 'Product',
        title: 'Product Manager',
        status: 'active',
        lastLogin: '2024-07-28T09:15:00Z',
        flaggedAccess: 0,
        riskLevel: 'low',
        groups: ['product', 'slack-admin'],
        apps: ['Slack', 'Notion', 'Salesforce'],
        createdAt: '2022-06-20T14:00:00Z',
        reviewStatus: 'approved'
      },
      {
        id: 'u003',
        email: 'charlie.intern@company.com',
        firstName: 'Charlie',
        lastName: 'Wilson',
        department: 'Engineering',
        title: 'Intern',
        status: 'inactive',
        lastLogin: '2024-06-15T16:45:00Z',
        flaggedAccess: 5,
        riskLevel: 'high',
        groups: ['interns', 'engineering'],
        apps: ['GitHub', 'Slack'],
        createdAt: '2024-05-01T09:00:00Z',
        reviewStatus: 'flagged'
      },
      {
        id: 'u004',
        email: 'diana.security@company.com',
        firstName: 'Diana',
        lastName: 'Rodriguez',
        department: 'Security',
        title: 'Security Engineer',
        status: 'active',
        lastLogin: '2024-08-03T11:20:00Z',
        flaggedAccess: 1,
        riskLevel: 'high',
        groups: ['security', 'admin'],
        apps: ['Okta', 'AWS', 'GitHub', 'Splunk'],
        createdAt: '2023-03-10T13:00:00Z',
        reviewStatus: 'approved'
      }
    ];
    setUsers(mockUsers);
    setFilteredUsers(mockUsers);
  }, []);

  // Filter and search logic
  useEffect(() => {
    let filtered = users.filter(user => {
      const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.department.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = selectedFilter === 'all' || 
                           (selectedFilter === 'active' && user.status === 'active') ||
                           (selectedFilter === 'inactive' && user.status === 'inactive') ||
                           (selectedFilter === 'flagged' && user.flaggedAccess > 0) ||
                           (selectedFilter === 'high-risk' && user.riskLevel === 'high') ||
                           (selectedFilter === 'pending-review' && user.reviewStatus === 'pending');
      
      return matchesSearch && matchesFilter;
    });

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      if (sortField === 'lastLogin') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    setFilteredUsers(filtered);
  }, [users, searchTerm, selectedFilter, sortField, sortDirection]);

  const getRiskLevelColor = (riskLevel) => {
    switch(riskLevel) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'active': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'inactive': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getReviewStatusBadge = (status) => {
    switch(status) {
      case 'approved': return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Approved</span>;
      case 'flagged': return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Flagged</span>;
      case 'pending': return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Pending</span>;
      default: return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">Unknown</span>;
    }
  };

  const formatLastLogin = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleUserSelect = (userId) => {
    setSelectedUsers(prev => {
      const newSelection = prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId];
      setShowBulkActions(newSelection.length > 0);
      return newSelection;
    });
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
      setShowBulkActions(false);
    } else {
      setSelectedUsers(filteredUsers.map(user => user.id));
      setShowBulkActions(true);
    }
  };

  const handleBulkAction = (action) => {
    console.log(`Performing ${action} on users:`, selectedUsers);
    // Implement bulk actions here
    setSelectedUsers([]);
    setShowBulkActions(false);
  };

  return (
    <div className="p-6 max-w-full">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-7 h-7" />
              User Management
            </h1>
            <p className="text-gray-600 mt-1">Manage user access, permissions, and review statuses</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Upload className="w-4 h-4" />
              Import Users
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Users</p>
                <p className="text-2xl font-bold">{users.length}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Users</p>
                <p className="text-2xl font-bold text-green-600">{users.filter(u => u.status === 'active').length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Flagged Access</p>
                <p className="text-2xl font-bold text-red-600">{users.filter(u => u.flaggedAccess > 0).length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Reviews</p>
                <p className="text-2xl font-bold text-yellow-600">{users.filter(u => u.reviewStatus === 'pending').length}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users by name, email, or department..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
            >
              <option value="all">All Users</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
              <option value="flagged">Flagged Access</option>
              <option value="high-risk">High Risk</option>
              <option value="pending-review">Pending Review</option>
            </select>
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {showBulkActions && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-800">
                {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleBulkAction('review')}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Start Review
                </button>
                <button 
                  onClick={() => handleBulkAction('notify')}
                  className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
                >
                  Send Notification
                </button>
                <button 
                  onClick={() => handleBulkAction('deactivate')}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Deactivate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  <button 
                    onClick={() => handleSort('email')}
                    className="flex items-center gap-1 hover:text-gray-900"
                  >
                    User
                    {sortField === 'email' && (
                      <span className="text-blue-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  <button 
                    onClick={() => handleSort('department')}
                    className="flex items-center gap-1 hover:text-gray-900"
                  >
                    Department
                    {sortField === 'department' && (
                      <span className="text-blue-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  <button 
                    onClick={() => handleSort('lastLogin')}
                    className="flex items-center gap-1 hover:text-gray-900"
                  >
                    Last Login
                    {sortField === 'lastLogin' && (
                      <span className="text-blue-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Risk Level</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Flagged Access</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Review Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.id)}
                      onChange={() => handleUserSelect(user.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-600">
                          {user.firstName[0]}{user.lastName[0]}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-sm text-gray-600">{user.email}</div>
                        <div className="text-xs text-gray-500">{user.title}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{user.department}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(user.status)}
                      <span className="text-sm capitalize">{user.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatLastLogin(user.lastLogin)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${getRiskLevelColor(user.riskLevel)}`}>
                      {user.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.flaggedAccess > 0 ? (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertTriangle className="w-4 h-4" />
                        {user.flaggedAccess}
                      </span>
                    ) : (
                      <span className="text-green-600">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {getReviewStatusBadge(user.reviewStatus)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button className="p-1 text-gray-600 hover:text-blue-600">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button className="p-1 text-gray-600 hover:text-green-600">
                        <Mail className="w-4 h-4" />
                      </button>
                      <button className="p-1 text-gray-600 hover:text-red-600">
                        <UserX className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <UserX className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
            <p className="text-gray-600">Try adjusting your search or filter criteria.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-6">
        <div className="text-sm text-gray-600">
          Showing {filteredUsers.length} of {users.length} users
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50">
            Previous
          </button>
          <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded">
            1
          </button>
          <button className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50">
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;