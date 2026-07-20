import {
  ContentPage,
  type ContentSection,
} from '@/src/components/landing/ContentPage'

const SECTIONS: ContentSection[] = [
  { titleKey: 'privacy.controller.title', bodyKey: 'privacy.controller.body' },
  { titleKey: 'privacy.collect.title', bodyKey: 'privacy.collect.body' },
  { titleKey: 'privacy.purpose.title', bodyKey: 'privacy.purpose.body' },
  { titleKey: 'privacy.sharing.title', bodyKey: 'privacy.sharing.body' },
  { titleKey: 'privacy.hosting.title', bodyKey: 'privacy.hosting.body' },
  { titleKey: 'privacy.cookies.title', bodyKey: 'privacy.cookies.body' },
  { titleKey: 'privacy.rights.title', bodyKey: 'privacy.rights.body' },
  { titleKey: 'privacy.contact.title', bodyKey: 'privacy.contact.body' },
  { titleKey: 'privacy.changes.title', bodyKey: 'privacy.changes.body' },
]

export default function Privacy() {
  return (
    <ContentPage
      titleKey="privacy.page.title"
      leadKey="privacy.page.lead"
      sections={SECTIONS}
      seoTitleKey="seo.privacy.title"
      seoDescriptionKey="seo.privacy.description"
      canonical="/privacy"
    />
  )
}
