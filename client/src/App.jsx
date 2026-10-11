import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import RequireAuth from './components/RequireAuth';
import Landing from './pages/Landing';
import Register from './pages/Register';
import Login from './pages/Login';
import Trips from './pages/Trips';
import NewTrip from './pages/NewTrip';
import TripLayout from './pages/trip/TripLayout';
import Overview from './pages/trip/Overview';
import Settings from './pages/trip/Settings';
import ServiceStatus from './pages/ServiceStatus';
import NotFound from './pages/NotFound';

// Pages that need a login are wrapped in RequireAuth (logged-out visitors go to /login?next=...).
const signedIn = (page) => <RequireAuth>{page}</RequireAuth>;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/status" element={<ServiceStatus />} />
          <Route path="/trips" element={signedIn(<Trips />)} />
          <Route path="/trips/new" element={signedIn(<NewTrip />)} />
          <Route path="/trips/:id" element={signedIn(<TripLayout />)}>
            <Route index element={<Overview />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
