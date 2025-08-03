// components/admin/AuditExplorer.jsx
import React, { useState, useEffect } from 'react';
import { Filter } from 'lucide-react';

export function AuditExplorer({ data, readOnly = false }) {
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

  function getStatusBadge(status) {
    const badges = {
      pending: 'bg-red-100 text-red-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-yellow-100 text-yellow-800'
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  }

  const uniqueApps = [...new Set(data.map(item => item.app))];
  const uniqueGroups = [...new Set(data.map(item => item.group))];

  return (
    <div className="space-y-6">
      {/* Read-only indicator for viewers */}
      {readOnly && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="text-sm text-blue-700">
            <p>📖 <strong>Read-Only Mode:</strong> You can explore and filter the data but cannot make changes.</p>
          </div>
        </div>
      )}

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
}