import {
  ContentPage,
  type ContentSection,
} from '@/src/components/landing/ContentPage'

const SECTIONS: ContentSection[] = [
  { titleKey: 'legal.publisher.title', bodyKey: 'legal.publisher.body' },
  { titleKey: 'legal.host.title', bodyKey: 'legal.host.body' },
  { titleKey: 'legal.ip.title', bodyKey: 'legal.ip.body' },
  { titleKey: 'legal.liability.title', bodyKey: 'legal.liability.body' },
  { titleKey: 'legal.contact.title', bodyKey: 'legal.contact.body' },
]

export default function LegalNotice() {
  return (
    <ContentPage
      titleKey="legal.page.title"
      leadKey="legal.page.lead"
      sections={SECTIONS}
      seoTitleKey="seo.legal.title"
      seoDescriptionKey="seo.legal.description"
      canonical="/legal"
    />
  )
}
