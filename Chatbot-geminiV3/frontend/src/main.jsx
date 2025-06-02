import React from 'react'
import ReactDOM from 'react-dom/client'
import { useAppState } from './contexts/AppStateContext.jsx'; // Correct named import
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { AppStateProvider } from './contexts/AppStateContext.jsx'
import { Toaster } from 'react-hot-toast'; // For notifications
import './index.css' 
import 'prismjs/themes/prism-okaidia.css';
import 'katex/dist/katex.min.css';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-java';


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