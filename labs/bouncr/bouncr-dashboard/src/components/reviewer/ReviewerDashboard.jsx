// components/reviewer/ReviewerDashboard.jsx
import React, { useState, useMemo } from 'react';
import { Header } from '../shared/Header';
import { MetricsCards } from '../shared/MetricsCards';
import { AccessConstellationMap } from '../shared/AccessConstellationMap';
import { ReviewerQueue } from './ReviewerQueue';
import { mockUsers, mockReviewers } from '../../data/mockData';

function ReviewerDashboard({ user, onLogout }) {
  const [data, setData] = useState(mockUsers);
  const [constellationMetrics, setConstellationMetrics] = useState(null);

  // Filter data to only show items assigned to this reviewer
  const filteredData = useMemo(() => {
    const reviewerEmail = user.email;
    return data.filter(item => {
      return (
        mockReviewers.apps[item.app] === reviewerEmail ||
        mockReviewers.groups[item.group] === reviewerEmail ||
        mockReviewers.users[item.email] === reviewerEmail
      );
    });
  }, [data, user.email]);

  // Determine which team/group this reviewer is responsible for
  const reviewerViewFilter = useMemo(() => {
    const reviewerEmail = user.email;
    const responsibleGroups = Object.entries(mockReviewers.groups)
      .filter(([group, reviewer]) => reviewer === reviewerEmail)
      .map(([group]) => group);
    
    return responsibleGroups.length > 0 ? responsibleGroups[0] : 'all';
  }, [user.email]);

  function handleUpdateStatus(itemId, status, reviewer, comments) {
    setData(data.map(item => 
      item.id === itemId 
        ? { ...item, status, reviewer, comments }
        : item
    ));
  }

  function handleUserClick(clickedUser, group) {
    console.log('User clicked in constellation:', clickedUser, group);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={onLogout} />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
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