/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where the share-link reader is asked for a page, when it is not the
   * `/api/fetch-share` endpoint on the site's own origin. Set this only for
   * a deployment that runs the relay somewhere else; an unset value is not
   * an error, it means the import uses the same-origin endpoint.
   */
  readonly VITE_SHARE_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
