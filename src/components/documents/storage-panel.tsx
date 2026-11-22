import { Download, HardDrive, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Eyebrow } from '@/components/layout/section-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { backupFileName, formatBytes } from '@/lib/format'

interface StoragePanelProps {
  documentCount: number
  /** Bytes of document content PromptPaper wrote itself. */
  footprint: number
  /** What the browser reports for the whole origin, which is never only us. */
  estimate: StorageEstimate | null
  /** The library has not been read yet, so every figure below is unknown. */
  pending: boolean
  busy: boolean
  onExport: () => void
  onRestore: () => void
  onDeleteAll: () => void
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Eyebrow>{label}</Eyebrow>
      <p className="text-heading-sm font-semibold tabular-nums text-foreground">{value}</p>
      {detail ? <p className="text-caption text-muted">{detail}</p> : null}
    </div>
  )
}

/**
 * Storage diagnostics. Two different numbers are shown side by side on
 * purpose and labelled differently: what PromptPaper's own documents weigh,
 * and what the browser says this whole origin has used. The second includes
 * caches and service workers the site does not control, so calling it
 * "your documents" would be a made-up figure.
 */
function StoragePanel({
  documentCount,
  footprint,
  estimate,
  pending,
  busy,
  onExport,
  onRestore,
  onDeleteAll,
}: StoragePanelProps) {
  const quota = estimate?.quota ?? 0
  const used = estimate?.usage ?? 0
  const percent = quota > 0 ? Math.min(100, (used / quota) * 100) : 0
  const empty = documentCount === 0

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <HardDrive aria-hidden className="size-5 shrink-0 text-slate-gray" />
        <CardTitle>Local storage</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-8">
        {pending ? (
          <p className="text-body text-muted">
            Reading this browser&apos;s storage. The figures below are the library as it is held on
            this device, not a count kept anywhere else.
          </p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-3">
            <Stat label="Documents" value={String(documentCount)} detail="kept in this browser" />
            <Stat
              label="PromptPaper"
              value={formatBytes(footprint)}
              detail="the size of your saved documents"
            />
            <Stat
              label="Browser quota"
              value={quota > 0 ? formatBytes(used) : 'Unavailable'}
              detail={
                quota > 0
                  ? `${formatBytes(quota)} allowed for this site`
                  : 'this browser does not report a quota'
              }
            />
          </div>
        )}

        {quota > 0 ? (
          <div className="flex flex-col gap-2">
            <div
              role="progressbar"
              aria-label="Browser storage used by this site"
              aria-valuenow={Math.round(percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full overflow-hidden rounded-badge bg-pebble"
            >
              <div
                className="h-2 rounded-badge bg-primary"
                style={{ width: `${used > 0 ? Math.max(percent, 1) : 0}%` }}
              />
            </div>
            <p className="text-caption text-muted">
              {percent < 1 ? 'Under 1%' : `${percent.toFixed(1)}%`} of the space this browser has
              given the whole site, including anything cached beside PromptPaper.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <Button onClick={onExport} disabled={empty || busy}>
            <Download aria-hidden className="size-4" />
            Export library backup
          </Button>
          <Button variant="outline" onClick={onRestore} disabled={busy}>
            <Upload aria-hidden className="size-4" />
            Restore from backup
          </Button>
          <Button
            variant="ghost"
            className="ml-auto text-muted hover:bg-pebble hover:text-foreground"
            onClick={onDeleteAll}
            disabled={empty || busy}
          >
            Delete all local data
          </Button>
        </div>

        <p className="text-caption text-muted">
          {empty
            ? 'There is nothing to export yet. Backups open once the library holds a document.'
            : `Saves the whole library as ${backupFileName()} — ${documentCount} ${documentCount === 1 ? 'document' : 'documents'}.`}
        </p>
      </CardContent>
    </Card>
  )
}

export { StoragePanel }
