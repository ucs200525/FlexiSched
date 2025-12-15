// frontend/src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Get the root element
const container = document.getElementById('root');

// Only create root if container exists (for better error handling)
if (!container) {
  throw new Error('Root container not found');
}

// Create the React root
const root = ReactDOM.createRoot(container);

// Render the app
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Optional: Add performance monitoring in development
if (process.env.NODE_ENV === 'development') {
  // Log when the app has finished rendering
  setTimeout(() => {
    console.log('✅ App rendered successfully');
  }, 0);
}