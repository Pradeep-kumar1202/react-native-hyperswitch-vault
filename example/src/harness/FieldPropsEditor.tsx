/**
 * One editor for one field's props. The same draft feeds a field component in the custom layout
 * (flattened props) and a member of `fieldOptions` / `fieldStyles` on the ready-made form.
 * Everything starts empty or unset. Example code only.
 *
 * @format
 */
import React from 'react';
import type {
  VaultCardBrandIcon,
  VaultCVCIconDisplay,
  VaultCardCVCOptions,
  VaultCardNumberOptions,
  VaultErrorDisplay,
  VaultFieldOptions,
  VaultLabelBehavior,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {Chips, Field, Hint, Label, Row, Toggle, compact, orUndefined, triBool, triValue, type Tri} from './controls';

/* The web SDK's field identifiers, plus the cardholder name only this library collects. */
export type FieldKind = 'cardNumber' | 'cardExpiry' | 'cardCvc' | 'cardholderName';
export const FIELD_KINDS: FieldKind[] = ['cardholderName', 'cardNumber', 'cardExpiry', 'cardCvc'];

export type FieldDraft = {
  /* custom layout only */
  mounted: boolean;
  duplicate: boolean;
  listen: boolean;
  /* both layouts */
  styled: boolean;
  placeholder: string;
  label: string;
  accessibilityLabel: string;
  accessibilityHint: string;
  testID: string;
  labelBehavior: Tri<VaultLabelBehavior>;
  errorDisplay: Tri<VaultErrorDisplay>;
  unstyled: Tri<'true' | 'false'>;
  cardBrandIcon: Tri<VaultCardBrandIcon>; // card number only
  cvcIcon: Tri<VaultCVCIconDisplay>; // CVC only
};

export const emptyFieldDraft = (kind: FieldKind): FieldDraft => ({
  /* The three required fields are mounted; the optional name is not, so the default is the bare form. */
  mounted: kind !== 'cardholderName',
  duplicate: false,
  listen: false,
  styled: false,
  placeholder: '',
  label: '',
  accessibilityLabel: '',
  accessibilityHint: '',
  testID: '',
  labelBehavior: 'unset',
  errorDisplay: 'unset',
  unstyled: 'unset',
  cardBrandIcon: 'unset',
  cvcIcon: 'unset',
});

const LABEL_BEHAVIORS: Tri<VaultLabelBehavior>[] = ['unset', 'above', 'floating', 'never'];
const ERROR_DISPLAYS: Tri<VaultErrorDisplay>[] = ['unset', 'none', 'colorOnly', 'inline'];
const BOOLS: Tri<'true' | 'false'>[] = ['unset', 'true', 'false'];
const BRAND_ICONS: Tri<VaultCardBrandIcon>[] = ['unset', 'standard', 'animated', 'hidden', 'hideGeneric'];
const CVC_ICONS: Tri<VaultCVCIconDisplay>[] = ['unset', 'hidden', 'default'];

/* The members every field shares, each undefined when unset. */
const commonOptions = (d: FieldDraft) => ({
  placeholder: orUndefined(d.placeholder),
  label: orUndefined(d.label),
  labelBehavior: triValue(d.labelBehavior),
  errorDisplay: triValue(d.errorDisplay),
  accessibilityLabel: orUndefined(d.accessibilityLabel),
  accessibilityHint: orUndefined(d.accessibilityHint),
  testID: orUndefined(d.testID),
  unstyled: triBool(d.unstyled),
});

export const cardNumberOptionsOf = (d: FieldDraft): VaultCardNumberOptions | undefined =>
  compact({...commonOptions(d), cardBrandIcon: triValue(d.cardBrandIcon)});
export const cvcOptionsOf = (d: FieldDraft): VaultCardCVCOptions | undefined =>
  compact({...commonOptions(d), cvcIcon: triValue(d.cvcIcon)});
export const plainOptionsOf = (d: FieldDraft): VaultFieldOptions | undefined => compact(commonOptions(d));

/* How many members are set, for the section badge. */
export const setCount = (d: FieldDraft, mode: 'custom' | 'form') => {
  let n = Object.values(commonOptions(d)).filter(v => v !== undefined).length;
  if (d.cardBrandIcon !== 'unset') {n += 1;}
  if (d.cvcIcon !== 'unset') {n += 1;}
  if (d.styled) {n += 1;}
  if (mode === 'custom') {
    if (d.listen) {n += 1;}
    if (d.duplicate) {n += 1;}
    if (!d.mounted) {n += 1;}
  }
  return n;
};

export function FieldPropsEditor({
  kind,
  mode,
  draft,
  onChange,
}: {
  kind: FieldKind;
  mode: 'custom' | 'form';
  draft: FieldDraft;
  onChange: (next: FieldDraft) => void;
}) {
  const set = <K extends keyof FieldDraft>(key: K, value: FieldDraft[K]) => onChange({...draft, [key]: value});
  return (
    <>
      <Row>
        {mode === 'custom' ? (
          <>
            <Toggle on={draft.mounted} label="mounted" onPress={() => set('mounted', !draft.mounted)} />
            <Toggle on={draft.duplicate} label="mount twice" onPress={() => set('duplicate', !draft.duplicate)} />
            <Toggle on={draft.listen} label="field events" onPress={() => set('listen', !draft.listen)} />
          </>
        ) : null}
        <Toggle on={draft.styled} label={mode === 'custom' ? 'styles preset' : 'fieldStyles preset'} onPress={() => set('styled', !draft.styled)} />
      </Row>
      {mode === 'custom' && kind !== 'cardholderName' ? (
        <Hint text="Unmounting or mounting twice makes tokenize() answer incomplete_field_set. The name is optional and never gates." />
      ) : null}
      <Field value={draft.placeholder} onChange={v => set('placeholder', v)} placeholder="placeholder (a single space = no placeholder)" />
      <Field value={draft.label} onChange={v => set('label', v)} placeholder="label" />
      <Field value={draft.accessibilityLabel} onChange={v => set('accessibilityLabel', v)} placeholder="accessibilityLabel" />
      <Field value={draft.accessibilityHint} onChange={v => set('accessibilityHint', v)} placeholder="accessibilityHint" />
      <Field value={draft.testID} onChange={v => set('testID', v)} placeholder="testID" autoCapitalize="none" />
      <Label text="labelBehavior (overrides appearance.labels)" />
      <Chips options={LABEL_BEHAVIORS} value={draft.labelBehavior} onChange={v => set('labelBehavior', v)} />
      <Label text="errorDisplay" />
      <Chips options={ERROR_DISPLAYS} value={draft.errorDisplay} onChange={v => set('errorDisplay', v)} />
      <Label text="unstyled" />
      <Chips options={BOOLS} value={draft.unstyled} onChange={v => set('unstyled', v)} />
      {kind === 'cardNumber' ? (
        <>
          <Label text="cardBrandIcon (card number only)" />
          <Chips options={BRAND_ICONS} value={draft.cardBrandIcon} onChange={v => set('cardBrandIcon', v)} />
        </>
      ) : null}
      {kind === 'cardCvc' ? (
        <>
          <Label text="cvcIcon (CVC only)" />
          <Chips options={CVC_ICONS} value={draft.cvcIcon} onChange={v => set('cvcIcon', v)} />
        </>
      ) : null}
    </>
  );
}
