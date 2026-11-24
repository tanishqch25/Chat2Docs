import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/latin-800.css'

/* The adopted landing format sets its body face in DM Sans and its
   mono labels in DM Mono. Self-hosted like Manrope, so the page makes
   no font request at all. */
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/dm-mono/latin-400.css'
import '@fontsource/dm-mono/latin-500.css'

import './index.css'
import './styles/landing.css'

/* KaTeX's stylesheet, and the faces it names, are loaded once for the whole
   app. Typesetting happens wherever a math block is drawn — the library's
   detail view, the editor, the document modes — not only in the export
   studio, and a formula rendered without these rules is a formula shown as
   badly spaced letters. The runtime that writes the markup stays out of this
   bundle: see the note in `components/documents/block-view.tsx`. */
import 'katex/dist/katex.min.css'

import { AppRouter } from '@/app/router'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root is missing from index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
