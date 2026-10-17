import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './shadcn.css'
import 'highlight.js/styles/github.css'
import App from './App.tsx'
import { hydrateStateFromServer } from './shared/services/stateSync'

void hydrateStateFromServer()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
