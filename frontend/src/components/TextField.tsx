import type { AnyFieldApi } from '@tanstack/react-form'
import type { ComponentProps } from 'react'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'

// A labelled text input bound to a TanStack Form field. Wraps the repeated
// label + input + value/onBlur/onChange wiring shared across the app's forms.
export function TextField({
  field,
  id,
  label,
  ...inputProps
}: {
  field: AnyFieldApi
  id: string
  label: string
} & Omit<
  ComponentProps<typeof Input>,
  'id' | 'name' | 'value' | 'onBlur' | 'onChange'
>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        {...inputProps}
      />
    </div>
  )
}
