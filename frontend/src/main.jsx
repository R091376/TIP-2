import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installVisualViewportSync } from './utils/viewport'

// Pin --app-vh to the visible browser area (login + shell). Must run before paint.
installVisualViewportSync()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
