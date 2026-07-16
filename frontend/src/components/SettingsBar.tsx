import { AppearanceControls } from '@/src/components/AppearanceControls'

// Language + theme controls shown on the auth pages (login / register), which
// have no navbar. Authenticated views expose the same controls in the navbar
// account menu.
export function SettingsBar() {
  return (
    <div className="flex flex-wrap justify-end gap-3 p-3">
      <AppearanceControls />
    </div>
  )
}
