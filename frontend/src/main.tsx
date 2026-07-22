import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
// Import the API barrel so its endpoint tag enhancements (api/index.ts) are applied
// before any component mounts.
import '@/src/api'
import App from '@/src/App.tsx'
import { store } from '@/src/app/store'
import { AuthProvider } from '@/src/auth/AuthContext'
import { I18nProvider } from '@/src/i18n/I18nContext'
import { ThemeProvider } from '@/src/theme/ThemeContext'
import '@/src/index.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <Provider store={store}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </Provider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
