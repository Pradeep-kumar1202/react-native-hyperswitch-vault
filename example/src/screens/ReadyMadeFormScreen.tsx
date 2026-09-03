/**
 * Screen 2 — the ready-made `HyperswitchVaultForm`. The same provider props as the custom layout
 * plus `layout`, `fieldArrangement`, `fieldOptions` and `fieldStyles`, all unset by default.
 * Example code only.
 *
 * @format
 */
import React, {useCallback, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  HyperswitchVaultForm,
  type MerchantSession,
  type VaultFieldArrangement,
  type VaultFormFieldOptions,
  type VaultFormFieldStyles,
  type VaultFormHandle,
  type VaultFormLayout,
  type VaultFormState,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {logFormState} from '../eventLog';
import {Button, Chips, Hint, Label, LogBox, ResultBox, Row, Section, compact, formLine, triValue, ui, useEventLog, type Tri} from '../harness/controls';
import {FIELD_STYLE_PRESETS} from '../harness/fixtures';
import {
  FIELD_KINDS,
  FieldPropsEditor,
  cardNumberOptionsOf,
  cvcOptionsOf,
  emptyFieldDraft,
  plainOptionsOf,
  setCount,
  type FieldDraft,
  type FieldKind,
} from '../harness/FieldPropsEditor';
import {ProviderPropsEditor, emptyProviderDraft, providerPropsOf, providerSetCount} from '../harness/ProviderPropsEditor';
import {useFormActions} from '../harness/useFormActions';

const LAYOUTS: Tri<VaultFormLayout>[] = ['unset', 'stacked', 'inline'];
const ARRANGEMENTS: Tri<VaultFieldArrangement>[] = ['unset', 'separate', 'fused'];
const TITLES: Record<FieldKind, string> = {
  cardholderName: 'fieldOptions.cardholderName / fieldStyles.cardholderName',
  cardNumber: 'fieldOptions.cardNumber / fieldStyles.cardNumber',
  expiry: 'fieldOptions.expiry / fieldStyles.expiry',
  cvc: 'fieldOptions.cvc / fieldStyles.cvc',
};

export function ReadyMadeFormScreen({session}: {session: MerchantSession}) {
  const formRef = useRef<VaultFormHandle>(null);
  const {lines, append, clear} = useEventLog();

  const [provider, setProvider] = useState(emptyProviderDraft);
  const [layout, setLayout] = useState<Tri<VaultFormLayout>>('unset');
  const [arrangement, setArrangement] = useState<Tri<VaultFieldArrangement>>('unset');
  const [fields, setFields] = useState<Record<FieldKind, FieldDraft>>({
    cardholderName: emptyFieldDraft('cardholderName'),
    cardNumber: emptyFieldDraft('cardNumber'),
    expiry: emptyFieldDraft('expiry'),
    cvc: emptyFieldDraft('cvc'),
  });
  const [formState, setFormState] = useState<VaultFormState | null>(null);

  const onFormStateChange = useCallback(
    (state: VaultFormState) => {
      setFormState(state);
      logFormState(state);
      append(formLine(state));
    },
    [append],
  );
  const actions = useFormActions(formRef, append);
  const setField = (kind: FieldKind) => (next: FieldDraft) => setFields(previous => ({...previous, [kind]: next}));

  const fieldOptions: VaultFormFieldOptions | undefined = compact({
    cardNumber: cardNumberOptionsOf(fields.cardNumber),
    expiry: plainOptionsOf(fields.expiry),
    cvc: cvcOptionsOf(fields.cvc),
    cardholderName: plainOptionsOf(fields.cardholderName),
  });
  const fieldStyles: VaultFormFieldStyles | undefined = compact({
    cardNumber: fields.cardNumber.styled ? FIELD_STYLE_PRESETS.cardNumber : undefined,
    expiry: fields.expiry.styled ? FIELD_STYLE_PRESETS.expiry : undefined,
    cvc: fields.cvc.styled ? FIELD_STYLE_PRESETS.cvc : undefined,
    cardholderName: fields.cardholderName.styled ? FIELD_STYLE_PRESETS.cardholderName : undefined,
  });

  const canSubmit = formState?.canSubmit === true;

  return (
    <View style={s.screen}>
      <Text style={ui.title}>Ready-made form</Text>
      <Text style={ui.subtitle}>HyperswitchVaultForm renders all four fields itself. Nothing is passed until you set it below.</Text>

      <HyperswitchVaultForm
        ref={formRef}
        {...providerPropsOf(provider, session, onFormStateChange)}
        layout={triValue(layout)}
        fieldArrangement={triValue(arrangement)}
        fieldOptions={fieldOptions}
        fieldStyles={fieldStyles}
      />

      <Button label="tokenize()" primary onPress={actions.tokenize} busy={actions.busy} dim={!canSubmit} />
      <Row>
        <Button label="tokenize() ×2" onPress={actions.tokenizeTwice} />
        <Button label="reset()" onPress={actions.reset} />
      </Row>
      <Row>
        <Button label="focus(number)" onPress={() => actions.focus('cardNumber')} />
        <Button label="focus(expiry)" onPress={() => actions.focus('expiry')} />
        <Button label="focus(cvc)" onPress={() => actions.focus('cvc')} />
        <Button label="focus(name)" onPress={() => actions.focus('cardholderName')} />
      </Row>

      <ResultBox outcome={actions.outcome} />

      {formState ? (
        <View style={ui.status}>
          {(
            [
              ['session', formState.sessionStatus],
              ['fieldsReady', formState.fieldsReady],
              ['complete', formState.complete],
              ['valid', formState.valid],
              ['canSubmit', formState.canSubmit],
              ['brand', formState.brand],
              ['name field', formState.fields.cardholderName !== undefined],
            ] as Array<[string, string | boolean]>
          ).map(([name, value]) => (
            <View key={name} style={[ui.statusPill, value === true && ui.statusPillOn]}>
              <Text style={ui.statusText}>
                {name}={String(value)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Hint text="onFormStateChange is detached: no form state is reported." />
      )}

      <Section title="Layout" badge={`${[layout, arrangement].filter(v => v !== 'unset').length} set`}>
        <Label text="layout" />
        <Chips options={LAYOUTS} value={layout} onChange={setLayout} />
        <Hint text="stacked (default): three rows · inline: expiry and CVC share a row." />
        <Label text="fieldArrangement" />
        <Chips options={ARRANGEMENTS} value={arrangement} onChange={setArrangement} />
        <Hint text="separate (default): each field bordered · fused: joined borders." />
      </Section>

      <Section title="Provider props" badge={`${providerSetCount(provider)} set`}>
        <ProviderPropsEditor draft={provider} onChange={setProvider} readyMade />
      </Section>

      <Section title="fieldOptions / fieldStyles" hint="Per field. Members left unset are not passed; an all-unset field is omitted from the record.">
        {FIELD_KINDS.map(kind => (
          <Section key={kind} title={TITLES[kind]} badge={`${setCount(fields[kind], 'form')} set`}>
            <FieldPropsEditor kind={kind} mode="form" draft={fields[kind]} onChange={setField(kind)} />
          </Section>
        ))}
      </Section>

      <LogBox lines={lines} onClear={clear} />
    </View>
  );
}

const s = StyleSheet.create({screen: {gap: 12}});
