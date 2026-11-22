import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import * as React from 'react'

import { SiteLayout } from '@/app/site-layout'
import { Container } from '@/components/layout/container'
import { ComingSoonPage } from '@/pages/coming-soon-page'
import { DocumentsPage } from '@/pages/documents-page'
import { ImportPage } from '@/pages/import-page'
import { LandingPage } from '@/pages/landing-page'

/**
 * The whole route map from the product brief is declared here, so
 * navigation and the footer already resolve. `/`, `/documents`, `/import`,
 * `/export/:documentId`, `/editor/:documentId` and `/transform/:documentId`
 * are built; the rest render an honest state until their milestone arrives.
 *
 * The export studio, the editor and the transform are the three routes loaded
 * on demand. The first carries the typesetting of a document — KaTeX and its
 * faces, and the libraries that write a .docx — the second carries the word
 * processor, TipTap. Neither belongs in the bundle a first visitor downloads
 * to read the landing page, and each arrives only when it is asked for. The
 * transform is split too: it is opt-in software, and a visitor who never uses
 * an AI mode should not pay for its code.
 *
 * There is no sign-in or sign-up route. PromptPaper is planned as a
 * product you use without an account, so those addresses are not
 * reserved here and nothing links to them.
 */
const ExportPage = React.lazy(() =>
  import('@/pages/export-page').then((module) => ({ default: module.ExportPage })),
)

const EditorPage = React.lazy(() =>
  import('@/pages/editor-page').then((module) => ({ default: module.EditorPage })),
)

const TransformPage = React.lazy(() =>
  import('@/pages/transform-page').then((module) => ({ default: module.TransformPage })),
)

const PENDING: Record<string, { title: string; description: string }> = {
  '/dashboard': {
    title: 'Dashboard',
    description: 'Recent documents, search, and export history will live here.',
  },
  '/settings': {
    title: 'Settings',
    description:
      'Document preferences will live here. The storage a document needs is already local, and reported at /documents.',
  },
  '/docs': {
    title: 'Documentation',
    description: 'Guides for import formats, document modes, and exporting.',
  },
  '/contact': {
    title: 'Contact',
    description: 'A support address has not been set up yet.',
  },
  '/privacy': {
    title: 'Privacy',
    description: 'No privacy policy has been written for this project yet.',
  },
  '/terms': {
    title: 'Terms',
    description: 'No terms of service have been written for this project yet.',
  },
}

const pendingRoutes = Object.entries(PENDING).map(([path, page]) => ({
  // Keys are held as absolute addresses for lookup; child route
  // paths have to be relative to the layout route.
  path: path.replace(/^\//, ''),
  element: <ComingSoonPage {...page} />,
}))

/** Only while a route's own chunk is fetched, which on a local network
 *  is a blink. It says what is happening rather than showing a shape of a
 *  page that has nothing in it. */
function ChunkLoading({ message }: { message: string }) {
  return (
    <Container className="py-16 sm:py-24">
      <p className="text-body text-muted" role="status">
        {message}
      </p>
    </Container>
  )
}

const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'import', element: <ImportPage /> },
      {
        path: 'export/:documentId',
        element: (
          <React.Suspense
            fallback={<ChunkLoading message="Opening the export preview…" />}
          >
            <ExportPage />
          </React.Suspense>
        ),
      },
      {
        path: 'editor/:documentId',
        element: (
          <React.Suspense fallback={<ChunkLoading message="Opening the editor…" />}>
            <EditorPage />
          </React.Suspense>
        ),
      },
      {
        path: 'transform/:documentId',
        element: (
          <React.Suspense fallback={<ChunkLoading message="Opening the document modes…" />}>
            <TransformPage />
          </React.Suspense>
        ),
      },
      ...pendingRoutes,
      {
        path: '*',
        element: (
          <ComingSoonPage
            title="There is no page at this address"
            description="The link may point at a route PromptPaper has not built yet."
          />
        ),
      },
    ],
  },
])

function AppRouter() {
  return <RouterProvider router={router} />
}

export { AppRouter }
