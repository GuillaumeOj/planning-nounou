import {
  Calculator,
  CalendarMinus,
  CalendarX,
  Clock,
  FileCheck2,
  type LucideIcon,
  Rocket,
  ShieldCheck,
  TreePalm,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'
import type { Language } from '@/src/i18n/translations'

// The help center content lives here rather than in the i18n catalog: articles
// are long, richly structured prose (headings, steps, lists, callouts, outbound
// links), which the flat key/value catalog can't carry. The small UI chrome
// (page titles, category names, "back" labels) stays in translations.ts. Each
// article still carries both languages, so the help center honours the same
// French-first / English-fallback rule as the rest of the app.

// A localized value: the same field in every supported language.
type Localized<T> = Record<Language, T>

// The block types an article body is built from. Keep this list small — every
// block renders in ArticleBody.tsx, and richer prose is better split into more
// blocks than into more block types.
export type HelpBlock =
  // A subheading inside the article.
  | { kind: 'heading'; text: string }
  // A paragraph of body text.
  | { kind: 'p'; text: string }
  // An unordered list of points.
  | { kind: 'list'; items: string[] }
  // An ordered sequence of steps.
  | { kind: 'steps'; items: string[] }
  // A highlighted aside. 'warning' is reserved for genuine "don't do this".
  | { kind: 'note'; text: string; tone?: 'info' | 'warning' }
  // Outbound references. Hrefs starting with "/" are treated as in-app links.
  | { kind: 'links'; items: { href: string; label: string }[] }

// The four shelves the index groups articles under, in display order.
export const HELP_CATEGORIES = [
  'getting-started',
  'declarations',
  'pay-leave',
  'trust',
] as const

export type HelpCategory = (typeof HELP_CATEGORIES)[number]

export type HelpArticle = {
  // Stable, French kebab slug — it is the URL (/help/<slug>) and the canonical.
  slug: string
  category: HelpCategory
  icon: LucideIcon
  title: Localized<string>
  // One-line summary: the index card blurb and the article's SEO description.
  summary: Localized<string>
  body: Localized<HelpBlock[]>
  // Slugs of a few related articles, shown at the foot of the page.
  related?: string[]
}

// Authoritative outbound references, kept in one place so every article points
// at the same URLs.
const PAJEMPLOI = 'https://www.pajemploi.urssaf.fr'
// The particulier-employeur collective agreement (IDCC 3239) on Legifrance.
const CCN_3239 =
  'https://www.legifrance.gouv.fr/conv_coll/id/KALICONT000044594539'

const PAJEMPLOI_LINK = {
  fr: { href: PAJEMPLOI, label: 'Pajemploi — pajemploi.urssaf.fr' },
  en: { href: PAJEMPLOI, label: 'Pajemploi — pajemploi.urssaf.fr' },
}
const CCN_LINK = {
  fr: { href: CCN_3239, label: 'Convention collective (IDCC 3239)' },
  en: { href: CCN_3239, label: 'Collective agreement (IDCC 3239)' },
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'demarrer',
    category: 'getting-started',
    icon: Rocket,
    title: {
      fr: 'Bien démarrer : votre première configuration',
      en: 'Getting started: your first setup',
    },
    summary: {
      fr: "Le parcours recommandé, de la création de votre famille à l'ajout de votre nounou et de son contrat.",
      en: 'The recommended path, from creating your family to adding your nanny and their contract.',
    },
    related: [
      'inviter-un-parent',
      'inviter-une-famille',
      'calcul-du-salaire',
      'declarer-le-mois',
    ],
    body: {
      fr: [
        {
          kind: 'p',
          text: 'Ma Garde Sereine suit un ordre simple : famille → (éventuelle seconde famille en garde partagée) → nounou et contrat. Voici les étapes, avec la section où réaliser chacune.',
        },
        { kind: 'heading', text: '1. Créez votre famille — section Famille' },
        {
          kind: 'p',
          text: "À l'inscription, vous créez votre compte puis votre famille : ajoutez vos enfants (leur prénom suffit). C'est la base des calculs de présence et de partage.",
        },
        {
          kind: 'heading',
          text: '2. Garde partagée : invitez la seconde famille — section Famille',
        },
        {
          kind: 'p',
          text: "Si vous partagez la nounou, invitez l'autre famille depuis la section Famille. Chaque famille garde ses données ; seules les heures de la nounou sont mises en commun.",
        },
        {
          kind: 'heading',
          text: '3. Ajoutez votre nounou et son contrat — section Nounous',
        },
        {
          kind: 'p',
          text: "Depuis la section Nounous, créez la nounou puis son contrat. Un formulaire guidé vous accompagne pas à pas (planning, taux, congés) — inutile de tout préparer à l'avance.",
        },
        { kind: 'heading', text: '4. Suivez le mois — section Planning' },
        {
          kind: 'p',
          text: 'Le planning se remplit au fil du mois. Ajoutez-y les absences et les heures exceptionnelles depuis la section Planning.',
        },
        { kind: 'heading', text: '5. Déclarez — section Déclarations' },
        {
          kind: 'p',
          text: 'En fin de mois, la section Déclarations vous donne les heures et le salaire net à reporter dans Pajemploi.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Astuce : soignez le contrat (taux, planning, congés) ; le salaire mensualisé, les congés et les déclarations en découlent automatiquement.',
        },
      ],
      en: [
        {
          kind: 'p',
          text: 'Ma Garde Sereine follows a simple order: family → (an optional second family for shared care) → nanny and contract. Here are the steps, with the section where you do each.',
        },
        { kind: 'heading', text: '1. Create your family — Family section' },
        {
          kind: 'p',
          text: 'When you sign up, you create your account and then your family: add your children (a first name is enough). This is the basis for every presence and sharing calculation.',
        },
        {
          kind: 'heading',
          text: '2. Shared care: invite the second family — Family section',
        },
        {
          kind: 'p',
          text: 'If you share the nanny, invite the other family from the Family section. Each family keeps its own data; only the nanny’s hours are pooled.',
        },
        {
          kind: 'heading',
          text: '3. Add your nanny and their contract — Nannies section',
        },
        {
          kind: 'p',
          text: 'From the Nannies section, create the nanny and then their contract. A guided form walks you through it step by step (schedule, rate, leave) — no need to prepare everything in advance.',
        },
        { kind: 'heading', text: '4. Follow the month — Planning section' },
        {
          kind: 'p',
          text: 'The planning fills in as the month goes. Add absences and exceptional hours from the Planning section.',
        },
        { kind: 'heading', text: '5. File — Declarations section' },
        {
          kind: 'p',
          text: 'At month end, the Declarations section gives you the hours and net salary to enter in Pajemploi.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Tip: get the contract right (rate, schedule, leave); the monthly salary, leave and declarations all follow automatically.',
        },
      ],
    },
  },
  {
    slug: 'inviter-un-parent',
    category: 'getting-started',
    icon: Users,
    title: {
      fr: 'Inviter un parent dans votre famille',
      en: 'Invite a parent to your family',
    },
    summary: {
      fr: 'Ajouter un second parent ou un proche à votre famille pour gérer ensemble les mêmes enfants.',
      en: 'Add a second parent or relative to your family to manage the same children together.',
    },
    related: ['demarrer', 'inviter-une-famille'],
    body: {
      fr: [
        {
          kind: 'p',
          text: "Vous pouvez inviter une autre personne — le second parent, un proche — à rejoindre votre famille. Elle accède alors aux mêmes enfants et au même planning que vous, selon son rôle. (Pour faire venir un autre foyer en garde partagée, avec ses propres enfants, voir plutôt l'article sur le partage de contrat.)",
        },
        { kind: 'heading', text: 'Envoyer une invitation' },
        {
          kind: 'steps',
          items: [
            "Ouvrez l'écran Famille et sélectionnez la famille concernée.",
            "Dans « Invitations », cliquez sur « Inviter quelqu'un ».",
            "Saisissez l'adresse e-mail et choisissez le rôle : Propriétaire ou Membre.",
            "Envoyez l'invitation, ou partagez directement le lien affiché avec la personne.",
          ],
        },
        { kind: 'heading', text: 'Choisir le rôle' },
        {
          kind: 'list',
          items: [
            "Propriétaire : gère tout, y compris renommer ou supprimer la famille et inviter d'autres personnes.",
            'Membre : accède à la famille et à ses enfants, sans les actions de gestion réservées au propriétaire.',
          ],
        },
        { kind: 'heading', text: "Accepter l'invitation" },
        {
          kind: 'p',
          text: "La personne reçoit un e-mail. Si elle n'a pas encore de compte, elle en crée un, puis retrouve l'invitation dans « Invitations pour vous » et l'accepte : elle rejoint votre famille.",
        },
        { kind: 'heading', text: 'Gérer les membres' },
        {
          kind: 'p',
          text: "Depuis « Membres », un propriétaire peut retirer un membre. Chacun peut aussi quitter une famille via « Quitter la famille » — il en perd alors l'accès.",
        },
        {
          kind: 'note',
          tone: 'info',
          text: "Tant qu'elle n'est pas acceptée, une invitation reste en attente et peut être révoquée à tout moment.",
        },
      ],
      en: [
        {
          kind: 'p',
          text: 'You can invite another person — the second parent, a relative — to join your family. They then access the same children and schedule as you, according to their role. (To bring another household into shared care, with their own children, see the article on sharing a contract instead.)',
        },
        { kind: 'heading', text: 'Send an invitation' },
        {
          kind: 'steps',
          items: [
            'Open the Family screen and select the family.',
            'In “Invitations”, click “Invite someone”.',
            'Enter the email address and choose the role: Owner or Member.',
            'Send the invitation, or share the displayed link directly with the person.',
          ],
        },
        { kind: 'heading', text: 'Choose the role' },
        {
          kind: 'list',
          items: [
            'Owner: manages everything, including renaming or deleting the family and inviting others.',
            'Member: accesses the family and its children, without the management actions reserved for the owner.',
          ],
        },
        { kind: 'heading', text: 'Accept the invitation' },
        {
          kind: 'p',
          text: 'The person receives an email. If they don’t have an account yet, they create one, then find the invitation under “Invitations for you” and accept it: they join your family.',
        },
        { kind: 'heading', text: 'Manage members' },
        {
          kind: 'p',
          text: 'From “Members”, an owner can remove a member. Anyone can also leave a family via “Leave family” — they then lose access to it.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Until it is accepted, an invitation stays pending and can be revoked at any time.',
        },
      ],
    },
  },
  {
    slug: 'inviter-une-famille',
    category: 'getting-started',
    icon: UserPlus,
    title: {
      fr: 'Inviter une autre famille et partager un contrat',
      en: 'Invite another family and share a contract',
    },
    summary: {
      fr: "Inviter d'autres parents, revendiquer une famille et se rattacher à un contrat de garde partagée.",
      en: 'Invite other parents, claim a family, and attach to a shared-care contract.',
    },
    related: ['inviter-un-parent', 'demarrer', 'calcul-du-salaire'],
    body: {
      fr: [
        {
          kind: 'p',
          text: "La garde partagée réunit plusieurs familles autour d'une même nounou. Chaque famille a son propre compte et ses propres enfants ; ce sont les heures de la nounou qui sont mises en commun.",
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Vous voulez plutôt ajouter un second parent à votre propre famille, pour gérer les mêmes enfants ? Voir « Inviter un parent dans votre famille ». Cet article-ci concerne un autre foyer, avec ses propres enfants.',
        },
        { kind: 'heading', text: "Créer la famille de l'autre foyer" },
        {
          kind: 'p',
          text: "À la création d'une famille, cochez « Je la configure pour quelqu'un d'autre » : la famille est créée non réclamée. Vous invitez ensuite les parents concernés à la revendiquer ; ils en deviennent propriétaires et y ajoutent leurs propres enfants.",
        },
        { kind: 'heading', text: 'Revendiquer une famille' },
        {
          kind: 'p',
          text: "Le parent invité clique sur le lien reçu. S'il n'a pas de compte, il en crée un — le lien le ramène à l'invitation, qu'il retrouve aussi dans « Invitations pour vous ». En l'acceptant, il revendique la famille et rattache ses enfants.",
        },
        { kind: 'heading', text: 'Partager un contrat de nounou' },
        {
          kind: 'p',
          text: "Une invitation de contrat rattache une famille à un contrat de garde existant. L'invité passe par l'authentification, puis relie l'une de ses familles au contrat partagé. Les heures de la nounou sont ensuite déclarées par chaque famille selon sa part.",
        },
        {
          kind: 'note',
          tone: 'info',
          text: "Chaque famille ne voit et ne déclare que sa propre part. Pajemploi ne permet pas de répartir un taux horaire entre deux employeurs : l'application partage les heures, toutes au même taux.",
        },
      ],
      en: [
        {
          kind: 'p',
          text: 'Shared care brings several families together around one nanny. Each family has its own account and its own children; it is the nanny’s hours that are pooled.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Looking instead to add a second parent to your own family, to manage the same children? See “Invite a parent to your family”. This article is about another household, with its own children.',
        },
        { kind: 'heading', text: 'Create the other household’s family' },
        {
          kind: 'p',
          text: 'When creating a family, tick “I’m setting this up for someone else”: the family is created unclaimed. You then invite the parents to claim it; they become its owners and add their own children.',
        },
        { kind: 'heading', text: 'Claim a family' },
        {
          kind: 'p',
          text: 'The invited parent clicks the link they received. If they don’t have an account, they create one — the link brings them back to the invitation, which they also find under “Invitations for you”. Accepting it, they claim the family and attach their children.',
        },
        { kind: 'heading', text: 'Share a nanny contract' },
        {
          kind: 'p',
          text: 'A contract invitation attaches a family to an existing care contract. The invitee goes through authentication, then links one of their families to the shared contract. The nanny’s hours are then declared by each family according to its share.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Each family only sees and declares its own share. Pajemploi cannot split an hourly rate between two employers: the app shares the hours, all at the same rate.',
        },
      ],
    },
  },
  {
    slug: 'calcul-du-salaire',
    category: 'pay-leave',
    icon: Calculator,
    title: {
      fr: 'Comment le salaire est calculé',
      en: 'How the salary is calculated',
    },
    summary: {
      fr: 'La mensualisation, le taux horaire net, les heures majorées et la répartition entre familles.',
      en: 'Monthly averaging, the net hourly rate, overtime, and the split between families.',
    },
    related: [
      'conges-payes',
      'simulation-des-paiements',
      'heures-exceptionnelles',
      'declarer-le-mois',
    ],
    body: {
      fr: [
        {
          kind: 'p',
          text: "Ma Garde Sereine calcule le salaire net de votre nounou — celui que vous saisissez dans Pajemploi. Pajemploi ajoute ensuite les cotisations pour obtenir le brut ; l'application ne calcule pas les cotisations.",
        },
        { kind: 'heading', text: 'La mensualisation (année complète)' },
        {
          kind: 'p',
          text: "Le salaire est lissé sur l'année : heures hebdomadaires × 52 semaines ÷ 12 mois. Vous versez ainsi le même montant chaque mois, congés compris (5 des 52 semaines correspondent aux congés payés). Ce calcul suppose un planning régulier sur l'année (année complète).",
        },
        { kind: 'heading', text: 'Heures normales et heures majorées' },
        {
          kind: 'p',
          text: "La durée conventionnelle est de 40 h par semaine. Au-delà, les 8 premières heures sont majorées de 25 %, les suivantes de 50 %. En garde partagée, la semaine entière de la nounou est d'abord découpée en ces tranches, puis répartie entre les familles — la majoration dépend du total travaillé, pas d'un seul employeur.",
        },
        { kind: 'heading', text: 'Taux horaire net et minimum' },
        {
          kind: 'p',
          text: "Le contrat porte un taux horaire net. L'application vérifie qu'il reste au-dessus du minimum en vigueur et vous alerte sinon, sans bloquer la saisie. Les heures déclarées sont arrondies à l'heure supérieure, en faveur de la nounou.",
        },
        { kind: 'heading', text: 'Répartition entre familles' },
        {
          kind: 'p',
          text: 'En garde partagée, les heures sont réparties selon la présence des enfants — à parts égales ou au prorata des enfants présents, selon le contrat. Chaque famille déclare sa part, toutes au même taux.',
        },
        {
          kind: 'links',
          items: [PAJEMPLOI_LINK.fr, CCN_LINK.fr],
        },
      ],
      en: [
        {
          kind: 'p',
          text: 'Ma Garde Sereine computes your nanny’s net salary — the figure you enter in Pajemploi. Pajemploi then adds social contributions to get the gross; the app does not compute contributions.',
        },
        { kind: 'heading', text: 'Monthly averaging (full year)' },
        {
          kind: 'p',
          text: 'The salary is smoothed over the year: weekly hours × 52 weeks ÷ 12 months. You pay the same amount every month, leave included (5 of the 52 weeks are paid leave). This assumes a regular year-round schedule (“année complète”).',
        },
        { kind: 'heading', text: 'Normal hours and overtime' },
        {
          kind: 'p',
          text: 'The agreed working week is 40 hours. Beyond that, the first 8 hours are paid at +25%, the rest at +50%. In shared care the nanny’s whole week is banded into these tiers first, then split between families — the overtime depends on the total worked, not on a single employer.',
        },
        { kind: 'heading', text: 'Net hourly rate and minimum' },
        {
          kind: 'p',
          text: 'The contract carries a net hourly rate. The app checks it stays above the minimum in force and warns you otherwise, without blocking. Declared hours are rounded up to the whole hour, in the nanny’s favour.',
        },
        { kind: 'heading', text: 'Split between families' },
        {
          kind: 'p',
          text: 'In shared care the hours are split by which children are present — equally or in proportion to the children present, depending on the contract. Each family declares its share, all at the same rate.',
        },
        {
          kind: 'links',
          items: [PAJEMPLOI_LINK.en, CCN_LINK.en],
        },
      ],
    },
  },
  {
    slug: 'conges-payes',
    category: 'pay-leave',
    icon: TreePalm,
    title: {
      fr: 'Comment les congés payés sont calculés',
      en: 'How paid leave is calculated',
    },
    summary: {
      fr: "L'acquisition des congés, la période de référence et leur impact sur le salaire.",
      en: 'How leave accrues, the reference period, and its effect on the salary.',
    },
    related: [
      'conges-sans-solde',
      'calcul-du-salaire',
      'simulation-des-paiements',
    ],
    body: {
      fr: [
        {
          kind: 'p',
          text: "L'application suit le solde de congés payés de votre nounou : acquis, pris et restants.",
        },
        { kind: 'heading', text: 'Période de référence' },
        {
          kind: 'p',
          text: "Les congés s'acquièrent sur une période de référence allant du 1er juin au 31 mai. L'application affiche l'acquisition et la consommation sur cette même période.",
        },
        { kind: 'heading', text: 'Acquisition' },
        {
          kind: 'p',
          text: 'Le nombre de jours annuels convenu au contrat est acquis progressivement : un douzième par mois écoulé, proratisé, arrondi au demi-jour et plafonné au total annuel. Le formulaire du contrat pré-remplit le minimum légal ; une famille peut convenir davantage.',
        },
        { kind: 'heading', text: 'Jours pris' },
        {
          kind: 'p',
          text: "Un congé « payé » posé dans le planning n'est décompté que s'il tombe un jour normalement travaillé par la nounou. Les jours fériés chômés compris dans la période ne consomment pas de congés.",
        },
        { kind: 'heading', text: 'Impact sur le salaire' },
        {
          kind: 'p',
          text: "Les congés payés sont payés au fil de l'eau par maintien de salaire : ils sont déjà inclus dans le salaire mensualisé (sur 52 semaines, 47 sont travaillées et 5 correspondent aux congés). Poser un congé ne retire donc rien de la paie du mois.",
        },
        { kind: 'heading', text: 'Le rappel de 1/10' },
        {
          kind: 'p',
          text: "La loi impose de retenir l'indemnité la plus favorable entre le maintien de salaire et la règle du 1/10 — un dixième de la rémunération brute de la période de référence (1er juin – 31 mai). L'application compare les deux : si le dixième l'emporte, la différence, le « rappel de 1/10 », vous est due.",
        },
        {
          kind: 'p',
          text: "Le dixième dépasse souvent le maintien dès qu'il y a des heures majorées, des jours fériés travaillés, de la présence de nuit ou une augmentation en cours d'année. Il se calcule sur la rémunération brute totale (salaire et majorations, jours fériés travaillés, présence de nuit, avantages en nature) ; les frais remboursés (transport, kilomètres) en sont exclus.",
        },
        {
          kind: 'p',
          text: "Une estimation s'affiche toute l'année sur le tableau de bord des congés. Le rappel est régularisé une fois par an : il est inscrit sur la déclaration de mai (fin de la période de référence) ou sur la dernière déclaration du contrat, puis déclaré à Pajemploi. En garde partagée, chaque famille calcule et déclare son propre rappel.",
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Restant = acquis − pris. Il peut devenir négatif si des congés sont posés à l’avance.',
        },
        { kind: 'links', items: [PAJEMPLOI_LINK.fr, CCN_LINK.fr] },
      ],
      en: [
        {
          kind: 'p',
          text: 'The app tracks your nanny’s paid-leave balance: accrued, taken and remaining.',
        },
        { kind: 'heading', text: 'Reference period' },
        {
          kind: 'p',
          text: 'Leave accrues over a reference period running from 1 June to 31 May. The app shows both accrual and consumption over that same period.',
        },
        { kind: 'heading', text: 'Accrual' },
        {
          kind: 'p',
          text: 'The annual number of days agreed in the contract accrues gradually: one twelfth per elapsed month, prorated, rounded to the half-day and capped at the annual total. The contract form pre-fills the legal minimum; a family may agree more.',
        },
        { kind: 'heading', text: 'Days taken' },
        {
          kind: 'p',
          text: 'A “paid” leave day in the planning is only counted if it falls on a day the nanny normally works. Non-worked public holidays within the period do not use up leave.',
        },
        { kind: 'heading', text: 'Effect on the salary' },
        {
          kind: 'p',
          text: 'Paid leave is paid as you go through salary maintenance: it is already included in the monthly salary (across 52 weeks, 47 are worked and 5 are paid leave). Taking a leave day therefore removes nothing from that month’s pay.',
        },
        { kind: 'heading', text: 'The “rappel de 1/10” (tenth-rule top-up)' },
        {
          kind: 'p',
          text: 'The law requires the more favourable of two figures: salary maintenance and the “tenth rule” — a tenth of the gross pay over the reference period (1 June – 31 May). The app compares them: if the tenth wins, the difference, the “rappel de 1/10”, is owed to your nanny.',
        },
        {
          kind: 'p',
          text: 'The tenth often beats maintenance as soon as there is overtime, worked public holidays, night presence, or a mid-year raise. It is computed on the total gross pay (salary and its overtime, worked holidays, night presence, benefits in kind); reimbursed expenses (transport, mileage) are excluded.',
        },
        {
          kind: 'p',
          text: 'A running estimate is shown all year on the paid-leave dashboard. The top-up is settled once a year: it is written onto the May declaration (the end of the reference period) or the contract’s final declaration, then declared to Pajemploi. In shared care, each family computes and declares its own top-up.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Remaining = accrued − taken. It can go negative if leave is booked ahead.',
        },
        { kind: 'links', items: [PAJEMPLOI_LINK.en, CCN_LINK.en] },
      ],
    },
  },
  {
    slug: 'simulation-des-paiements',
    category: 'pay-leave',
    icon: TrendingUp,
    title: {
      fr: 'Simuler ce que vous allez payer',
      en: 'Simulate what you will pay',
    },
    summary: {
      fr: 'Le graphique des 12 prochains mois sur l’accueil et le détail mois par mois de ce que vous versez.',
      en: 'The 12-month graph on the home page and the month-by-month detail of what you pay.',
    },
    related: ['calcul-du-salaire', 'conges-payes', 'declarer-le-mois'],
    body: {
      fr: [
        {
          kind: 'p',
          text: 'Deux vues répondent à une seule question : combien allez-vous payer votre nounou, mois après mois ? Ce sont des estimations, calculées à partir du contrat (planning et taux en vigueur) — et non des déclarations : les chiffres à reporter dans Pajemploi restent dans la section Déclarations.',
        },
        {
          kind: 'heading',
          text: 'Le graphique des 12 prochains mois — accueil',
        },
        {
          kind: 'p',
          text: 'Sur l’accueil, un graphique projette les 12 prochains mois : une barre par mois, dont la hauteur est le total que vous versez ce mois-là. En garde partagée, chaque nounou a sa couleur et les contrats s’empilent, pour lire d’un coup d’œil la charge du mois et la part de chacun.',
        },
        {
          kind: 'heading',
          text: 'Le détail mois par mois — section Simulation',
        },
        {
          kind: 'p',
          text: 'La page Simulation reprend la période de référence (1er juin – 31 mai) : une ligne par mois, une colonne par poste (salaire net, transport, kilométrage, avantages en nature, rappel de congés payés 1/10), et un total en bas de chaque colonne comme pour l’ensemble de la période.',
        },
        { kind: 'heading', text: 'Ce que « payé » comprend' },
        {
          kind: 'p',
          text: 'Le montant réunit tout ce que vous décaissez : le salaire net (heures majorées, présence de nuit et jours fériés travaillés compris), le transport, le kilométrage, la valeur des avantages en nature, et — sur le mois de clôture de la période (mai, ou le dernier mois du contrat) — le rappel de congés payés 1/10.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Ces montants correspondent à ce que vous versez à la nounou. Ils n’incluent pas les cotisations sociales que Pajemploi vous prélèvera en plus (l’application ne calcule pas les cotisations) : le coût total pour votre famille sera donc supérieur.',
        },
        { kind: 'heading', text: 'Une projection, pas une facture' },
        {
          kind: 'p',
          text: 'Les mois à venir sont valorisés d’après le planning et les taux en vigueur, comme le serait un vrai mois. Les mois déjà passés reflètent ce qui est saisi (congés posés, heures exceptionnelles, kilométrage déclaré). Le kilométrage des mois futurs reste à zéro : il rembourse une distance réellement parcourue, qui ne se devine pas.',
        },
        {
          kind: 'p',
          text: 'Les montants sont ceux de votre famille : en garde partagée, chacune ne voit que sa propre part.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Le rappel de 1/10 n’apparaît que sur le mois de clôture ; son calcul est détaillé dans « Comment les congés payés sont calculés ».',
        },
        {
          kind: 'links',
          items: [
            { href: '/dashboard', label: 'Ouvrir le tableau de bord' },
            { href: '/simulation', label: 'Ouvrir la simulation' },
          ],
        },
      ],
      en: [
        {
          kind: 'p',
          text: 'Two views answer a single question: how much will you pay your nanny, month by month? These are estimates, computed from the contract (the schedule and rates in force) — not declarations: the figures to enter in Pajemploi stay in the Declarations section.',
        },
        { kind: 'heading', text: 'The 12-month graph — home page' },
        {
          kind: 'p',
          text: 'On the home page, a graph projects the next 12 months: one bar per month, its height the total you pay that month. In shared care each nanny has their own colour and the contracts stack, so you read the month’s load and each nanny’s share at a glance.',
        },
        {
          kind: 'heading',
          text: 'The month-by-month detail — Simulation section',
        },
        {
          kind: 'p',
          text: 'The Simulation page covers the reference period (1 June – 31 May): one row per month, one column per component (net wage, transport, mileage, benefits in kind, paid-leave 1/10 top-up), and a total at the foot of each column and for the whole period.',
        },
        { kind: 'heading', text: 'What “paid” includes' },
        {
          kind: 'p',
          text: 'The amount is everything you disburse: the net wage (overtime, night presence and worked public holidays included), transport, mileage, the value of benefits in kind, and — on the period’s closing month (May, or the contract’s final month) — the paid-leave 1/10 top-up.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'These amounts are what you pay the nanny. They do not include the social contributions Pajemploi will additionally collect from you (the app does not compute contributions), so your family’s total cost will be higher.',
        },
        { kind: 'heading', text: 'A projection, not an invoice' },
        {
          kind: 'p',
          text: 'Future months are priced from the schedule and rates in force, exactly as a real month would be. Past months reflect what is on file (leave booked, exceptional hours, mileage entered). Mileage for future months stays at zero: it reimburses distance actually driven, which cannot be guessed.',
        },
        {
          kind: 'p',
          text: 'The amounts are your family’s: in shared care each family sees only its own share.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'The 1/10 top-up shows only on the closing month; its calculation is detailed in “How paid leave is calculated”.',
        },
        {
          kind: 'links',
          items: [
            { href: '/dashboard', label: 'Open the dashboard' },
            { href: '/simulation', label: 'Open the simulation' },
          ],
        },
      ],
    },
  },
  {
    slug: 'conges-sans-solde',
    category: 'pay-leave',
    icon: CalendarMinus,
    title: {
      fr: 'Congés sans solde et absences : l’impact sur la paie',
      en: 'Unpaid leave and absences: the effect on pay',
    },
    summary: {
      fr: 'Le congé sans solde, la maladie et la maternité, déduits au prorata des heures réellement travaillées.',
      en: 'Unpaid leave, sickness and maternity, deducted in proportion to the hours actually worked.',
    },
    related: ['declarer-une-absence', 'conges-payes'],
    body: {
      fr: [
        {
          kind: 'p',
          text: 'Contrairement aux congés payés, un congé sans solde, un arrêt maladie ou un congé maternité suspend la rémunération des heures non travaillées.',
        },
        {
          kind: 'heading',
          text: 'Le principe : un prorata, pas une soustraction',
        },
        {
          kind: 'p',
          text: "L'application applique un ratio de présence : salaire mensualisé × heures réellement effectuées ÷ heures qui auraient dû l'être (plafonné à 100 %), famille par famille. On évite ainsi qu'un mois court (février) laisse des heures résiduelles : une nounou absente tout le mois est payée zéro, et non partiellement.",
        },
        { kind: 'heading', text: 'Types déduits' },
        {
          kind: 'list',
          items: [
            'Congé sans solde : réduit la paie au prorata des heures non travaillées.',
            'Maladie : réduit également la paie ; les indemnités journalières sont gérées hors application.',
            'Congé maternité : réduit la paie de la même façon ; la nounou perçoit des indemnités journalières, gérées hors application.',
            'Congé payé : ne déduit rien (déjà inclus dans le salaire mensualisé).',
          ],
        },
        { kind: 'heading', text: 'Portions' },
        {
          kind: 'p',
          text: "Une absence se pose en journée entière, en demi-journée, ou en heures. La portion en heures n'est possible que pour le congé sans solde.",
        },
        {
          kind: 'note',
          tone: 'info',
          text: "Quand un prorata est appliqué, l'application affiche un avertissement pour que le montant réduit ne soit pas pris pour une erreur.",
        },
        { kind: 'links', items: [PAJEMPLOI_LINK.fr, CCN_LINK.fr] },
      ],
      en: [
        {
          kind: 'p',
          text: 'Unlike paid leave, unpaid leave, sickness or maternity leave suspends pay for the hours not worked.',
        },
        {
          kind: 'heading',
          text: 'The principle: a proration, not a subtraction',
        },
        {
          kind: 'p',
          text: 'The app applies a presence ratio: monthly salary × hours actually worked ÷ hours that should have been worked (capped at 100%), family by family. This avoids a short month (February) leaving residual hours: a nanny absent for the whole month is paid zero, not partially.',
        },
        { kind: 'heading', text: 'Deducting types' },
        {
          kind: 'list',
          items: [
            'Unpaid leave: reduces pay in proportion to the hours not worked.',
            'Sickness: also reduces pay; daily sickness benefits are handled outside the app.',
            'Maternity leave: reduces pay the same way; daily benefits are handled outside the app.',
            'Paid leave: deducts nothing (already included in the monthly salary).',
          ],
        },
        { kind: 'heading', text: 'Portions' },
        {
          kind: 'p',
          text: 'An absence can be a full day, a half day, or a number of hours. The hourly portion is only available for unpaid leave.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'When a proration is applied, the app shows a warning so the reduced amount is not mistaken for a bug.',
        },
        { kind: 'links', items: [PAJEMPLOI_LINK.en, CCN_LINK.en] },
      ],
    },
  },
  {
    slug: 'declarer-le-mois',
    category: 'declarations',
    icon: FileCheck2,
    title: {
      fr: 'Déclarer à la fin du mois',
      en: 'Filing at the end of the month',
    },
    summary: {
      fr: "Reporter chaque mois dans Pajemploi les heures et le salaire net calculés par l'application.",
      en: 'Each month, carry the app’s computed hours and net salary into Pajemploi.',
    },
    related: [
      'declarer-une-absence',
      'heures-exceptionnelles',
      'calcul-du-salaire',
      'conges-payes',
    ],
    body: {
      fr: [
        {
          kind: 'p',
          text: 'Chaque mois, une déclaration est préparée par contrat et par famille. Elle reprend les heures et le salaire net à reporter dans Pajemploi.',
        },
        { kind: 'heading', text: 'Ce que contient une déclaration' },
        {
          kind: 'list',
          items: [
            'Les heures normales et les heures majorées (25 % et 50 %).',
            'Le salaire net.',
            'Les indemnités : présence de nuit, majoration de jour férié travaillé.',
            'Les avantages : transport, avantages en nature, kilomètres.',
          ],
        },
        {
          kind: 'p',
          text: "Le montant total additionne le salaire net, l'indemnité de nuit et la majoration de jour férié.",
        },
        { kind: 'heading', text: 'Les étapes' },
        {
          kind: 'steps',
          items: [
            "En fin de mois, ouvrez l'écran Déclarations et sélectionnez le mois.",
            'Vérifiez les heures et le salaire net ; ajustez les kilomètres si besoin (seul champ modifiable).',
            'Reportez ces chiffres dans votre espace Pajemploi, à la rubrique de déclaration mensuelle.',
            "De retour dans l'application, marquez la déclaration comme envoyée.",
          ],
        },
        { kind: 'heading', text: 'Modifier après envoi' },
        {
          kind: 'p',
          text: "Une déclaration reste modifiable pendant une fenêtre de grâce, jusqu'à la fin du 2ᵉ mois suivant le mois déclaré ; ensuite elle est figée. Tant qu'elle est en brouillon, elle est recalculée automatiquement à chaque consultation.",
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Une fois par an, la déclaration de mai (ou la dernière du contrat) peut porter un rappel de congés payés « rappel de 1/10 ». Voir « Comment les congés payés sont calculés ».',
        },
        { kind: 'links', items: [PAJEMPLOI_LINK.fr] },
      ],
      en: [
        {
          kind: 'p',
          text: 'Each month a declaration is prepared per contract and per family. It carries the hours and net salary to enter in Pajemploi.',
        },
        { kind: 'heading', text: 'What a declaration contains' },
        {
          kind: 'list',
          items: [
            'Normal hours and overtime hours (+25% and +50%).',
            'The net salary.',
            'Allowances: night presence, worked-public-holiday premium.',
            'Benefits: transport, benefits in kind, mileage.',
          ],
        },
        {
          kind: 'p',
          text: 'The total amount adds the net salary, the night allowance and the public-holiday premium.',
        },
        { kind: 'heading', text: 'The steps' },
        {
          kind: 'steps',
          items: [
            'At month end, open the Declarations screen and pick the month.',
            'Check the hours and net salary; adjust the mileage if needed (the only editable field).',
            'Enter these figures in your Pajemploi account, in the monthly declaration section.',
            'Back in the app, mark the declaration as sent.',
          ],
        },
        { kind: 'heading', text: 'Editing after sending' },
        {
          kind: 'p',
          text: 'A declaration stays editable during a grace window, until the end of the 2nd month after the declared month; after that it freezes. While it is a draft it is recomputed automatically on every view.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Once a year, the May declaration (or the contract’s last) can carry a paid-leave top-up, the “rappel de 1/10”. See “How paid leave is calculated”.',
        },
        { kind: 'links', items: [PAJEMPLOI_LINK.en] },
      ],
    },
  },
  {
    slug: 'declarer-une-absence',
    category: 'declarations',
    icon: CalendarX,
    title: {
      fr: 'Déclarer une absence',
      en: 'Recording an absence',
    },
    summary: {
      fr: 'Poser un congé payé, un congé sans solde, un arrêt maladie ou maternité, ou une absence partielle.',
      en: 'Record paid leave, unpaid leave, sickness, maternity, or a partial absence.',
    },
    related: ['conges-payes', 'conges-sans-solde', 'declarer-le-mois'],
    body: {
      fr: [
        {
          kind: 'p',
          text: 'Les absences se posent dans le planning et ajustent automatiquement les heures et le salaire du mois.',
        },
        { kind: 'heading', text: 'Poser une absence' },
        {
          kind: 'steps',
          items: [
            "Depuis Planning, ouvrez l'onglet Jours off.",
            'Choisissez le type : congé payé, congé sans solde, maladie ou maternité.',
            'Indiquez la période et la portion : journée entière, demi-journée, ou en heures.',
          ],
        },
        { kind: 'heading', text: 'Ce que chaque type change' },
        {
          kind: 'list',
          items: [
            'Congé payé : décompté du solde de congés, sans impact sur la paie.',
            'Congé sans solde : réduit la paie au prorata des heures non travaillées.',
            'Maladie : réduit les heures déclarées ; les indemnités journalières sont gérées hors application.',
            'Congé maternité : réduit les heures déclarées comme la maladie ; indemnités journalières hors application.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: "La portion en heures n'est possible que pour le congé sans solde. Une absence concerne la nounou (elle ne travaille pas), et non une seule famille.",
        },
      ],
      en: [
        {
          kind: 'p',
          text: 'Absences are entered in the planning and automatically adjust the month’s hours and salary.',
        },
        { kind: 'heading', text: 'Record an absence' },
        {
          kind: 'steps',
          items: [
            'From Planning, open the Days off tab.',
            'Choose the type: paid leave, unpaid leave, sickness or maternity.',
            'Set the period and the portion: full day, half day, or hours.',
          ],
        },
        { kind: 'heading', text: 'What each type changes' },
        {
          kind: 'list',
          items: [
            'Paid leave: counted against the leave balance, with no effect on pay.',
            'Unpaid leave: reduces pay in proportion to the hours not worked.',
            'Sickness: reduces the declared hours; daily benefits are handled outside the app.',
            'Maternity leave: reduces the declared hours like sickness; daily benefits are handled outside the app.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'The hourly portion is only available for unpaid leave. An absence applies to the nanny (she is not working), not to a single family.',
        },
      ],
    },
  },
  {
    slug: 'heures-exceptionnelles',
    category: 'declarations',
    icon: Clock,
    title: {
      fr: 'Déclarer des heures exceptionnelles',
      en: 'Recording exceptional hours',
    },
    summary: {
      fr: 'Heures en plus, présence responsable, présence de nuit et jours fériés travaillés.',
      en: 'Extra hours, responsible presence, night presence, and worked public holidays.',
    },
    related: ['declarer-le-mois', 'calcul-du-salaire'],
    body: {
      fr: [
        {
          kind: 'p',
          text: "Au-delà du planning habituel, l'application gère plusieurs situations qui allongent la journée de la nounou ou modifient la répartition entre familles.",
        },
        { kind: 'heading', text: 'Heures en plus' },
        {
          kind: 'p',
          text: "Une entrée d'heures exceptionnelles allonge la journée. Ces heures s'ajoutent par-dessus la semaine contractuelle : dans une semaine déjà à 40 h, elles suivent les règles de majoration (25 % puis 50 %). Une heure peut être solo (une seule famille paie) ou partagée (chaque famille déclare sa part).",
        },
        { kind: 'heading', text: 'Présence de nuit' },
        {
          kind: 'p',
          text: 'La présence de nuit (fenêtre 20 h 00 – 06 h 30, 12 h maximum) est payée comme une indemnité à l’heure, sans compter dans les 40 h. Le taux est au minimum le quart du taux horaire net, porté au tiers à partir de la 2ᵉ intervention.',
        },
        { kind: 'heading', text: 'Présence responsable' },
        {
          kind: 'p',
          text: "La présence responsable est comptée aux deux tiers d'une heure effective. Attention : elle est interdite en garde partagée (convention collective, art. 137.1) ; ne l'utilisez qu'en garde simple.",
        },
        { kind: 'heading', text: "Présence exceptionnelle d'un enfant" },
        {
          kind: 'p',
          text: 'Si un enfant est présent en dehors de son créneau habituel, la nounou ne travaille pas plus longtemps : seule la répartition entre familles se déplace, à somme nulle.',
        },
        { kind: 'heading', text: 'Jours fériés travaillés' },
        {
          kind: 'p',
          text: "Un jour férié chômé n'ajoute rien (déjà dans le salaire mensualisé). Un jour férié travaillé ajoute une majoration : 10 % en temps normal, 100 % le 1er mai. La journée de solidarité travaillée n'ouvre pas de majoration.",
        },
        { kind: 'links', items: [PAJEMPLOI_LINK.fr, CCN_LINK.fr] },
      ],
      en: [
        {
          kind: 'p',
          text: 'Beyond the usual schedule, the app handles several situations that lengthen the nanny’s day or shift the split between families.',
        },
        { kind: 'heading', text: 'Extra hours' },
        {
          kind: 'p',
          text: 'An exceptional-hours entry lengthens the day. These hours are added on top of the contractual week: in a week already at 40 hours they follow the overtime rules (+25% then +50%). An hour can be solo (one family pays) or shared (each family declares its share).',
        },
        { kind: 'heading', text: 'Night presence' },
        {
          kind: 'p',
          text: 'Night presence (window 8:00 pm – 6:30 am, 12 hours maximum) is paid as an hourly allowance and does not count toward the 40 hours. The rate is at least a quarter of the net hourly rate, rising to a third from the 2nd intervention.',
        },
        { kind: 'heading', text: 'Responsible presence' },
        {
          kind: 'p',
          text: 'Responsible presence is counted at two thirds of an effective hour. Note: it is forbidden in shared care (collective agreement, art. 137.1); use it only for single-family care.',
        },
        { kind: 'heading', text: 'A child present outside their window' },
        {
          kind: 'p',
          text: 'If a child is present outside their usual slot, the nanny does not work any longer: only the split between families shifts, at zero sum.',
        },
        { kind: 'heading', text: 'Worked public holidays' },
        {
          kind: 'p',
          text: 'A non-worked public holiday adds nothing (already in the monthly salary). A worked one adds a premium: 10% normally, 100% on 1 May. The worked solidarity day earns no premium.',
        },
        { kind: 'links', items: [PAJEMPLOI_LINK.en, CCN_LINK.en] },
      ],
    },
  },
  {
    slug: 'securite-et-donnees',
    category: 'trust',
    icon: ShieldCheck,
    title: {
      fr: 'Sécurité, données et fiabilité des calculs',
      en: 'Security, data, and how much to trust the numbers',
    },
    summary: {
      fr: 'Où vos données sont stockées et dans quelle mesure vous appuyer sur les calculs.',
      en: 'Where your data is stored and how far to rely on the calculations.',
    },
    related: ['demarrer', 'calcul-du-salaire'],
    body: {
      fr: [
        {
          kind: 'p',
          text: 'Quelques réponses aux questions fréquentes sur la sécurité et la fiabilité.',
        },
        { kind: 'heading', text: 'Où sont stockées mes données ?' },
        {
          kind: 'p',
          text: "Vos données sont hébergées dans l'Union européenne, sur une base PostgreSQL gérée (Neon) située en Allemagne. Le traitement est soumis au RGPD ; la page Confidentialité en détaille les modalités.",
        },
        { kind: 'heading', text: 'Les calculs sont-ils fiables ?' },
        {
          kind: 'p',
          text: "L'application applique la convention collective des particuliers employeurs (IDCC 3239) : mensualisation, majorations, congés, présence. Les montants sont une aide à la déclaration — une estimation que vous vérifiez avant de valider dans Pajemploi, qui fait foi et calcule les cotisations.",
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'Ma Garde Sereine est en version bêta. Nous faisons notre maximum pour la justesse des calculs, mais nous ne pouvons pas encore en garantir les résultats : vérifiez toujours les montants avant de déclarer.',
        },
        {
          kind: 'heading',
          text: 'Quelles situations ne sont pas automatisées ?',
        },
        {
          kind: 'p',
          text: "Certains cas restent manuels : l'année incomplète (planning irrégulier) et le maintien de salaire en cas de maladie ou de maternité ne sont pas calculés automatiquement. L'application signale par des avertissements les points à vérifier.",
        },
        { kind: 'heading', text: 'Qui voit mes données en garde partagée ?' },
        {
          kind: 'p',
          text: 'Chaque famille ne voit que sa propre part et ses propres enfants. Seules les heures de la nounou sont mises en commun pour permettre le partage.',
        },
        {
          kind: 'links',
          items: [{ href: '/privacy', label: 'Politique de confidentialité' }],
        },
      ],
      en: [
        {
          kind: 'p',
          text: 'A few answers to common questions about security and reliability.',
        },
        { kind: 'heading', text: 'Where is my data stored?' },
        {
          kind: 'p',
          text: 'Your data is hosted in the European Union, on a managed PostgreSQL database (Neon) located in Germany. Processing is subject to the GDPR; the Privacy page details how.',
        },
        { kind: 'heading', text: 'Can I trust the calculations?' },
        {
          kind: 'p',
          text: 'The app applies the collective agreement for private employers (IDCC 3239): monthly averaging, overtime, leave, presence. The amounts are an aid to filing — an estimate you check before confirming in Pajemploi, which is authoritative and computes the contributions.',
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'Ma Garde Sereine is in beta. We do our best to get the calculations right, but we cannot yet guarantee the results: always check the amounts before you file.',
        },
        { kind: 'heading', text: 'Which situations are not automated?' },
        {
          kind: 'p',
          text: 'Some cases remain manual: the incomplete year (irregular schedule) and salary maintenance during sickness or maternity are not computed automatically. The app flags the points to check with warnings.',
        },
        { kind: 'heading', text: 'Who sees my data in shared care?' },
        {
          kind: 'p',
          text: 'Each family only sees its own share and its own children. Only the nanny’s hours are pooled to make sharing possible.',
        },
        {
          kind: 'links',
          items: [{ href: '/privacy', label: 'Privacy policy' }],
        },
      ],
    },
  },
]

// Fast slug lookup for the article route.
const BY_SLUG = new Map(HELP_ARTICLES.map((a) => [a.slug, a]))

export function getHelpArticle(
  slug: string | undefined,
): HelpArticle | undefined {
  return slug ? BY_SLUG.get(slug) : undefined
}

// Articles grouped by category, preserving both the category order and the
// authoring order within each shelf. Empty categories are dropped.
export function helpArticlesByCategory(): {
  category: HelpCategory
  articles: HelpArticle[]
}[] {
  return HELP_CATEGORIES.map((category) => ({
    category,
    articles: HELP_ARTICLES.filter((a) => a.category === category),
  })).filter((group) => group.articles.length > 0)
}
