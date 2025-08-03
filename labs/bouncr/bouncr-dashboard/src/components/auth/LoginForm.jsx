// components/auth/LoginForm.jsx
import React, { useState } from 'react';
import { Shield } from 'lucide-react';

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
        
        <div className="mt-8 space-y-6">
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
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit(e)}
              />
            </div>
          </div>
          
          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}
          
          <button
            onClick={handleSubmit}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Sign In
          </button>
        </div>
        
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

export default LoginForm;