
import './App.css';

// Import hooks and auth
import { useAuth } from './components/auth/useAuth';

// Import components - Use your existing dashboards
import LoginForm from './components/auth/LoginForm';
import AdminDashboard from './components/admin/AdminDashboard';
import ReviewerDashboard from './components/reviewer/ReviewerDashboard';
import ViewerDashboard from './components/viewer/ViewerDashboard';

// Loading component
const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">Loading Bouncr...</p>
    </div>
  </div>
);

// Main App Component
function App() {
  const { user, login, logout, isLoading } = useAuth();
  
  if (isLoading) return <LoadingScreen />;
  if (!user) return <LoginForm onLogin={login} />;
  
  // Route to appropriate dashboard based on user role
  switch (user.role) {
    case 'admin':
      return <AdminDashboard user={user} onLogout={logout} />;
    case 'reviewer':
      return <ReviewerDashboard user={user} onLogout={logout} />;
    case 'viewer':
      return <ViewerDashboard user={user} onLogout={logout} />;
    default:
      return <LoginForm onLogin={login} />;
  }
}

export default App;
