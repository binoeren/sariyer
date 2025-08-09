import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import AdminDashboard from './components/admin/AdminDashboard';
import DriverDashboard from './components/driver/DriverDashboard';
import { Loader } from 'lucide-react';

const ProtectedRoute: React.FC<{ 
  children: React.ReactNode;
  requiredRole?: 'depo' | 'sofor';
}> = ({ children, requiredRole }) => {
  const { currentUser, userData } = useAuth();

  if (!currentUser || !userData) {
    return <Navigate to="/login" />;
  }

  if (requiredRole && userData.role !== requiredRole) {
    return <Navigate to={userData.role === 'depo' ? '/admin' : '/driver'} />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { currentUser, userData, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Kullanıcı giriş yapmamışsa login sayfasına yönlendir
  if (!currentUser) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={location.pathname !== '/login' ? <Navigate to="/login" replace /> : <Login />} />
      </Routes>
    );
  }

  // Kullanıcı giriş yapmışsa role göre yönlendir
  const targetPath = userData?.role === 'depo' ? '/admin' : '/driver';
  
  return (
    <Routes>
      <Route 
        path="/login" 
        element={location.pathname !== targetPath ? <Navigate to={targetPath} replace /> : userData?.role === 'depo' ? <AdminDashboard /> : <DriverDashboard />} 
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="depo">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/driver"
        element={
          <ProtectedRoute requiredRole="sofor">
            <DriverDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={location.pathname !== targetPath ? <Navigate to={targetPath} replace /> : userData?.role === 'depo' ? <AdminDashboard /> : <DriverDashboard />}
      />
      <Route path="*" element={location.pathname !== targetPath ? <Navigate to={targetPath} replace /> : userData?.role === 'depo' ? <AdminDashboard /> : <DriverDashboard />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
