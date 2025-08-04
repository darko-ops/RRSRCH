// components/reviewer/ReviewerDashboard.jsx
import React, { useState, useMemo } from 'react';
import { Header } from '../shared/Header';
import { MetricsCards } from '../shared/MetricsCards';
import { AccessConstellationMap } from '../shared/AccessConstellationMap';
import { ReviewerQueue } from './ReviewerQueue';
import { mockUsers, mockReviewers } from '../../data/mockData';

function ReviewerDashboard({ user, onLogout }) {
  const [data] = useState(mockUsers);
  const [constellationMetrics, setConstellationMetrics] = useState({});

  // Filter data to only show items assigned to this reviewer
  const filteredData = useMemo(() => {
    const reviewerEmail = user.email;
    return data.filter(item => {
      // Add safety checks for undefined properties
      const apps = mockReviewers?.apps || {};
      const groups = mockReviewers?.groups || {};
      const users = mockReviewers?.users || {};
      
      return (
        apps[item.app] === reviewerEmail ||
        groups[item.group] === reviewerEmail ||
        users[item.email] === reviewerEmail
      );
    });
  }, [data, user.email]);

  // Determine which team/group this reviewer is responsible for
  const reviewerViewFilter = useMemo(() => {
    const reviewerEmail = user.email;
    const groups = mockReviewers?.groups || {};
    const responsibleGroups = Object.entries(groups)
      .filter(([group, reviewer]) => reviewer === reviewerEmail)
      .map(([group]) => group);
    
    return responsibleGroups.length > 0 ? responsibleGroups[0] : 'all';
  }, [user.email]);

  function handleUserClick(user, group) {
    console.log('Reviewer clicked user:', user.name, 'in', group.name);
  }

  function handleUpdateStatus(itemId, newStatus) {
    console.log('Update status:', itemId, 'to', newStatus);
    // TODO: Connect to backend API
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={onLogout} />
      <main className="max-w-7xl mx-auto py-6 px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-gray-600">Items assigned to you for access review</p>
        </div>

        {/* Constellation Map - Filtered for Reviewer */}
        <AccessConstellationMap 
          data={filteredData}
          viewFilter={reviewerViewFilter}
          onMetricsUpdate={setConstellationMetrics}
          onUserClick={handleUserClick}
          hideViewSelector={true} // Reviewers can't change views
        />
        
        {/* Metrics Cards - Only for their assigned items */}
        <MetricsCards data={filteredData} constellationMetrics={constellationMetrics} />
        
        {/* Single Page - Review Queue Only */}
        <div className="px-4 sm:px-0">
          <ReviewerQueue 
            data={filteredData} 
            currentUser={user} 
            onUpdateStatus={handleUpdateStatus}
            showReviewerSelector={false} // Reviewers only see their own items
          />
        </div>
      </main>
    </div>
  );
}

export default ReviewerDashboard;
