/**
 * The props shared by `HyperswitchVaultFormProvider` and the ready-made `HyperswitchVaultForm`,
 * every one unset by default. Example code only.
 *
 * @format
 */
import React from 'react';
import type {
  HyperswitchVaultFormProviderProps,
  MerchantSession,
  VaultCardholderNameMode,
  VaultEnvironment,
  VaultFormState,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {Chips, Field, Hint, Label, MultiChips, Row, Toggle, orUndefined, triBool, triValue, type Tri} from './controls';
import {
  APPEARANCE_NAMES,
  APPEARANCE_PRESETS,
  LOCALISATION_NAMES,
  LOCALISATION_PRESETS,
  SCHEMES,
  SESSION_CHOICES,
  sessionFor,
  type AppearancePreset,
  type LocalisationPreset,
  type SessionChoice,
} from './fixtures';

export type ProviderDraft = {
  session: SessionChoice;
  environment: VaultEnvironment;
  appearance: Tri<AppearancePreset>;
  localisation: Tri<LocalisationPreset>;
  disabled: boolean;
  accessible: Tri<'true' | 'false'>;
  schemes: string[];
  vaultBaseUrl: string;
  cardholderName: Tri<VaultCardholderNameMode>;
  unstyled: Tri<'true' | 'false'>;
  listen: boolean;
};

export const emptyProviderDraft = (): ProviderDraft => ({
  session: 'valid',
  /* Matches the merchant server's HYPERSWITCH_ENVIRONMENT in this checkout. */
  environment: 'production',
  appearance: 'unset',
  localisation: 'unset',
  disabled: false,
  accessible: 'unset',
  schemes: [],
  vaultBaseUrl: '',
  cardholderName: 'unset',
  unstyled: 'unset',
  /* The one thing on by default: it drives the button state and the log. */
  listen: true,
});

export type ProviderProps = Omit<HyperswitchVaultFormProviderProps, 'children'>;

export const providerPropsOf = (
  d: ProviderDraft,
  session: MerchantSession,
  onFormStateChange: (s: VaultFormState) => void,
): ProviderProps => ({
  session: sessionFor(d.session, session),
  environment: d.environment,
  appearance: d.appearance === 'unset' ? undefined : APPEARANCE_PRESETS[d.appearance],
  localisation: d.localisation === 'unset' ? undefined : LOCALISATION_PRESETS[d.localisation],
  disabled: d.disabled ? true : undefined,
  accessible: triBool(d.accessible),
  enabledCardSchemes: d.schemes.length > 0 ? d.schemes : undefined,
  vaultEndpoint: orUndefined(d.vaultBaseUrl) ? {baseUrl: d.vaultBaseUrl} : undefined,
  cardholderName: triValue(d.cardholderName),
  unstyled: triBool(d.unstyled),
  onFormStateChange: d.listen ? onFormStateChange : undefined,
});

export const providerSetCount = (d: ProviderDraft) =>
  [
    d.session !== 'valid',
    d.appearance !== 'unset',
    d.localisation !== 'unset',
    d.disabled,
    d.accessible !== 'unset',
    d.schemes.length > 0,
    d.vaultBaseUrl.trim().length > 0,
    d.cardholderName !== 'unset',
    d.unstyled !== 'unset',
    !d.listen,
  ].filter(Boolean).length;

const ENVIRONMENTS: VaultEnvironment[] = ['sandbox', 'production', 'integration'];
const APPEARANCES: Tri<AppearancePreset>[] = ['unset', ...APPEARANCE_NAMES];
const LOCALISATIONS: Tri<LocalisationPreset>[] = ['unset', ...LOCALISATION_NAMES];
const NAME_MODES: Tri<VaultCardholderNameMode>[] = ['unset', 'collect', 'omit'];
const BOOLS: Tri<'true' | 'false'>[] = ['unset', 'true', 'false'];

export function ProviderPropsEditor({
  draft,
  onChange,
  readyMade,
}: {
  draft: ProviderDraft;
  onChange: (next: ProviderDraft) => void;
  readyMade: boolean;
}) {
  const set = <K extends keyof ProviderDraft>(key: K, value: ProviderDraft[K]) => onChange({...draft, [key]: value});
  return (
    <>
      <Label text="session" />
      <Chips options={SESSION_CHOICES} value={draft.session} onChange={v => set('session', v)} />
      <Hint text="broken → error/invalid_session on tokenize(); absent → sessionStatus 'absent' and tokenize() refuses without a request." />

      <Label text="environment" />
      <Chips options={ENVIRONMENTS} value={draft.environment} onChange={v => set('environment', v)} />
      <Hint text="Must match the merchant server's HYPERSWITCH_ENVIRONMENT, or the vault refuses the session." />

      <Label text="appearance" />
      <Chips options={APPEARANCES} value={draft.appearance} onChange={v => set('appearance', v)} />

      <Label text="localisation" />
      <Chips options={LOCALISATIONS} value={draft.localisation} onChange={v => set('localisation', v)} />
      <Hint text="labelsOnly renames placeholders and labels; messagesOnly replaces validation text; rtl flips direction." />

      <Label text="enabledCardSchemes (none selected = prop not passed)" />
      <MultiChips
        options={SCHEMES}
        value={draft.schemes}
        onToggle={scheme =>
          set('schemes', draft.schemes.includes(scheme) ? draft.schemes.filter(s => s !== scheme) : [...draft.schemes, scheme])
        }
      />
      <Hint text="A COMPLETED number outside the list fails with unsupportedCard and sets networkError; a co-badged card shows the chooser." />

      <Label text="cardholderName mode" />
      <Chips options={NAME_MODES} value={draft.cardholderName} onChange={v => set('cardholderName', v)} />
      <Hint
        text={
          readyMade
            ? 'collect (default) renders the name field; omit hides it and sends no name.'
            : 'In a custom layout this decides whose value is SENT; mount the field yourself under Fields.'
        }
      />

      <Label text="vaultEndpoint.baseUrl" />
      <Field value={draft.vaultBaseUrl} onChange={v => set('vaultBaseUrl', v)} placeholder="empty → the environment's host · try ftp://nope" autoCapitalize="none" />

      <Label text="accessible / unstyled" />
      <Row>
        <Chips options={BOOLS} value={draft.accessible} onChange={v => set('accessible', v)} />
      </Row>
      <Chips options={BOOLS} value={draft.unstyled} onChange={v => set('unstyled', v)} />
      <Hint text="unstyled strips every field to a bare TextInput; a field's own unstyled overrides it either way." />

      <Row>
        <Toggle on={draft.disabled} label="disabled" onPress={() => set('disabled', !draft.disabled)} />
        <Toggle on={draft.listen} label="onFormStateChange" onPress={() => set('listen', !draft.listen)} />
      </Row>
    </>
  );
}
