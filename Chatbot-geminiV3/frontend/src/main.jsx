// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.jsx'

// createRoot(document.getElementById('root')).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// )
import React from 'react'
import ReactDOM from 'react-dom/client'
import { useAppState } from './contexts/AppStateContext.jsx'; // Correct named import
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { AppStateProvider } from './contexts/AppStateContext.jsx'
import { Toaster } from 'react-hot-toast'; // For notifications
import './index.css' // Tailwind and global styles

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AppStateProvider>
        <App />
        <Toaster position="top-right" reverseOrder={false} />
      </AppStateProvider>
    </AuthProvider>
  </React.StrictMode>,
)