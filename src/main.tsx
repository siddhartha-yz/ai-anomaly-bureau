import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CheatTerminal } from './components/CheatTerminal'
import './styles/app.css'
import './styles/theme-blue-yellow.css'
import './styles/pixel-gameplay.css'
import './styles/experience-layer.css'
import './styles/entry-scene.css'
import './styles/pixel-typography-focus.css'
import './styles/pixel-font-onboarding.css'
import './styles/pixel-terminal-polish.css'
import './styles/phase-cinematics.css'
import './styles/narrative-expansion.css'
import './styles/endless-mode.css'
import './styles/endless-onboarding.css'
import './styles/bureau-hub.css'
import './styles/story-puzzle.css'
import './styles/cheat-terminal.css'
import './styles/lab-v2.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <CheatTerminal />
  </StrictMode>,
)
