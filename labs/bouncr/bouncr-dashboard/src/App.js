
import React, { useState, useEffect, useRef } from 'react';
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
  AlertTriangle,
  Filter
} from 'lucide-react';

// Mock data
const mockUsers = [
  { id: 1, email: 'alex@acme.com', app: 'GitHub', group: 'engineering', lastLogin: '2024-05-01', status: 'pending', reasons: 'Inactive for more than 45 days' },
  { id: 2, email: 'sam@acme.com', app: 'GitHub', group: 'marketing', lastLogin: '2024-07-25', status: 'approved', reasons: 'Privileged role: Admin' },
  { id: 3, email: 'jane@acme.com', app: 'Salesforce', group: 'sales', lastLogin: '2024-03-15', status: 'pending', reasons: 'Inactive for more than 45 days; Privileged role' },
  { id: 4, email: 'mike@acme.com', app: 'Slack', group: 'engineering', lastLogin: '2024-07-20', status: 'rejected', reasons: 'Orphaned account' },
  { id: 5, email: 'sarah@acme.com', app: 'Jira', group: 'product', lastLogin: '2024-06-10', status: 'pending', reasons: 'Privileged role: DevOps' },
  { id: 6, email: 'emma@acme.com', app: 'Asana', group: 'product', lastLogin: '2024-06-01', status: 'pending', reasons: 'Inactive for more than 45 days' },
  { id: 7, email: 'dan@acme.com', app: 'Notion', group: 'marketing', lastLogin: '2024-07-22', status: 'approved', reasons: 'Normal activity' },
  { id: 8, email: 'lisa@acme.com', app: 'Salesforce', group: 'sales', lastLogin: '2024-06-05', status: 'approved', reasons: 'Privileged role: Sales Manager' },
  { id: 9, email: 'steve@acme.com', app: 'GitHub', group: 'engineering', lastLogin: '2024-05-15', status: 'pending', reasons: 'Stale reviewer assignment' },
  { id: 10, email: 'brenda@acme.com', app: 'Slack', group: 'support', lastLogin: '2024-07-10', status: 'approved', reasons: 'Standard user' },
  { id: 11, email: 'raj@acme.com', app: 'Datadog', group: 'devops', lastLogin: '2024-04-18', status: 'pending', reasons: 'Orphaned account' },
  { id: 12, email: 'nina@acme.com', app: 'GitHub', group: 'design', lastLogin: '2024-07-30', status: 'approved', reasons: 'Privileged role: Design Lead' },
  { id: 13, email: 'omar@acme.com', app: 'Jira', group: 'qa', lastLogin: '2024-07-01', status: 'pending', reasons: 'Privileged role: Test Admin' },
  { id: 14, email: 'claire@acme.com', app: 'Salesforce', group: 'finance', lastLogin: '2024-07-15', status: 'approved', reasons: 'Normal usage' },
  { id: 15, email: 'kevin@acme.com', app: 'Confluence', group: 'product', lastLogin: '2024-06-18', status: 'pending', reasons: 'Privileged role' },
  { id: 16, email: 'george@acme.com', app: 'Slack', group: 'legal', lastLogin: '2024-05-30', status: 'rejected', reasons: 'Inactive for more than 60 days' },
  { id: 17, email: 'irene@acme.com', app: 'Okta', group: 'security', lastLogin: '2024-07-29', status: 'approved', reasons: 'Privileged role: IAM Admin' },
  { id: 18, email: 'leo@acme.com', app: 'Zoom', group: 'operations', lastLogin: '2024-07-19', status: 'pending', reasons: 'Privileged role: Scheduler' },
  { id: 19, email: 'ella@acme.com', app: 'GitHub', group: 'engineering', lastLogin: '2024-06-28', status: 'approved', reasons: 'Standard usage' },
  { id: 20, email: 'mark@acme.com', app: 'Salesforce', group: 'sales', lastLogin: '2024-03-01', status: 'rejected', reasons: 'Privileged role; Inactive for more than 90 days' },
];


