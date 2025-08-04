// components/reviewer/ReviewerQueue.jsx
import React, { useState, useEffect } from 'react';
import { Users, Clock, CheckCircle, XCircle } from 'lucide-react';
import { mockReviewers } from '../../data/mockData';

export function ReviewerQueue({ 
  data, 
  currentUser, 
  onUpdateStatus, 
  showReviewerSelector = false 
}) {
  const [reviewItems, setReviewItems] = useState([]);
  const [comments, setComments] = useState({});
  const [selectedReviewer, setSelectedReviewer] = useState(currentUser?.email || '');

  function getReviewerSystems(reviewerEmail) {
    const systems = [];
    
    Object.entries(mockReviewers?.apps || {}).forEach(([app, reviewer]) => {
      if (reviewer === reviewerEmail) systems.push({ type: 'app', name: app });
    });
    
    Object.entries(mockReviewers?.groups || {}).forEach(([group, reviewer]) => {
      if (reviewer === reviewerEmail) systems.push({ type: 'group', name: group });
    });
    
    Object.entries(mockReviewers?.users || {}).forEach(([user, reviewer]) => {
      if (reviewer === reviewerEmail) systems.push({ type: 'user', name: user });
    });
    
    return systems;
  }

  const allReviewers = [...new Set([
    ...Object.values(mockReviewers?.apps || {}),
    ...Object.values(mockReviewers?.groups || {}),
    ...Object.values(mockReviewers?.users || {})
  ])];

  useEffect(() => {
    const reviewerEmail = showReviewerSelector ? selectedReviewer : currentUser?.email;
    if (!reviewerEmail) return;
    
    const assigned = data.filter(item => {
      return (
        mockReviewers.apps[item.app] === reviewerEmail ||
        mockReviewers.groups[item.group] === reviewerEmail ||
        mockReviewers.users[item.email] === reviewerEmail
      );
    }).filter(item => item.status !== 'rejected');
    
    setReviewItems(assigned);
  }, [selectedReviewer, currentUser, data, showReviewerSelector]);

  function handleReview(itemId, action) {
    const comment = comments[itemId] || '';
    console.log(`${action} item ${itemId} with comment: ${comment}`);
    
    if (onUpdateStatus) {
      const reviewerEmail = showReviewerSelector ? selectedReviewer : currentUser.email;
      onUpdateStatus(itemId, action, reviewerEmail, comment);
    }
    
    setComments({ ...comments, [itemId]: '' });
  }

  const pendingItems = reviewItems.filter(item => item.status === 'pending');
  const reviewerEmail = showReviewerSelector ? selectedReviewer : currentUser?.email;
  const reviewerSystems = getReviewerSystems(reviewerEmail || '');

  return (
    <div className="space-y-6">
      {/* Reviewer Selection (Admin only) */}
      {showReviewerSelector && (
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
      )}

      {/* Reviewer Info */}
      {reviewerEmail && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2" />
            Review Queue for {showReviewerSelector ? selectedReviewer : currentUser?.name}
          </h3>
          <div className="text-sm text-gray-600">
            <p><strong>Responsible for:</strong></p>
            <div className="mt-2 flex flex-wrap gap-2">
              {reviewerSystems.map((system, index) => (
                <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs">
                  {system.type}: {system.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

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
      {reviewItems.length === 0 && reviewerEmail && (
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">All caught up!</h3>
          <p className="mt-1 text-sm text-gray-500">
            No review items are currently assigned to {showReviewerSelector ? selectedReviewer : 'you'}
          </p>
        </div>
      )}

      {/* Select Reviewer Message (Admin only) */}
      {showReviewerSelector && !selectedReviewer && (
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <Users className="mx-auto h-12 w-12 text-blue-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Select a reviewer</h3>
          <p className="mt-1 text-sm text-gray-500">Choose a reviewer from the dropdown above to view their assigned items</p>
        </div>
      )}

      {/* Recently Approved Items */}
      {reviewItems.filter(item => item.status === 'approved').length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-green-600 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" />
              Recently Approved ({reviewItems.filter(item => item.status === 'approved').length})
            </h3>
          </div>
          <div className="p-6">
            <div className="space-y-2">
              {reviewItems.filter(item => item.status === 'approved').map((item) => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                  <div>
                    <span className="font-medium">{item.email}</span>
                    <span className="text-gray-500 ml-2">- {item.app}</span>
                  </div>
                  <span className="text-green-600 text-sm">✓ Approved</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}