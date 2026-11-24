import { useId } from 'react'

import { Field, Select } from '@/components/ui/field'
import {
  DEFAULT_EXPORT_OPTIONS,
  FONT_FAMILY_LABEL,
  FONT_SCALE_LABEL,
  PAGE_SIZE_LABEL,
  THEME_LABEL,
  TOC_STYLE_LABEL,
  type DocumentExportOptions,
  type FontFamily,
  type FontScale,
  type PageSize,
  type TocStyle,
} from '@/types/export'

/**
 * The settings the exporters read.
 *
 * Native controls, because a document's page size, typeface and scale are
 * each one choice from a short list: a `select` says so, works with a
 * keyboard and a screen reader without any help from this file, and cannot
 * drift into looking like something it is not.
 *
 * Every field here has to be honoured by all five formats. A control that
 * only the preview listened to would be a lie in the interface, which is
 * why the options object is passed to every exporter whole rather than
 * each format picking the ones it happens to implement.
 */

interface Toggle {
  key: keyof Pick<
    DocumentExportOptions,
    | 'includeToc'
    | 'includeMetadata'
    | 'includeRoleBadges'
    | 'includePreservationNotes'
    | 'includePageNumbers'
  >
  label: string
  hint: string
}

const TOGGLES: Toggle[] = [
  {
    key: 'includeToc',
    label: 'Table of contents',
    hint: 'The section topics and the questions asked, or every turn — clickable in the preview, the HTML and the DOCX.',
  },
  {
    key: 'includeMetadata',
    label: 'Metadata header',
    hint: 'Source, mode, how many messages are on the page, and when it was exported.',
  },
  {
    key: 'includeRoleBadges',
    label: 'Speaker badges',
    hint: 'Names who spoke. Switched off, each turn is still marked, by number.',
  },
  {
    key: 'includePreservationNotes',
    label: 'Preservation notes',
    hint: 'Attachments, unchanged elements, and the line saying nothing was dropped.',
  },
  {
    key: 'includePageNumbers',
    label: 'Page numbers',
    hint: 'A footer Word counts itself. For PDF, tick “Headers and footers” in the print dialog.',
  },
]

interface ExportControlsProps {
  options: DocumentExportOptions
  onChange: (patch: Partial<DocumentExportOptions>) => void
}

function OptionGroup<T extends string>({
  label,
  value,
  values,
  labels,
  onSelect,
}: {
  label: string
  value: T
  values: readonly T[]
  labels: Record<T, string>
  onSelect: (value: T) => void
}) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(event) => onSelect(event.target.value as T)}>
        {values.map((each) => (
          <option key={each} value={each}>
            {labels[each]}
          </option>
        ))}
      </Select>
    </Field>
  )
}

const PAGE_SIZES: readonly PageSize[] = ['a4', 'letter']
const THEMES = ['light', 'dark'] as const
const FAMILIES: readonly FontFamily[] = ['sans', 'serif', 'mono']
const SCALES: readonly FontScale[] = ['compact', 'standard', 'comfortable']
const TOC_STYLES: readonly TocStyle[] = ['topics', 'all-turns', 'none']

function isDefault(options: DocumentExportOptions): boolean {
  return (
    Object.entries(DEFAULT_EXPORT_OPTIONS) as [keyof DocumentExportOptions, string | boolean][]
  ).every(([key, value]) => options[key] === value)
}

function ExportControls({ options, onChange }: ExportControlsProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <OptionGroup
          label="Page size"
          value={options.pageSize}
          values={PAGE_SIZES}
          labels={PAGE_SIZE_LABEL}
          onSelect={(pageSize) => onChange({ pageSize })}
        />
        <OptionGroup
          label="Theme"
          value={options.theme}
          values={THEMES}
          labels={THEME_LABEL}
          onSelect={(theme) => onChange({ theme })}
        />
        <OptionGroup
          label="Font"
          value={options.fontFamily}
          values={FAMILIES}
          labels={FONT_FAMILY_LABEL}
          onSelect={(fontFamily) => onChange({ fontFamily })}
        />
        <OptionGroup
          label="Font size"
          value={options.fontScale}
          values={SCALES}
          labels={FONT_SCALE_LABEL}
          onSelect={(fontScale) => onChange({ fontScale })}
        />
      </div>

      <fieldset className="flex flex-col gap-4 border-t border-border pt-5">
        <legend className="sr-only">What the document carries</legend>
        {TOGGLES.map((toggle) => (
          <label key={toggle.key} className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-signal-blue"
              checked={options[toggle.key]}
              onChange={(event) => onChange({ [toggle.key]: event.target.checked })}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body-sm font-medium text-foreground">{toggle.label}</span>
              <span className="text-caption text-muted">{toggle.hint}</span>
            </span>
          </label>
        ))}
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-signal-blue"
            checked={!options.hideSystemAndToolTraces}
            onChange={(event) => onChange({ hideSystemAndToolTraces: !event.target.checked })}
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body-sm font-medium text-foreground">
              Include system &amp; tool traces
            </span>
            <span className="text-caption text-muted">
              Model reasoning, redacted plugin output and other turns the provider wrote to itself.
              Hidden by default; nothing is deleted — switching this on shows exactly what was
              imported.
            </span>
          </span>
        </label>
        {options.includeToc ? (
          <OptionGroup
            label="Contents list"
            value={options.tocStyle}
            values={TOC_STYLES}
            labels={TOC_STYLE_LABEL}
            onSelect={(tocStyle) => onChange({ tocStyle })}
          />
        ) : null}
      </fieldset>

      {isDefault(options) ? null : (
        <button
          type="button"
          className="self-start text-caption font-medium text-signal-blue underline underline-offset-4"
          onClick={() => onChange({ ...DEFAULT_EXPORT_OPTIONS })}
        >
          Reset to defaults
        </button>
      )}
    </div>
  )
}

export { ExportControls }
