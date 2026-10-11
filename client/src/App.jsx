import { BrowserRouter, Routes, Route } from 'react-router';
import BuildCheck from './pages/BuildCheck';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BuildCheck />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
