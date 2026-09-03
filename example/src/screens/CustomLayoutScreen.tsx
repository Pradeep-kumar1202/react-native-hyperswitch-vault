/**
 * Screen 1 — the provider with the four field widgets placed by hand. Every provider prop and every
 * field prop is editable below the form; all of them start unset, so what renders first is the
 * library's three default fields and nothing else. Example code only.
 *
 * @format
 */
import React, {useCallback, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  CardCVCField,
  CardExpiryField,
  CardNumberField,
  CardholderNameField,
  CardForm,
  type MerchantSession,
  type VaultFieldState,
  type VaultFormHandle,
  type VaultFormState,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {logFieldState, logFormState} from '../eventLog';
import {Button, Hint, LogBox, ResultBox, Row, Section, Toggle, fieldLine, formLine, ui, useEventLog} from '../harness/controls';
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

const TITLES: Record<FieldKind, string> = {
  cardholderName: 'CardholderNameField (optional)',
  cardNumber: 'CardNumberField',
  expiry: 'CardExpiryField',
  cvc: 'CardCVCField',
};

export function CustomLayoutScreen({session}: {session: MerchantSession}) {
  const formRef = useRef<VaultFormHandle>(null);
  const {lines, append, clear} = useEventLog();

  const [provider, setProvider] = useState(emptyProviderDraft);
  const [fields, setFields] = useState<Record<FieldKind, FieldDraft>>({
    cardholderName: emptyFieldDraft('cardholderName'),
    cardNumber: emptyFieldDraft('cardNumber'),
    expiry: emptyFieldDraft('expiry'),
    cvc: emptyFieldDraft('cvc'),
  });
  const [inlineRow, setInlineRow] = useState(false);
  const [formState, setFormState] = useState<VaultFormState | null>(null);

  const onFormStateChange = useCallback(
    (state: VaultFormState) => {
      setFormState(state);
      logFormState(state);
      append(formLine(state));
    },
    [append],
  );
  const onFieldStateChange = useCallback(
    (state: VaultFieldState) => {
      logFieldState(state);
      append(fieldLine(state));
    },
    [append],
  );

  const actions = useFormActions(formRef, append);
  const setField = (kind: FieldKind) => (next: FieldDraft) => setFields(previous => ({...previous, [kind]: next}));

  /* One field widget, from its draft. Rendered twice when "mount twice" is on. */
  const widget = (kind: FieldKind, copy: number) => {
    const d = fields[kind];
    const listener = d.listen ? onFieldStateChange : undefined;
    const key = `${kind}-${copy}`;
    switch (kind) {
      case 'cardNumber':
        return <CardNumberField key={key} {...cardNumberOptionsOf(d)} styles={d.styled ? FIELD_STYLE_PRESETS.cardNumber : undefined} onStateChange={listener} />;
      case 'expiry':
        return <CardExpiryField key={key} {...plainOptionsOf(d)} styles={d.styled ? FIELD_STYLE_PRESETS.expiry : undefined} onStateChange={listener} />;
      case 'cvc':
        return <CardCVCField key={key} {...cvcOptionsOf(d)} styles={d.styled ? FIELD_STYLE_PRESETS.cvc : undefined} onStateChange={listener} />;
      case 'cardholderName':
        return <CardholderNameField key={key} {...plainOptionsOf(d)} styles={d.styled ? FIELD_STYLE_PRESETS.cardholderName : undefined} onStateChange={listener} />;
    }
  };
  const copies = (kind: FieldKind) => (fields[kind].mounted ? (fields[kind].duplicate ? [0, 1] : [0]) : []);
  const block = (kind: FieldKind) => copies(kind).map(copy => <View key={`${kind}-${copy}`} style={s.field}>{widget(kind, copy)}</View>);

  const canSubmit = formState?.canSubmit === true;

  return (
    <View style={s.screen}>
      <Text style={ui.title}>Custom layout</Text>
      <Text style={ui.subtitle}>CardForm + the field widgets. Nothing is passed until you set it below.</Text>

      {/* ── THE FORM ─────────────────────────────────────────────────────── */}
      <CardForm ref={formRef} {...providerPropsOf(provider, session, onFormStateChange)}>
        {block('cardholderName')}
        {block('cardNumber')}
        {inlineRow ? (
          <View style={s.inline}>
            <View style={s.inlineItem}>{block('expiry')}</View>
            <View style={s.inlineItem}>{block('cvc')}</View>
          </View>
        ) : (
          <>
            {block('expiry')}
            {block('cvc')}
          </>
        )}
      </CardForm>

      {/* ── THE HANDLE ───────────────────────────────────────────────────── */}
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

      {/* ── WHAT THE FORM SAYS ABOUT ITSELF ──────────────────────────────── */}
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
              ['coBadged', formState.isCoBadged],
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
        <Hint text="onFormStateChange is detached: no form state is reported. The button above is enabled blindly." />
      )}

      {/* ── THE PROPS ────────────────────────────────────────────────────── */}
      <Section title="Provider props" badge={`${providerSetCount(provider)} set`} hint="Each change re-resolves live while the form stays mounted.">
        <ProviderPropsEditor draft={provider} onChange={setProvider} readyMade={false} />
      </Section>

      <Section title="Fields" badge={`${FIELD_KINDS.filter(k => fields[k].mounted).length} mounted`}>
        <Row>
          <Toggle on={inlineRow} label="expiry + CVC on one row" onPress={() => setInlineRow(v => !v)} />
        </Row>
        {FIELD_KINDS.map(kind => (
          <Section key={kind} title={TITLES[kind]} badge={`${setCount(fields[kind], 'custom')} set`}>
            <FieldPropsEditor kind={kind} mode="custom" draft={fields[kind]} onChange={setField(kind)} />
          </Section>
        ))}
      </Section>

      <LogBox lines={lines} onClear={clear} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: {gap: 12},
  field: {marginBottom: 2},
  inline: {flexDirection: 'row', gap: 12},
  inlineItem: {flex: 1},
});
