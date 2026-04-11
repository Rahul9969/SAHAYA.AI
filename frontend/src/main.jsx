import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

window.addEventListener('error', (e) => {
  // Silence the error overlay by preventing default
  console.error('[Global Error Intercepted]:', e.error || e.message);
  e.preventDefault();
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Rejection Intercepted]:', e.reason);
  e.preventDefault();
});

// Suppress all runtime errors from displaying in browser UI overlays
window.onerror = function() {
  return true; 
};

class GlobalBoundary extends React.Component { 
  constructor(props){super(props);this.state={e:null};} 
  
  static getDerivedStateFromError(e){
    // Return the error to state so we know it happened, 
    // but the renderer will return null below.
    return {e};
  } 
  
  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary Caught:", error, errorInfo);
  }
  
  render(){
    if(this.state.e){
      // Always return null to the screen as requested.
      // The error is already logged to console in componentDidCatch.
      return null;
    }
    return this.props.children;
  } 
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GlobalBoundary>
      <App />
    </GlobalBoundary>
  </React.StrictMode>,
)