const mockReviewers = {
  apps: {
    'GitHub': 'alice@company.com',
    'Jira': 'eng-lead@company.com',
    'Salesforce': 'john@company.com',
    'Slack': 'ops-lead@company.com',
    'Okta': 'sec-lead@company.com',
    'Figma': 'design-head@company.com',
    'Confluence': 'product-head@company.com',
    'Zoom': 'ops-coordinator@company.com',
    'Asana': 'pm-lead@company.com',
    'Notion': 'marketing-lead@company.com',
  },
  groups: {
    'engineering': 'alice@company.com',
    'product': 'product-head@company.com',
    'marketing': 'marketing-lead@company.com',
    'sales': 'john@company.com',
    'support': 'ops-lead@company.com',
    'devops': 'eng-lead@company.com',
    'design': 'design-head@company.com',
    'qa': 'qa-lead@company.com',
    'finance': 'cfo@company.com',
    'security': 'sec-lead@company.com',
    'legal': 'compliance@company.com',
    'operations': 'ops-coordinator@company.com',
  },
  users: {
    'alex@acme.com': 'alice@company.com',
    'jane@acme.com': 'john@company.com',
    'sarah@acme.com': 'eng-lead@company.com',
    'emma@acme.com': 'pm-lead@company.com',
    'irene@acme.com': 'sec-lead@company.com',
  }
};


// Authentication Hook
function useAuth() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('bouncr_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  function login(username, password) {
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
  }

  function logout() {
    setUser(null);
    localStorage.removeItem('bouncr_user');
    window.location.reload();
  }

  function hasPermission(permission) {
    return user?.permissions?.includes('all') || user?.permissions?.includes(permission);
  }

  return { user, login, logout, hasPermission, isLoading };
}

