import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'

const fallback = document.getElementById('fallback')
if (fallback) fallback.style.display = 'none'

createRoot(document.getElementById('root')!).render(<App />)
