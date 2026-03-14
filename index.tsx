
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Debugging: Catch initialization errors
window.onerror = (message, source, lineno, colno, error) => {
  console.error('Fatal App Error:', { message, source, lineno, colno, error });
};

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
