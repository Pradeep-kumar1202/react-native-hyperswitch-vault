/**
 * Screen 1 — the provider with the four field components placed by hand. Every provider prop and
 * every field prop is editable below the form; all of them start unset, so what renders first is
 * the library's three default fields and nothing else. Example code only.
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
  type VaultCardFormChange,
  type VaultCardFormEvent,
  type VaultFieldChange,
  type VaultFormHandle,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {logFieldChange, logFieldEvent, logFormChange, logFormReady} from '../eventLog';
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
  cardExpiry: 'CardExpiryField',
  cardCvc: 'CardCVCField',
};

export function CustomLayoutScreen({session}: {session: MerchantSession}) {
  const formRef = useRef<VaultFormHandle>(null);
  const {lines, append, clear} = useEventLog();

  const [provider, setProvider] = useState(emptyProviderDraft);
  const [fields, setFields] = useState<Record<FieldKind, FieldDraft>>({
    cardholderName: emptyFieldDraft('cardholderName'),
    cardNumber: emptyFieldDraft('cardNumber'),
    cardExpiry: emptyFieldDraft('cardExpiry'),
    cardCvc: emptyFieldDraft('cardCvc'),
  });
  const [inlineRow, setInlineRow] = useState(false);
  const [formState, setFormState] = useState<VaultCardFormChange | null>(null);

  const onFormChange = useCallback(
    (e: VaultCardFormChange) => {
      setFormState(e);
      logFormChange(e);
      append(formLine(e));
    },
    [append],
  );
  const onFormReady = useCallback(
    (e: VaultCardFormEvent) => {
      logFormReady(e);
      append(`ready ${e.elementType}`);
    },
    [append],
  );
  const onFieldChange = useCallback(
    (e: VaultFieldChange) => {
      logFieldChange(e);
      append(fieldLine(e));
    },
    [append],
  );
  const fieldEvent = useCallback(
    (name: 'ready' | 'focus' | 'blur') => (e: {elementType: string}) => {
      logFieldEvent(name)(e as never);
      append(`${name} ${e.elementType}`);
    },
    [append],
  );

  const actions = useFormActions(formRef, append);
  const setField = (kind: FieldKind) => (next: FieldDraft) => setFields(previous => ({...previous, [kind]: next}));

  /* One field component, from its draft. Rendered twice when "mount twice" is on. */
  const widget = (kind: FieldKind, copy: number) => {
    const d = fields[kind];
    const events = d.listen
      ? {onReady: fieldEvent('ready'), onFocus: fieldEvent('focus'), onBlur: fieldEvent('blur'), onChange: onFieldChange}
      : {};
    const key = `${kind}-${copy}`;
    switch (kind) {
      case 'cardNumber':
        return <CardNumberField key={key} {...cardNumberOptionsOf(d)} styles={d.styled ? FIELD_STYLE_PRESETS.cardNumber : undefined} {...events} />;
      case 'cardExpiry':
        return <CardExpiryField key={key} {...plainOptionsOf(d)} styles={d.styled ? FIELD_STYLE_PRESETS.cardExpiry : undefined} {...events} />;
      case 'cardCvc':
        return <CardCVCField key={key} {...cvcOptionsOf(d)} styles={d.styled ? FIELD_STYLE_PRESETS.cardCvc : undefined} {...events} />;
      case 'cardholderName':
        return <CardholderNameField key={key} {...plainOptionsOf(d)} styles={d.styled ? FIELD_STYLE_PRESETS.cardholderName : undefined} {...events} />;
    }
  };
  const copies = (kind: FieldKind) => (fields[kind].mounted ? (fields[kind].duplicate ? [0, 1] : [0]) : []);
  const block = (kind: FieldKind) => copies(kind).map(copy => <View key={`${kind}-${copy}`} style={s.field}>{widget(kind, copy)}</View>);

  const canSubmit = formState?.canSubmit === true;

  return (
    <View style={s.screen}>
      <Text style={ui.title}>Custom layout</Text>
      <Text style={ui.subtitle}>CardForm + the field components. Nothing is passed until you set it below.</Text>

      {/* ── THE FORM ─────────────────────────────────────────────────────── */}
      <CardForm ref={formRef} {...providerPropsOf(provider, session, onFormChange, onFormReady)}>
        {block('cardholderName')}
        {block('cardNumber')}
        {inlineRow ? (
          <View style={s.inline}>
            <View style={s.inlineItem}>{block('cardExpiry')}</View>
            <View style={s.inlineItem}>{block('cardCvc')}</View>
          </View>
        ) : (
          <>
            {block('cardExpiry')}
            {block('cardCvc')}
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
        <Button label="focus(cardNumber)" onPress={() => actions.focus('cardNumber')} />
        <Button label="focus(cardExpiry)" onPress={() => actions.focus('cardExpiry')} />
        <Button label="focus(cardCvc)" onPress={() => actions.focus('cardCvc')} />
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
              ['brand', formState.payload.brand ?? '-'],
              ['bin', formState.payload.bin ?? '-'],
              ['last4', formState.payload.last4 ?? '-'],
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
        <Hint text="onChange is detached: no form state is reported. The button above is enabled blindly." />
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
