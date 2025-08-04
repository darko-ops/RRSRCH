// components/shared/AccessConstellationMap.jsx
import React, { useState, useEffect, useRef } from 'react';

export function AccessConstellationMap({ 
  data, 
  viewFilter = 'all',
  onMetricsUpdate = () => {},
  onUserClick = () => {},
  hideViewSelector = false
}) {
  const containerRef = useRef();
  const [showConnections, setShowConnections] = useState(true);
  const [currentView, setCurrentView] = useState(viewFilter);
  const [selectedUser, setSelectedUser] = useState(null);
  const [hoveredUser, setHoveredUser] = useState(null);

  function transformDataForConstellation(rawData) {
    const groupedData = {};
    
    rawData
      .filter(item => item && item.status !== 'rejected')
      .forEach(item => {
        const groupName = item.group || 'unknown';
        if (!groupedData[groupName]) {
          groupedData[groupName] = {
            name: groupName,
            color: getGroupColor(groupName),
            users: []
          };
        }
        
        let user = groupedData[groupName].users.find(u => u.email === (item.email || ''));
        if (!user) {
          user = {
            id: item.id || Math.random().toString(36),
            name: item.email ? item.email.split('@')[0] : 'unknown',
            role: determineRole(item),
            accessLevel: getAccessLevel(item),
            usage: Math.floor(Math.random() * 100),
            email: item.email || 'unknown@unknown.com',
            lastLogin: item.lastLogin || 'unknown',
            apps: [],
            alert: item.status === 'pending',
            status: item.status || 'unknown',
            reasons: item.reasons || 'No reason provided',
            standingColor: getStandingColor(item)
          };
          groupedData[groupName].users.push(user);
        }
        
        if (item.app && !user.apps.includes(item.app)) {
          user.apps.push(item.app);
        }
      });
    
    return { groups: Object.values(groupedData) };
  }

  function getStandingColor(item) {
    if (!item) return '#4ecdc4';
    if (item.status === 'pending') return '#ff6b6b';
    const reasons = item.reasons || '';
    if (reasons.includes && (reasons.includes('Privileged') || reasons.includes('Admin'))) return '#ffe066';
    return '#4ecdc4';
  }

  function getGroupColor(groupName) {
    const colors = {
      "engineering": "#ff6b6b",
      "marketing": "#ffe066",
      "sales": "#4ecdc4",
      "product": "#a55eea",
      "finance": "#26de81"
    };
    const safeName = (groupName || '').toLowerCase();
    return colors[safeName] || "#64c8ff";
  }

  function determineRole(item) {
    if (!item || !item.reasons) return 'Member';
    const reasons = item.reasons;
    if (reasons.includes && reasons.includes('Privileged role')) {
      return (reasons.includes('Admin')) ? 'Admin' : 'Group Leader';
    }
    return 'Member';
  }

  function getAccessLevel(item) {
    if (!item) return 1;
    const reasons = item.reasons || '';
    if (item.status === 'approved' && (!reasons.includes || !reasons.includes('Privileged'))) return 4;
    if (item.status === 'approved' && (reasons.includes && reasons.includes('Privileged'))) return 3;
    if (item.status === 'pending' && (!reasons.includes || !reasons.includes('Privileged'))) return 2;
    return 1;
  }

  function getFilteredData() {
    const sourceData = transformDataForConstellation(data || []);
    if (currentView === 'all') return sourceData;
    
    return {
      groups: sourceData.groups.filter(g => 
        (g.name || '').toLowerCase() === (currentView || '').toLowerCase()
      )
    };
  }

  function calculateMetrics(filteredData) {
    const totalUsers = filteredData.groups.reduce((sum, group) => sum + (group.users || []).length, 0);
    const pendingUsers = filteredData.groups.reduce((sum, group) => 
      sum + (group.users || []).filter(u => u.alert).length, 0
    );
    const riskyUsers = filteredData.groups.reduce((sum, group) => 
      sum + (group.users || []).filter(u => {
        const reasons = u.reasons || '';
        return reasons.includes && (reasons.includes('Privileged') || reasons.includes('Admin'));
      }).length, 0
    );

    onMetricsUpdate({
      totalMembers: totalUsers,
      pending: pendingUsers,
      risks: riskyUsers
    });
  }

  function getUserPosition(user, groupIndex, userIndex, totalGroups) {
    const groupAngle = (groupIndex / Math.max(1, totalGroups)) * 2 * Math.PI;
    const groupRadius = 150;
    const centerX = 400;
    const centerY = 300;
    
    const groupCenterX = centerX + Math.cos(groupAngle) * groupRadius;
    const groupCenterY = centerY + Math.sin(groupAngle) * groupRadius;
    
    // Consistent positioning without random
    const userAngle = (userIndex / Math.max(4, userIndex + 1)) * 2 * Math.PI;
    const userRadius = ((user.accessLevel || 1) / 4) * 80;
    
    return {
      x: groupCenterX + Math.cos(userAngle) * userRadius,
      y: groupCenterY + Math.sin(userAngle) * userRadius
    };
  }

  function handleUserClick(user, group) {
    setSelectedUser(user);
    onUserClick(user, group);
  }

  function simulateReview() {
    alert('Simulated review completion - some pending items would be resolved');
  }

  useEffect(() => {
    const filteredData = getFilteredData();
    calculateMetrics(filteredData);
    drawConstellation(filteredData);
  }, [currentView, showConnections, data]);

  function drawConstellation(filteredData) {
    if (!containerRef.current) return;
    
    containerRef.current.innerHTML = '';
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "500");
    svg.setAttribute("viewBox", "0 0 800 500");
    svg.style.background = "radial-gradient(circle at center, #1a1f3a 0%, #0a0e1a 100%)";
    
    // Add stars
    for (let i = 0; i < 30; i++) {
      const star = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      star.setAttribute("cx", Math.random() * 800);
      star.setAttribute("cy", Math.random() * 500);
      star.setAttribute("r", Math.random() * 1.5);
      star.setAttribute("fill", "rgba(255, 255, 255, 0.3)");
      svg.appendChild(star);
    }
    
    (filteredData.groups || []).forEach((group, groupIndex) => {
      const groupBoundary = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const groupPos = getUserPosition({accessLevel: 0}, groupIndex, 0, filteredData.groups.length);
      groupBoundary.setAttribute("cx", groupPos.x);
      groupBoundary.setAttribute("cy", groupPos.y);
      groupBoundary.setAttribute("r", "100");
      groupBoundary.setAttribute("fill", "rgba(100, 200, 255, 0.05)");
      groupBoundary.setAttribute("stroke", group.color || "#64c8ff");
      groupBoundary.setAttribute("stroke-width", "2");
      groupBoundary.setAttribute("stroke-dasharray", "3,3");
      svg.appendChild(groupBoundary);
      
      // Access rings
      for (let ring = 1; ring <= 4; ring++) {
        const accessRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        accessRing.setAttribute("cx", groupPos.x);
        accessRing.setAttribute("cy", groupPos.y);
        accessRing.setAttribute("r", ring * 20);
        accessRing.setAttribute("fill", "none");
        accessRing.setAttribute("stroke", "rgba(255, 255, 255, 0.1)");
        accessRing.setAttribute("stroke-width", "1");
        accessRing.setAttribute("stroke-dasharray", "5,5");
        svg.appendChild(accessRing);
      }
      
      // Group label
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", groupPos.x);
      label.setAttribute("y", groupPos.y - 120);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", group.color || "#64c8ff");
      label.setAttribute("font-size", "14");
      label.setAttribute("font-weight", "bold");
      const groupName = group.name || 'unknown';
      label.textContent = groupName.charAt(0).toUpperCase() + groupName.slice(1);
      svg.appendChild(label);
      
      // Users
      (group.users || []).forEach((user, userIndex) => {
        const pos = getUserPosition(user, groupIndex, userIndex, filteredData.groups.length);
        const nodeSize = Math.max(8, (user.usage || 50) / 8);
        
        // Alert indicator
        if (user.alert) {
          const alertCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          alertCircle.setAttribute("cx", pos.x);
          alertCircle.setAttribute("cy", pos.y);
          alertCircle.setAttribute("r", nodeSize + 4);
          alertCircle.setAttribute("fill", "#ff6b6b");
          alertCircle.setAttribute("opacity", "0.7");
          
          const animate = document.createElementNS("http://www.w3.org/2000/svg", "animate");
          animate.setAttribute("attributeName", "opacity");
          animate.setAttribute("values", "0.3;1;0.3");
          animate.setAttribute("dur", "2s");
          animate.setAttribute("repeatCount", "indefinite");
          alertCircle.appendChild(animate);
          svg.appendChild(alertCircle);
        }
        
        // Main user node
        const userNode = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        userNode.setAttribute("cx", pos.x);
        userNode.setAttribute("cy", pos.y);
        userNode.setAttribute("r", nodeSize);
        userNode.setAttribute("fill", user.standingColor || "#4ecdc4");
        userNode.setAttribute("stroke", "white");
        userNode.setAttribute("stroke-width", selectedUser?.id === user.id ? "3" : "1");
        userNode.style.cursor = "pointer";
        userNode.style.filter = `drop-shadow(0 0 6px ${user.standingColor || "#4ecdc4"})`;
        
        if (user.alert) {
          const animate = document.createElementNS("http://www.w3.org/2000/svg", "animate");
          animate.setAttribute("attributeName", "fill");
          animate.setAttribute("values", `${user.standingColor || "#4ecdc4"};#ff4757;${user.standingColor || "#4ecdc4"}`);
          animate.setAttribute("dur", "1.5s");
          animate.setAttribute("repeatCount", "indefinite");
          userNode.appendChild(animate);
        }
        
        userNode.addEventListener("click", () => handleUserClick(user, group));
        userNode.addEventListener("mouseenter", () => setHoveredUser(user));
        userNode.addEventListener("mouseleave", () => setHoveredUser(null));
        
        svg.appendChild(userNode);
        
        // User initials
        const initials = document.createElementNS("http://www.w3.org/2000/svg", "text");
        initials.setAttribute("x", pos.x);
        initials.setAttribute("y", pos.y + 3);
        initials.setAttribute("text-anchor", "middle");
        initials.setAttribute("fill", "white");
        initials.setAttribute("font-size", Math.max(8, nodeSize / 2));
        initials.setAttribute("font-weight", "bold");
        initials.style.pointerEvents = "none";
        const userName = user.name || 'UN';
        initials.textContent = userName.substring(0, 2).toUpperCase();
        svg.appendChild(initials);
      });
    });
    
    containerRef.current.appendChild(svg);
  }

  return (
    <div className="bg-white rounded-lg shadow mb-6">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">🌟 Access Overview</h2>
          {!hideViewSelector && (
            <div className="flex items-center gap-4">
              <select 
                value={currentView}
                onChange={(e) => setCurrentView(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              >
                <option value="all">All Teams</option>
                <option value="engineering">Engineering</option>
                <option value="marketing">Marketing</option>
                <option value="sales">Sales</option>
                <option value="product">Product</option>
              </select>
              <button
                onClick={() => setShowConnections(!showConnections)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {showConnections ? 'Hide' : 'Show'} Lines
              </button>
              <button
                onClick={simulateReview}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Complete Reviews
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="relative" style={{background: 'radial-gradient(circle at center, #1a1f3a 0%, #0a0e1a 100%)'}}>
        <div ref={containerRef} className="w-full" style={{minHeight: '500px'}} />
        
        {/* Legend */}
        <div className="absolute top-4 right-4 bg-black bg-opacity-80 border border-blue-400 rounded-lg p-4 text-sm text-white">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#4ecdc4'}}></div>
              <span>Good Standing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#ffe066'}}></div>
              <span>Risky Access</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#ff6b6b'}}></div>
              <span>Needs Review</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-600 text-xs text-gray-300">
            <div><strong>Size:</strong> Usage</div>
            <div><strong>Distance:</strong> Access Level</div>
            <div><strong>Blinking:</strong> Pending</div>
          </div>
        </div>
        
        {/* User Details Panel */}
        {selectedUser && (
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-90 border border-blue-400 rounded-lg p-4 text-sm max-w-sm text-white">
            <h3 className="font-bold text-blue-300 mb-2">{selectedUser.name || 'Unknown User'}</h3>
            <div className="space-y-1">
              <div><strong>Role:</strong> {selectedUser.role || 'Unknown'}</div>
              <div><strong>Email:</strong> {selectedUser.email || 'Unknown'}</div>
              <div><strong>Apps:</strong> {(selectedUser.apps || []).join(', ') || 'None'}</div>
              <div><strong>Status:</strong> {selectedUser.status || 'Unknown'}</div>
              {selectedUser.alert && (
                <div className="text-red-400 font-semibold mt-2">⚠️ {selectedUser.reasons || 'Needs review'}</div>
              )}
            </div>
            <button
              onClick={() => setSelectedUser(null)}
              className="mt-3 px-2 py-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        )}
        
        {/* Hover Tooltip */}
        {hoveredUser && !selectedUser && (
          <div className="absolute top-4 left-4 bg-black bg-opacity-90 border border-blue-400 rounded-lg p-3 text-sm pointer-events-none text-white">
            <div className="font-semibold text-blue-300">{hoveredUser.name || 'Unknown User'}</div>
            <div>{(hoveredUser.role || 'Unknown')} • {(hoveredUser.status || 'Unknown')}</div>
          </div>
        )}
      </div>
    </div>
  );
}