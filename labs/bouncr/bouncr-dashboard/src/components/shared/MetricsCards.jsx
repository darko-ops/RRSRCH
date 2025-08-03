// components/shared/MetricsCards.jsx
import React from 'react';
import { Users, Clock, AlertTriangle } from 'lucide-react';

function MetricsCards({ data, constellationMetrics = null }) {
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

export default MetricsCards;