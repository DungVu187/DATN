import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Toaster } from 'react-hot-toast'
import { OrderProvider } from './context/ordercontext.jsx'
import { CssBaseline, ThemeProvider } from '@mui/material'
import theme from './theme.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <OrderProvider>
        <Toaster />
        <App />
      </OrderProvider>
    </ThemeProvider>
  </StrictMode>,
)
