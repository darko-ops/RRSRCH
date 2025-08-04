import React, { useState, useEffect } from 'react';
import { 
  Filter, 
  Shield, 
  AlertTriangle, 
  Users, 
  Monitor, 
  TrendingUp, 
  Eye, 
  Search,
  Download,
  RefreshCw,
  BarChart3,
  Target,
  Activity
} from 'lucide-react';

export function AuditExplorer({ data = [], readOnly = false }) {
  const [filteredData, setFilteredData] = useState(data);
  const [filters, setFilters] = useState({
    status: 'All',
    app: 'All',
    group: 'All',
    riskLevel: 'All',
    privilegedOnly: false,
    dateFrom: '',
    searchTerm: ''
  });
  const [selectedView, setSelectedView] = useState('overview');

  // Calculate risk scores and analytics
  const [analytics, setAnalytics] = useState({
    highRiskIndividuals: [],
    highRiskApps: [],
    highRiskGroups: [],
    commonRiskReasons: [],
    riskDistribution: {}
  });

  useEffect(() => {
    calculateAnalytics();
  }, [data]);

  useEffect(() => {
    applyFilters();
  }, [filters, data]);

  const calculateAnalytics = () => {
    if (!data || data.length === 0) return;

    // Calculate individual risk scores
    const userRiskMap = {};
    data.forEach(item => {
      const userKey = item.userEmail || item.email;
      if (!userRiskMap[userKey]) {
        userRiskMap[userKey] = {
          userEmail: userKey,
          userName: item.userName || userKey.split('@')[0],
          riskScore: 0,
          highRiskAccess: [],
          flaggedReasons: new Set(),
          apps: new Set(),
          groups: new Set(),
          lastActivity: item.lastLogin
        };
      }

      const user = userRiskMap[userKey];
      user.apps.add(item.app);
      user.groups.add(item.group);

      // Calculate risk score
      let itemRisk = 0;
      if (item.riskLevel === 'high') itemRisk += 3;
      else if (item.riskLevel === 'medium') itemRisk += 2;
      else if (item.riskLevel === 'low') itemRisk += 1;

      if (item.accessLevel === 'admin') itemRisk += 2;
      if (item.flaggedReasons?.length > 0) {
        itemRisk += item.flaggedReasons.length;
        item.flaggedReasons.forEach(reason => user.flaggedReasons.add(reason));
      }

      user.riskScore += itemRisk;
      if (itemRisk >= 3) {
        user.highRiskAccess.push({
          app: item.app,
          group: item.group,
          risk: itemRisk,
          reasons: item.flaggedReasons || []
        });
      }
    });

    // Get top high-risk individuals
    const highRiskIndividuals = Object.values(userRiskMap)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map(user => ({
        ...user,
        flaggedReasons: Array.from(user.flaggedReasons),
        apps: Array.from(user.apps),
        groups: Array.from(user.groups)
      }));

    // Calculate app risk scores
    const appRiskMap = {};
    data.forEach(item => {
      if (!appRiskMap[item.app]) {
        appRiskMap[item.app] = {
          app: item.app,
          totalUsers: new Set(),
          riskScore: 0,
          flaggedCount: 0,
          adminUsers: 0
        };
      }

      const appData = appRiskMap[item.app];
      appData.totalUsers.add(item.userEmail || item.email);
      
      if (item.riskLevel === 'high') appData.riskScore += 3;
      else if (item.riskLevel === 'medium') appData.riskScore += 2;
      else if (item.riskLevel === 'low') appData.riskScore += 1;

      if (item.flaggedReasons?.length > 0) appData.flaggedCount++;
      if (item.accessLevel === 'admin') appData.adminUsers++;
    });

    const highRiskApps = Object.values(appRiskMap)
      .map(app => ({
        ...app,
        totalUsers: app.totalUsers.size,
        riskRatio: app.totalUsers.size > 0 ? (app.flaggedCount / app.totalUsers.size * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    // Calculate group risk scores
    const groupRiskMap = {};
    data.forEach(item => {
      if (!groupRiskMap[item.group]) {
        groupRiskMap[item.group] = {
          group: item.group,
          totalUsers: new Set(),
          riskScore: 0,
          flaggedCount: 0,
          privilegedCount: 0
        };
      }

      const groupData = groupRiskMap[item.group];
      groupData.totalUsers.add(item.userEmail || item.email);
      
      if (item.riskLevel === 'high') groupData.riskScore += 3;
      else if (item.riskLevel === 'medium') groupData.riskScore += 2;
      else if (item.riskLevel === 'low') groupData.riskScore += 1;

      if (item.flaggedReasons?.length > 0) groupData.flaggedCount++;
      if (item.accessLevel === 'admin') groupData.privilegedCount++;
    });

    const highRiskGroups = Object.values(groupRiskMap)
      .map(group => ({
        ...group,
        totalUsers: group.totalUsers.size,
        riskRatio: group.totalUsers.size > 0 ? (group.flaggedCount / group.totalUsers.size * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    // Calculate common risk reasons
    const reasonMap = {};
    data.forEach(item => {
      if (item.flaggedReasons && Array.isArray(item.flaggedReasons)) {
        item.flaggedReasons.forEach(reason => {
          reasonMap[reason] = (reasonMap[reason] || 0) + 1;
        });
      }
    });

    const commonRiskReasons = Object.entries(reasonMap)
      .map(([reason, count]) => ({
        reason: reason.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        count,
        percentage: ((count / data.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    setAnalytics({
      highRiskIndividuals,
      highRiskApps,
      highRiskGroups,
      commonRiskReasons,
      riskDistribution: {
        high: data.filter(item => item.riskLevel === 'high').length,
        medium: data.filter(item => item.riskLevel === 'medium').length,
        low: data.filter(item => item.riskLevel === 'low').length
      }
    });
  };

  const applyFilters = () => {
    let filtered = [...data];

    if (filters.searchTerm) {
      const search = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        (item.userEmail || item.email || '').toLowerCase().includes(search) ||
        (item.userName || '').toLowerCase().includes(search) ||
        (item.app || '').toLowerCase().includes(search) ||
        (item.group || '').toLowerCase().includes(search)
      );
    }

    if (filters.status !== 'All') {
      filtered = filtered.filter(item => item.reviewStatus === filters.status);
    }

    if (filters.app !== 'All') {
      filtered = filtered.filter(item => item.app === filters.app);
    }

    if (filters.group !== 'All') {
      filtered = filtered.filter(item => item.group === filters.group);
    }

    if (filters.riskLevel !== 'All') {
      filtered = filtered.filter(item => item.riskLevel === filters.riskLevel);
    }

    if (filters.privilegedOnly) {
      filtered = filtered.filter(item => 
        item.accessLevel === 'admin' || 
        (item.flaggedReasons && item.flaggedReasons.includes('privileged_access'))
      );
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.lastLogin);
        return itemDate >= fromDate;
      });
    }

    setFilteredData(filtered);
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  const getRiskBadge = (riskLevel) => {
    const badges = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800'
    };
    return badges[riskLevel] || 'bg-gray-100 text-gray-800';
  };

  const formatLastActivity = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const uniqueApps = [...new Set(data.map(item => item.app))].filter(Boolean);
  const uniqueGroups = [...new Set(data.map(item => item.group))].filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-600" />
            Access Review Control Center
          </h1>
          <p className="text-gray-600 mt-1">Monitor and analyze access across your entire ecosystem</p>
        </div>
        
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {readOnly && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-600" />
            <span className="text-blue-800 font-medium">Read-Only Mode</span>
          </div>
          <p className="text-blue-700 text-sm mt-1">You can explore and analyze data but cannot make changes.</p>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Access Items</p>
              <p className="text-2xl font-bold text-gray-900">{data.length}</p>
              <p className="text-xs text-gray-500 mt-1">Across all systems</p>
            </div>
            <Activity className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">High Risk Items</p>
              <p className="text-2xl font-bold text-red-600">{analytics.riskDistribution.high || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Require immediate attention</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Reviews</p>
              <p className="text-2xl font-bold text-yellow-600">
                {data.filter(item => item.reviewStatus === 'pending').length}
              </p>
              <p className="text-xs text-gray-500 mt-1">Awaiting decision</p>
            </div>
            <Target className="w-8 h-8 text-yellow-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Coverage</p>
              <p className="text-2xl font-bold text-green-600">{uniqueApps.length}</p>
              <p className="text-xs text-gray-500 mt-1">Applications monitored</p>
            </div>
            <BarChart3 className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow border">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', name: 'Overview', icon: BarChart3 },
              { id: 'individuals', name: 'High Risk Individuals', icon: Users },
              { id: 'apps', name: 'High Risk Apps', icon: Monitor },
              { id: 'groups', name: 'High Risk Groups', icon: Shield },
              { id: 'detailed', name: 'Detailed Review', icon: Filter }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedView(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                    selectedView === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {selectedView === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Risk Distribution */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Risk Distribution</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <span className="font-medium text-red-900">High Risk</span>
                    <span className="text-2xl font-bold text-red-600">{analytics.riskDistribution.high || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                    <span className="font-medium text-yellow-900">Medium Risk</span>
                    <span className="text-2xl font-bold text-yellow-600">{analytics.riskDistribution.medium || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <span className="font-medium text-green-900">Low Risk</span>
                    <span className="text-2xl font-bold text-green-600">{analytics.riskDistribution.low || 0}</span>
                  </div>
                </div>
              </div>

              {/* Common Risk Reasons */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Top Risk Factors</h3>
                <div className="space-y-2">
                  {analytics.commonRiskReasons.slice(0, 6).map((item, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">{item.reason}</span>
                      <div className="text-right">
                        <span className="font-semibold text-gray-900">{item.count}</span>
                        <span className="text-xs text-gray-500 ml-1">({item.percentage}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedView === 'individuals' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">High Risk Individuals</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk Score</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Apps</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Groups</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk Factors</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {analytics.highRiskIndividuals.map((user, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{user.userName}</div>
                            <div className="text-sm text-gray-500">{user.userEmail}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.riskScore >= 10 ? 'bg-red-100 text-red-800' :
                            user.riskScore >= 5 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {user.riskScore}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {user.apps.length}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {user.groups.length}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                          <div className="flex flex-wrap gap-1">
                            {user.flaggedReasons.slice(0, 3).map((reason, idx) => (
                              <span key={idx} className="inline-flex px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                                {reason.replace('_', ' ')}
                              </span>
                            ))}
                            {user.flaggedReasons.length > 3 && (
                              <span className="text-xs text-gray-500">+{user.flaggedReasons.length - 3} more</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatLastActivity(user.lastActivity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedView === 'apps' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">High Risk Applications</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics.highRiskApps.map((app, index) => (
                  <div key={index} className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{app.app}</h4>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        app.riskScore >= 20 ? 'bg-red-100 text-red-800' :
                        app.riskScore >= 10 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        Risk: {app.riskScore}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex justify-between">
                        <span>Total Users:</span>
                        <span className="font-medium">{app.totalUsers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Flagged Users:</span>
                        <span className="font-medium text-red-600">{app.flaggedCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Admin Users:</span>
                        <span className="font-medium text-orange-600">{app.adminUsers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Risk Ratio:</span>
                        <span className="font-medium">{app.riskRatio}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedView === 'groups' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">High Risk Groups</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics.highRiskGroups.map((group, index) => (
                  <div key={index} className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900 capitalize">{group.group}</h4>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        group.riskScore >= 20 ? 'bg-red-100 text-red-800' :
                        group.riskScore >= 10 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        Risk: {group.riskScore}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex justify-between">
                        <span>Total Users:</span>
                        <span className="font-medium">{group.totalUsers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Flagged Users:</span>
                        <span className="font-medium text-red-600">{group.flaggedCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Privileged Users:</span>
                        <span className="font-medium text-orange-600">{group.privilegedCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Risk Ratio:</span>
                        <span className="font-medium">{group.riskRatio}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedView === 'detailed' && (
            <div className="space-y-6">
              {/* Advanced Filters */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium mb-4 flex items-center">
                  <Filter className="w-5 h-5 mr-2" />
                  Advanced Filters
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={filters.searchTerm}
                        onChange={(e) => setFilters({...filters, searchTerm: e.target.value})}
                        className="pl-10 border border-gray-300 rounded-md px-3 py-2 w-full"
                        placeholder="Search users, apps, groups..."
                      />
                    </div>
                  </div>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
                    <select
                      value={filters.riskLevel}
                      onChange={(e) => setFilters({...filters, riskLevel: e.target.value})}
                      className="border border-gray-300 rounded-md px-3 py-2 w-full"
                    >
                      <option>All</option>
                      <option>high</option>
                      <option>medium</option>
                      <option>low</option>
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
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="privilegedOnly"
                      checked={filters.privilegedOnly}
                      onChange={(e) => setFilters({...filters, privilegedOnly: e.target.checked})}
                      className="rounded border-gray-300 mr-2"
                    />
                    <label htmlFor="privilegedOnly" className="text-sm text-gray-700">
                      Privileged Users Only
                    </label>
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
              <div className="bg-white rounded-lg shadow border">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Access Review Results</h3>
                    <span className="text-sm text-gray-500">
                      Showing {filteredData.length} of {data.length} items
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">App</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Group</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Access Level</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk Level</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk Factors</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">System</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredData.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {item.userName || item.userEmail?.split('@')[0] || 'Unknown'}
                              </div>
                              <div className="text-sm text-gray-500">{item.userEmail || item.email}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Monitor className="w-4 h-4 text-blue-500 mr-2" />
                              <span className="text-sm text-gray-900">{item.app}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Users className="w-4 h-4 text-green-500 mr-2" />
                              <span className="text-sm text-gray-900 capitalize">{item.group}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              item.accessLevel === 'admin' ? 'bg-red-100 text-red-800' :
                              item.accessLevel === 'user' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {item.accessLevel || 'user'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRiskBadge(item.riskLevel)}`}>
                              {item.riskLevel}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatLastActivity(item.lastLogin)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(item.reviewStatus)}`}>
                              {item.reviewStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                            <div className="flex flex-wrap gap-1">
                              {(item.flaggedReasons || []).slice(0, 2).map((reason, idx) => (
                                <span key={idx} className="inline-flex px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">
                                  {reason.replace('_', ' ')}
                                </span>
                              ))}
                              {(item.flaggedReasons || []).length > 2 && (
                                <span className="text-xs text-gray-500">+{item.flaggedReasons.length - 2}</span>
                              )}
                              {(!item.flaggedReasons || item.flaggedReasons.length === 0) && (
                                <span className="text-xs text-gray-400">No flags</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                              item.system === 'okta' ? 'bg-blue-100 text-blue-800' :
                              item.system === 'entra' ? 'bg-purple-100 text-purple-800' :
                              item.system === 'ad' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {item.system?.toUpperCase() || 'UNKNOWN'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredData.length === 0 && (
                  <div className="text-center py-12">
                    <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
                    <p className="text-gray-600">Try adjusting your filters or search criteria.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}