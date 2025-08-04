import React from 'react';
import { Users, Clock, AlertTriangle } from 'lucide-react';

export function MetricsCards({ data, constellationMetrics = null }) {
  // Add safety check for data
  const safeData = data || [];
  
  const metrics = constellationMetrics || {
    // Total access items across all systems
    totalMembers: safeData.length,
    
    // Pending access requests + items under review
    pending: safeData.filter(item => 
      item.status === 'pending' || 
      item.reviewStatus === 'pending' ||
      item.requestType === 'access_request' ||
      item.requestType === 'group_request' ||
      (item.flaggedAccess && item.flaggedAccess > 0)
    ).length,
    
    // High risk items needing attention
    risks: safeData.filter(item => {
      const reasons = item.reasons || '';
      const riskLevel = item.riskLevel || '';
      
      // Check for various risk factors
      const hasInactiveAccess = reasons.includes && reasons.includes('Inactive');
      const hasStaleAccess = reasons.includes && reasons.includes('Stale');
      const hasJobMismatch = reasons.includes && reasons.includes('Job title mismatch');
      const hasTerminatedUser = reasons.includes && reasons.includes('Terminated');
      const hasExcessiveAccess = reasons.includes && reasons.includes('Excessive');
      const hasPrivilegedAccess = reasons.includes && (reasons.includes('Privileged') || reasons.includes('Admin'));
      const isHighRisk = riskLevel === 'high';
      
      return (
        isHighRisk ||
        hasInactiveAccess ||
        hasStaleAccess ||
        hasJobMismatch ||
        hasTerminatedUser ||
        hasExcessiveAccess ||
        hasPrivilegedAccess
      );
    }).length
  };

  return (
    <div className="grid grid-cols-3 gap-6 mb-8">
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Users className="h-6 w-6 text-blue-500 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Total Access Items</p>
              <p className="text-xs text-gray-500">Across all systems</p>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{metrics.totalMembers}</p>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Clock className="h-6 w-6 text-orange-500 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Reviews</p>
              <p className="text-xs text-gray-500">Access requests + flagged items</p>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{metrics.pending}</p>
        </div>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">High Risk Items</p>
              <p className="text-xs text-gray-500">Inactive, terminated, job mismatch</p>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{metrics.risks}</p>
        </div>
      </div>
    </div>
  );
}

export default MetricsCards;