import * as React from 'react'
import { Plus, Trash } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { MODE_LABEL, PROVIDER_LABEL, ROLE_LABEL } from '@/lib/format'
import type { DocumentDraft, DraftTurn } from '@/services/documentService'
import { newId } from '@/services/documentService'
import { DOCUMENT_MODES, DOCUMENT_PROVIDERS, MESSAGE_ROLES } from '@/types/document'
import type { DocumentMode, DocumentProvider } from '@/types/document'

interface DocumentComposerProps {
  busy: boolean
  onCancel: () => void
  onSubmit: (draft: DocumentDraft) => void
}

/**
 * Start a conversation from one blank turn.
 *
 * There is no edit path here: an existing document is rewritten at
 * `/editor/:documentId`, which works in blocks and so can hold a code block
 * or a bold word. A composer that only holds text would flatten them, and
 * flattening someone's document to make it editable is not an edit.
 *
 * The composer holds text, not blocks — blocks are what the storage and the
 * renderers speak. The conversion is the service's job, so this file never
 * decides what a message means.
 */
function DocumentComposer({ busy, onCancel, onSubmit }: DocumentComposerProps) {
  const [title, setTitle] = React.useState('')
  const [provider, setProvider] = React.useState<DocumentProvider>('generic')
  const [mode, setMode] = React.useState<DocumentMode>('exact')
  const [turns, setTurns] = React.useState<DraftTurn[]>(() => [
    { key: newId(), role: 'user', text: '' },
  ])

  const patch = (index: number, change: Partial<DraftTurn>) =>
    setTurns((current) =>
      current.map((turn, at) => (at === index ? { ...turn, ...change } : turn)),
    )

  const addTurn = () =>
    setTurns((current) => [
      ...current,
      { key: newId(), role: current.length % 2 === 0 ? 'user' : 'assistant', text: '' },
    ])

  const removeTurn = (index: number) =>
    setTurns((current) => current.filter((_, at) => at !== index))

  const hasContent = turns.some((turn) => turn.text.length > 0)
  const canSave = title.trim().length > 0 && hasContent && !busy

  return (
    <Modal
      size="lg"
      title="New document"
      description="Write or paste a conversation and PromptPaper stores it in this browser."
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ title, provider, mode, turns })}
            disabled={!canSave}
          >
            Save to this browser
          </Button>
        </>
      }
    >
      <Field label="Title" htmlFor="document-title">
        <Input
          id="document-title"
          data-autofocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What is this conversation about?"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Source" htmlFor="document-provider">
          <Select
            id="document-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as DocumentProvider)}
          >
            {DOCUMENT_PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {PROVIDER_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Document mode" htmlFor="document-mode">
          <Select
            id="document-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as DocumentMode)}
          >
            {DOCUMENT_MODES.map((value) => (
              <option key={value} value={value}>
                {MODE_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-body-sm font-medium text-foreground">
            Conversation
            <span className="ml-2 text-caption font-normal text-muted">
              {turns.length} {turns.length === 1 ? 'message' : 'messages'}
            </span>
          </p>
          <Button variant="outline" size="sm" onClick={addTurn}>
            <Plus aria-hidden className="size-4" />
            Add message
          </Button>
        </div>

        <ol className="flex flex-col gap-3">
          {turns.map((turn, index) => (
            <li
              key={turn.key}
              className="flex flex-col gap-3 rounded-product border border-border bg-pebble p-4"
            >
              <div className="flex items-center gap-3">
                <Select
                  aria-label={`Speaker for message ${index + 1}`}
                  className="h-9 w-auto max-w-44 text-body-sm"
                  value={turn.role}
                  onChange={(event) => patch(index, { role: event.target.value as DraftTurn['role'] })}
                >
                  {MESSAGE_ROLES.map((value) => (
                    <option key={value} value={value}>
                      {ROLE_LABEL[value]}
                    </option>
                  ))}
                </Select>
                <p className="text-caption text-muted">Message {index + 1}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto text-muted hover:text-foreground"
                  aria-label={`Remove message ${index + 1}`}
                  onClick={() => removeTurn(index)}
                >
                  <Trash aria-hidden className="size-4" />
                </Button>
              </div>

              <Textarea
                aria-label={`Content of message ${index + 1}`}
                value={turn.text}
                onChange={(event) => patch(index, { text: event.target.value })}
                placeholder={
                  turn.role === 'user' ? 'The question, prompt or note.' : 'What the assistant said.'
                }
              />
            </li>
          ))}
        </ol>

        <p className="text-caption text-muted">
          A message left empty is not stored. Nothing you type is trimmed, reworded or reordered —
          what is saved is what you wrote.
        </p>
      </div>
    </Modal>
  )
}

export { DocumentComposer }
