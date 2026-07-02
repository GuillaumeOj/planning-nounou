import { Alert, AlertDescription } from './ui/alert'

// Renders form/submit errors: a single message inline, or several as a bulleted
// list. Uses the shadcn Alert (role="alert") so assistive tech announces it.
export function FormErrors({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return null
  }

  return (
    <Alert variant="destructive">
      <AlertDescription>
        {messages.length === 1 ? (
          <p>{messages[0]}</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  )
}
