// Supported UI languages. The app follows the browser's preferred language and
// falls back to English for anything unsupported.
export const LANGUAGES = ['en', 'fr'] as const
export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'en'

// Each language's endonym, for the language picker options.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  fr: 'Français',
}

// Every user-facing string keyed once per language so the two catalogs stay in
// lockstep (TypeScript enforces that both languages define the same keys).
const en = {
  'login.title': 'Welcome back',
  'login.subtitle': "Log in to track your nanny's hours.",
  'login.submit': 'Log in',
  'login.submitting': 'Logging in…',
  'login.error': 'Invalid email or password',
  'login.altPrompt': 'Need an account?',
  'login.altLink': 'Register',
  'register.title': 'Create your account',
  'register.subtitle': "Start tracking your nanny's hours in minutes.",
  'register.submit': 'Register',
  'register.submitting': 'Creating…',
  'register.error': 'Could not create account',
  'register.altPrompt': 'Already have an account?',
  'register.altLink': 'Log in',
  'field.email': 'Email',
  'field.emailPlaceholder': 'you@example.com',
  'field.password': 'Password',
  'field.passwordPlaceholder': 'Your password',
  'field.newPasswordPlaceholder': 'Choose a strong password',
  'home.title': 'Nanny Hours Tracker',
  'home.lead': 'Track hours worked by a nanny across families.',
  'home.signedInAs': 'Signed in as',
  'home.backend': 'Backend',
  'home.logout': 'Log out',
  'status.checking': 'checking…',
  'status.unreachable': 'unreachable',
  'status.unknown': 'unknown',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.system': 'System',
  'settings.light': 'Light',
  'settings.dark': 'Dark',
} as const

export type TranslationKey = keyof typeof en

const fr: Record<TranslationKey, string> = {
  'login.title': 'Bon retour',
  'login.subtitle': 'Connectez-vous pour suivre les heures de votre nounou.',
  'login.submit': 'Se connecter',
  'login.submitting': 'Connexion…',
  'login.error': 'E-mail ou mot de passe invalide',
  'login.altPrompt': 'Pas encore de compte ?',
  'login.altLink': "S'inscrire",
  'register.title': 'Créez votre compte',
  'register.subtitle':
    'Commencez à suivre les heures de votre nounou en quelques minutes.',
  'register.submit': "S'inscrire",
  'register.submitting': 'Création…',
  'register.error': 'Impossible de créer le compte',
  'register.altPrompt': 'Vous avez déjà un compte ?',
  'register.altLink': 'Se connecter',
  'field.email': 'E-mail',
  'field.emailPlaceholder': 'vous@exemple.com',
  'field.password': 'Mot de passe',
  'field.passwordPlaceholder': 'Votre mot de passe',
  'field.newPasswordPlaceholder': 'Choisissez un mot de passe robuste',
  'home.title': 'Suivi des heures de nounou',
  'home.lead':
    'Suivez les heures travaillées par une nounou pour plusieurs familles.',
  'home.signedInAs': 'Connecté en tant que',
  'home.backend': 'Serveur',
  'home.logout': 'Se déconnecter',
  'status.checking': 'vérification…',
  'status.unreachable': 'injoignable',
  'status.unknown': 'inconnu',
  'settings.language': 'Langue',
  'settings.theme': 'Thème',
  'settings.system': 'Système',
  'settings.light': 'Clair',
  'settings.dark': 'Sombre',
}

export const translations: Record<Language, Record<TranslationKey, string>> = {
  en,
  fr,
}