// Access Constellation Map Component
function AccessConstellationMap({ 
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
      .filter(item => item.status !== 'rejected')
      .forEach(item => {
        if (!groupedData[item.group]) {
          groupedData[item.group] = {
            name: item.group,
            color: getGroupColor(item.group),
            users: []
          };
        }
        
        let user = groupedData[item.group].users.find(u => u.email === item.email);
        if (!user) {
          user = {
            id: item.id,
            name: item.email.split('@')[0],
            role: determineRole(item),
            accessLevel: getAccessLevel(item),
            usage: Math.floor(Math.random() * 100),
            email: item.email,
            lastLogin: item.lastLogin,
            apps: [],
            alert: item.status === 'pending',
            status: item.status,
            reasons: item.reasons,
            standingColor: getStandingColor(item)
          };
          groupedData[item.group].users.push(user);
        }
        
        if (!user.apps.includes(item.app)) {
          user.apps.push(item.app);
        }
      });
    
    return { groups: Object.values(groupedData) };
  }

  function getStandingColor(item) {
    if (item.status === 'pending') return '#ff6b6b';
    if (item.reasons.includes('Privileged') || item.reasons.includes('Admin')) return '#ffe066';
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
    return colors[groupName.toLowerCase()] || "#64c8ff";
  }

  function determineRole(item) {
    if (item.reasons.includes('Privileged role')) {
      return item.reasons.includes('Admin') ? 'Admin' : 'Group Leader';
    }
    return 'Member';
  }

  function getAccessLevel(item) {
    if (item.status === 'approved' && !item.reasons.includes('Privileged')) return 4;
    if (item.status === 'approved' && item.reasons.includes('Privileged')) return 3;
    if (item.status === 'pending' && !item.reasons.includes('Privileged')) return 2;
    return 1;
  }

  function getFilteredData() {
    const sourceData = transformDataForConstellation(data);
    if (currentView === 'all') return sourceData;
    
    return {
      groups: sourceData.groups.filter(g => 
        g.name.toLowerCase() === currentView.toLowerCase()
      )
    };
  }

  function calculateMetrics(filteredData) {
    const totalUsers = filteredData.groups.reduce((sum, group) => sum + group.users.length, 0);
    const pendingUsers = filteredData.groups.reduce((sum, group) => 
      sum + group.users.filter(u => u.alert).length, 0
    );
    const riskyUsers = filteredData.groups.reduce((sum, group) => 
      sum + group.users.filter(u => u.reasons.includes('Privileged') || u.reasons.includes('Admin')).length, 0
    );

    onMetricsUpdate({
      totalMembers: totalUsers,
      pending: pendingUsers,
      risks: riskyUsers
    });
  }

  function getUserPosition(user, groupIndex, userIndex, totalGroups) {
    const groupAngle = (groupIndex / totalGroups) * 2 * Math.PI;
    const groupRadius = 150;
    const centerX = 400;
    const centerY = 300;
    
    const groupCenterX = centerX + Math.cos(groupAngle) * groupRadius;
    const groupCenterY = centerY + Math.sin(groupAngle) * groupRadius;
    
    // Use consistent positioning - removed random for stable positions
    const userAngle = (userIndex / Math.max(4, userIndex + 1)) * 2 * Math.PI;
    const userRadius = (user.accessLevel / 4) * 80;
    
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
    
    filteredData.groups.forEach((group, groupIndex) => {
      const groupBoundary = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const groupPos = getUserPosition({accessLevel: 0}, groupIndex, 0, filteredData.groups.length);
      groupBoundary.setAttribute("cx", groupPos.x);
      groupBoundary.setAttribute("cy", groupPos.y);
      groupBoundary.setAttribute("r", "100");
      groupBoundary.setAttribute("fill", "rgba(100, 200, 255, 0.05)");
      groupBoundary.setAttribute("stroke", group.color);
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
      label.setAttribute("fill", group.color);
      label.setAttribute("font-size", "14");
      label.setAttribute("font-weight", "bold");
      label.textContent = group.name.charAt(0).toUpperCase() + group.name.slice(1);
      svg.appendChild(label);
      
      // Users
      group.users.forEach((user, userIndex) => {
        const pos = getUserPosition(user, groupIndex, userIndex, filteredData.groups.length);
        const nodeSize = Math.max(8, user.usage / 8);
        
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
        userNode.setAttribute("fill", user.standingColor);
        userNode.setAttribute("stroke", "white");
        userNode.setAttribute("stroke-width", selectedUser?.id === user.id ? "3" : "1");
        userNode.style.cursor = "pointer";
        userNode.style.filter = `drop-shadow(0 0 6px ${user.standingColor})`;
        
        if (user.alert) {
          const animate = document.createElementNS("http://www.w3.org/2000/svg", "animate");
          animate.setAttribute("attributeName", "fill");
          animate.setAttribute("values", `${user.standingColor};#ff4757;${user.standingColor}`);
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
        initials.textContent = user.name.substring(0, 2).toUpperCase();
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
            <h3 className="font-bold text-blue-300 mb-2">{selectedUser.name}</h3>
            <div className="space-y-1">
              <div><strong>Role:</strong> {selectedUser.role}</div>
              <div><strong>Email:</strong> {selectedUser.email}</div>
              <div><strong>Apps:</strong> {selectedUser.apps?.join(', ')}</div>
              <div><strong>Status:</strong> {selectedUser.status}</div>
              {selectedUser.alert && (
                <div className="text-red-400 font-semibold mt-2">⚠️ {selectedUser.reasons}</div>
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
            <div className="font-semibold text-blue-300">{hoveredUser.name}</div>
            <div>{hoveredUser.role} • {hoveredUser.status}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Other components...
function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const demoUsers = [
    { username: 'admin', password: 'admin123', role: 'Administrator' },
    { username: 'alice', password: 'alice123', role: 'Reviewer' },
    { username: 'john', password: 'john123', role: 'Reviewer' },
    { username: 'viewer', password: 'viewer123', role: 'Viewer' }
  ];

  function handleSubmit(e) {
    e.preventDefault();
    if (onLogin(username, password)) {
      setError('');
    } else {
      setError('Invalid credentials');
    }
  }

  function handleDemoUser(demoUser) {
    setUsername(demoUser.username);
    setPassword(demoUser.password);
  }

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
}

function Header({ user, onLogout }) {
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
}

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

// Simple placeholder components for tabs
function AuditExplorer({ data }) {
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

function ReviewerQueue({ data, currentUser, onUpdateStatus }) {
  const [reviewItems, setReviewItems] = useState([]);
  const [comments, setComments] = useState({});

  function getReviewerSystems(reviewerEmail) {
    const systems = [];
    
    Object.entries(mockReviewers.apps).forEach(([app, reviewer]) => {
      if (reviewer === reviewerEmail) systems.push({ type: 'app', name: app });
    });
    
    Object.entries(mockReviewers.groups).forEach(([group, reviewer]) => {
      if (reviewer === reviewerEmail) systems.push({ type: 'group', name: group });
    });
    
    Object.entries(mockReviewers.users).forEach(([user, reviewer]) => {
      if (reviewer === reviewerEmail) systems.push({ type: 'user', name: user });
    });
    
    return systems;
  }

  useEffect(() => {
    if (!currentUser?.email) return;
    
    const assigned = data.filter(item => {
      return (
        mockReviewers.apps[item.app] === currentUser.email ||
        mockReviewers.groups[item.group] === currentUser.email ||
        mockReviewers.users[item.email] === currentUser.email
      );
    }).filter(item => item.status !== 'rejected');
    
    setReviewItems(assigned);
  }, [currentUser, data]);

  function handleReview(itemId, action) {
    const comment = comments[itemId] || '';
    console.log(`${action} item ${itemId} with comment: ${comment}`);
    
    if (onUpdateStatus) {
      onUpdateStatus(itemId, action, currentUser.email, comment);
    }
    
    setComments({ ...comments, [itemId]: '' });
  }

  const pendingItems = reviewItems.filter(item => item.status === 'pending');
  const reviewerSystems = getReviewerSystems(currentUser?.email || '');

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-4 flex items-center">
          <Users className="w-5 h-5 mr-2" />
          Review Queue for {currentUser?.name}
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

      {reviewItems.length === 0 && (
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">All caught up!</h3>
          <p className="mt-1 text-sm text-gray-500">No review items are currently assigned to you</p>
        </div>
      )}

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

// Main Dashboard Component
function Dashboard() {
  const { user, login, logout, hasPermission, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('audit');
  const [data, setData] = useState(mockUsers);
  const [constellationMetrics, setConstellationMetrics] = useState(null);

  useEffect(() => {
    if (user) {
      if (user.role === 'reviewer') {
        setActiveTab('reviewer');
      } else {
        setActiveTab('audit');
      }
    }
  }, [user]);

  function getConstellationViewFilter() {
    if (user?.role === 'reviewer') {
      const reviewerEmail = user.email;
      const responsibleGroups = Object.entries(mockReviewers.groups)
        .filter(([group, reviewer]) => reviewer === reviewerEmail)
        .map(([group]) => group);
      
      return responsibleGroups.length > 0 ? responsibleGroups[0] : 'all';
    }
    return 'all';
  }

  function getFilteredDataForRole() {
    if (user?.role === 'reviewer') {
      const reviewerEmail = user.email;
      return data.filter(item => {
        return (
          mockReviewers.apps[item.app] === reviewerEmail ||
          mockReviewers.groups[item.group] === reviewerEmail ||
          mockReviewers.users[item.email] === reviewerEmail
        );
      });
    }
    return data;
  }

  function handleUpdateStatus(itemId, status, reviewer, comments) {
    setData(data.map(item => 
      item.id === itemId 
        ? { ...item, status, reviewer, comments }
        : item
    ));
  }

  function handleUserClick(user, group) {
    console.log('User clicked in constellation:', user, group);
  }

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

  // Reviewer UI
  if (user.role === 'reviewer') {
    const filteredData = getFilteredDataForRole();
    const viewFilter = getConstellationViewFilter();
    
    return (
      <div className="min-h-screen bg-gray-50">
        <Header user={user} onLogout={logout} />
        
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <AccessConstellationMap 
            data={filteredData}
            viewFilter={viewFilter}
            onMetricsUpdate={setConstellationMetrics}
            onUserClick={handleUserClick}
            hideViewSelector={true}
          />
          
          <MetricsCards data={filteredData} constellationMetrics={constellationMetrics} />
          
          <div className="px-4 sm:px-0">
            <ReviewerQueue 
              data={filteredData} 
              currentUser={user} 
              onUpdateStatus={handleUpdateStatus}
            />
          </div>
        </main>
      </div>
    );
  }

  // Admin UI
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
        <AccessConstellationMap 
          data={data}
          onMetricsUpdate={setConstellationMetrics}
          onUserClick={handleUserClick}
        />
        
        <MetricsCards data={data} constellationMetrics={constellationMetrics} />
        
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
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">Config Editor</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex">
                  <Settings className="h-5 w-5 text-blue-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">Configuration Management</h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>Configure global settings, review thresholds, notification preferences, and backup schedules.</p>
                      <p className="mt-2">Features include: TTL settings, risky role definitions, ignored apps/groups, and reviewer assignments.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'export' && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">Export & Logs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-3">Export Options</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>• CSV/JSON/Excel export of review data</p>
                    <p>• Configuration backup reports</p>
                    <p>• Audit trail documentation</p>
                    <p>• Compliance reporting</p>
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-3">System Logs</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>• User access events</p>
                    <p>• Review decisions audit</p>
                    <p>• Configuration changes</p>
                    <p>• System performance metrics</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'users' && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">User Management</h3>
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <Users className="h-5 w-5 text-green-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">User Administration</h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>Manage system users, roles, and permissions for the Bouncr dashboard.</p>
                      <p className="mt-2">Features include: Add/remove users, assign reviewer roles, configure permission levels, and manage authentication.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;

