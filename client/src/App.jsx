import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import RequireAuth from './components/RequireAuth';
import Landing from './pages/Landing';
import Register from './pages/Register';
import Login from './pages/Login';
import Trips from './pages/Trips';
import ServiceStatus from './pages/ServiceStatus';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/status" element={<ServiceStatus />} />
          <Route
            path="/trips"
            element={
              <RequireAuth>
                <Trips />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
