import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/src/components/ui/alert-dialog'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import { useI18n } from '@/src/i18n/I18nContext'

// A destructive action guarded by a type-to-confirm gate: it spells out the
// consequences and only enables the confirm button once the user types an exact
// phrase (matched case-insensitively). For the plainer yes/no case use
// ConfirmButton; this is for the ones grave enough to make the user pause.
export function ConfirmByTypingDialog({
  trigger,
  title,
  lead,
  consequences,
  promptLabel,
  phrase,
  confirmLabel,
  busy = false,
  onConfirm,
}: {
  trigger: string
  title: string
  lead: string
  consequences: string[]
  // The label preceding the phrase to type, e.g. "To confirm, type".
  promptLabel: string
  // The exact phrase the user must type; matched case-insensitively.
  phrase: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const confirmed = text.trim().toLowerCase() === phrase.toLowerCase()

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setText('')
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" type="button">
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{lead}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          {consequences.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-by-typing">
            {promptLabel}{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {phrase}
            </code>
          </Label>
          <Input
            id="confirm-by-typing"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          {/* `disabled` is the whole gate — the button can't be clicked until
              the phrase matches, so onClick needs no re-check. */}
          <AlertDialogAction
            variant="destructive"
            disabled={!confirmed || busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
