/**
 * Presets a chip can switch on. Every one is a plain value the library accepts; none is applied
 * unless a chip says so. Example code only.
 *
 * @format
 */
import type {
  MerchantSession,
  VaultCardExpiryStyles,
  VaultFieldStyles,
  VaultFormAppearance,
  VaultFormLocalisation,
} from '@juspay-tech/react-native-hyperswitch-vault';

/* `appearance.variables.*` carries the web SDK's variable names; `appearance.labels` its label mode. */
export const APPEARANCE_PRESETS = {
  brand: {
    variables: {
      colorPrimary: '#0B5FBF',
      colorText: '#0B1220',
      colorTextPlaceholder: '#94A3B8',
      borderColor: '#D7E0E5',
      colorDanger: '#DC2626',
      borderRadius: 12,
      inputFieldHeight: 56,
    },
  },
  dark: {
    variables: {
      colorPrimary: '#93C5FD',
      colorText: '#F8FAFC',
      colorTextPlaceholder: '#94A3B8',
      colorBackground: '#0B1220',
      borderColor: '#334155',
      colorDanger: '#F87171',
      borderRadius: 8,
      borderWidth: 1,
      inputFieldHeight: 52,
    },
  },
  compact: {
    variables: {
      borderRadius: 4,
      borderWidth: 2,
      inputFieldHeight: 44,
      gap: 6,
      fontScale: 0.9,
      fontFamily: 'Courier',
      errorTextSizeAdjust: -1,
      errorMessageSpacing: 2,
      cardBrandIcon: 'animated',
    },
  },
  /* The web SDK's default label mode: a static label above the box, placeholder inside. */
  webLabels: {labels: 'above'},
} satisfies Record<string, VaultFormAppearance>;
export type AppearancePreset = keyof typeof APPEARANCE_PRESETS;
export const APPEARANCE_NAMES = Object.keys(APPEARANCE_PRESETS) as AppearancePreset[];

export const FIELD_STYLE_PRESETS: {
  cardNumber: VaultFieldStyles;
  cardExpiry: VaultCardExpiryStyles;
  cardCvc: VaultFieldStyles;
  cardholderName: VaultFieldStyles;
} = {
  cardNumber: {
    container: {borderWidth: 2, borderColor: '#0B5FBF', borderRadius: 16, backgroundColor: '#F2F7FF'},
    input: {fontSize: 18, fontWeight: '600', letterSpacing: 1.2},
    label: {color: '#0B5FBF', fontWeight: '700'},
    placeholder: {fontStyle: 'italic'},
    error: {fontWeight: '700'},
    accessory: {opacity: 0.85},
  },
  cardExpiry: {
    container: {borderWidth: 2, borderColor: '#7C3AED', borderRadius: 16, backgroundColor: '#F7F2FF'},
    input: {fontSize: 17, fontWeight: '600'},
    label: {color: '#7C3AED', fontWeight: '700'},
  },
  cardCvc: {
    container: {borderWidth: 2, borderColor: '#0F766E', borderRadius: 16, backgroundColor: '#F0FBF9'},
    input: {fontSize: 17, fontWeight: '600'},
    label: {color: '#0F766E', fontWeight: '700'},
  },
  cardholderName: {
    container: {borderWidth: 2, borderColor: '#B45309', borderRadius: 16, backgroundColor: '#FFF9F0'},
    input: {fontSize: 16},
    label: {color: '#B45309', fontWeight: '700'},
  },
};

const frenchLabels: NonNullable<VaultFormLocalisation['labels']> = {
  cardNumberPlaceholder: 'Numéro de carte',
  cardNumberFloatingLabel: 'Numéro de carte',
  expiryPlaceholder: 'MM / AA',
  expiryFloatingLabel: 'Expiration',
  cvcPlaceholder: 'CVC',
  cvcFloatingLabel: 'Cryptogramme',
  cardholderNamePlaceholder: 'Nom sur la carte',
  cardholderNameFloatingLabel: 'Titulaire',
  selectCardBrandLabel: 'Choisissez un réseau',
};

const frenchMessages: NonNullable<VaultFormLocalisation['validationMessages']> = {
  cardNumberRequired: '★ FR — saisissez un numéro de carte',
  cardNumberInvalid: '★ FR — ce numéro de carte est invalide',
  expiryRequired: '★ FR — saisissez la date d’expiration',
  expiryInvalid: '★ FR — cette date d’expiration est invalide',
  cvcRequired: '★ FR — saisissez le cryptogramme',
  cvcInvalid: '★ FR — ce cryptogramme est invalide',
  unsupportedCard: '★ FR — ce réseau de carte n’est pas accepté',
};

/* `localisation` is the override layer ON TOP of `locale`; these presets exercise it alone. */
export const LOCALISATION_PRESETS = {
  french: {labels: frenchLabels, validationMessages: frenchMessages, isRtl: false},
  labelsOnly: {labels: frenchLabels},
  messagesOnly: {validationMessages: frenchMessages},
  rtl: {isRtl: true},
} satisfies Record<string, VaultFormLocalisation>;
export type LocalisationPreset = keyof typeof LOCALISATION_PRESETS;
export const LOCALISATION_NAMES = Object.keys(LOCALISATION_PRESETS) as LocalisationPreset[];

/* `locale` codes, as on the web: the sdk-utils bundle is selected and every string follows. */
export const LOCALES = ['en', 'fr', 'de', 'es', 'ar', 'ja', 'he', 'nl-BE'] as const;

/*
 * Spellings `enabledCardSchemes` accepts. The library canonicalises case, spaces and the common
 * aliases; an unrecognised entry is ignored and, in development, warned about.
 */
export const SCHEMES = [
  'Visa',
  'Mastercard',
  'AmericanExpress',
  'RuPay',
  'DinersClub',
  'Discover',
  'JCB',
  'Maestro',
  'UnionPay',
  'CartesBancaires',
  'Interac',
  'visa',
  'amex',
  'NotARealNetwork',
] as const;

/* A session this library must refuse (`invalid_session`): another vault's. */
export const brokenSession: MerchantSession = {
  session_token: [],
  vault_details: {vault_type: 'vgs', vault_data: {sdk_authorization: 'not-a-hyperswitch-session'}},
};

export type SessionChoice = 'valid' | 'broken' | 'absent';
export const SESSION_CHOICES: SessionChoice[] = ['valid', 'broken', 'absent'];

export const sessionFor = (choice: SessionChoice, session: MerchantSession): MerchantSession | undefined =>
  choice === 'valid' ? session : choice === 'broken' ? brokenSession : undefined;
