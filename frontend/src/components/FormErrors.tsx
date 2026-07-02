// Renders form/submit errors: a single message inline, or several as a bulleted
// list. Always exposes role="alert" so assistive tech announces it.
export function FormErrors({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return null
  }

  return (
    <div className="alert" role="alert">
      {messages.length === 1 ? (
        <p>{messages[0]}</p>
      ) : (
        <ul className="alert-list">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
