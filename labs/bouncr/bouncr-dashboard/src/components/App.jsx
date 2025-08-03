// App.jsx - Main Router
function App() {
    const { user, login, logout, isLoading } = useAuth();
    
    if (isLoading) return <LoadingScreen />;
    if (!user) return <LoginForm onLogin={login} />;
    
    // Route to appropriate dashboard
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
  
  // components/admin/AdminDashboard.jsx
  function AdminDashboard({ user, onLogout }) {
    const [activeTab, setActiveTab] = useState('audit');
    const [data, setData] = useState(mockUsers);
    
    return (
      <div className="min-h-screen bg-gray-50">
        <Header user={user} onLogout={onLogout} />
        <main className="max-w-7xl mx-auto py-6">
          <AccessConstellationMap data={data} />
          <MetricsCards data={data} />
          <AdminTabs activeTab={activeTab} setActiveTab={setActiveTab} data={data} />
        </main>
      </div>
    );
  }
  
  // components/reviewer/ReviewerDashboard.jsx  
  function ReviewerDashboard({ user, onLogout }) {
    const filteredData = useReviewerData(user.email);
    
    return (
      <div className="min-h-screen bg-gray-50">
        <Header user={user} onLogout={onLogout} />
        <main className="max-w-7xl mx-auto py-6">
          <AccessConstellationMap 
            data={filteredData} 
            hideViewSelector={true}
          />
          <MetricsCards data={filteredData} />
          <ReviewerQueue data={filteredData} currentUser={user} />
        </main>
      </div>
    );
  }
  