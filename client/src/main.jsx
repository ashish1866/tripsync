import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Typefaces, self-hosted and bundled by Vite (see docs/DESIGN-DECISIONS.md).
// "standard" includes the width axis, which gives the condensed milestone lettering.
import '@fontsource-variable/anek-latin/standard.css';
import '@fontsource-variable/anek-devanagari/standard.css';
import '@fontsource/mukta/400.css';
import '@fontsource/mukta/500.css';
import '@fontsource/mukta/700.css';

import './styles/tokens.css';
import './styles/global.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
