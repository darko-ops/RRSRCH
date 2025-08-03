// hooks/useAuth.js
import { useState, useEffect } from 'react';

export function useAuth() {
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