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
import DayPlan from './pages/trip/DayPlan';
import Members from './pages/trip/Members';
import Money from './pages/trip/Money';
import Explore from './pages/trip/Explore';
import Join from './pages/Join';
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
          <Route path="/join/:code" element={<Join />} />
          <Route path="/trips" element={signedIn(<Trips />)} />
          <Route path="/trips/new" element={signedIn(<NewTrip />)} />
          <Route path="/trips/:id" element={signedIn(<TripLayout />)}>
            <Route index element={<Overview />} />
            <Route path="plan" element={<DayPlan />} />
            <Route path="explore" element={<Explore />} />
            <Route path="money" element={<Money />} />
            <Route path="members" element={<Members />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
