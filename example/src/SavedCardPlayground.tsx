/**
 * A playground for the saved-card CVC flow — the web SDK's shape: ONE `CardCVCField` mounted with
 * `savedCard`, inside the same `CardForm` a new card uses, settled by the same `tokenize()`.
 *
 * Every prop is editable from this screen, and every one starts EMPTY or unset, so what you see
 * first is the bare field: no token, no network hint, no options, default appearance. Fill a field
 * or flip a chip and the component re-resolves live.
 *
 * "List saved cards" performs the merchant's own listing call — `GET …/list-payment-methods`
 * with the session's `sdk_authorization` — and lets you pick a card, which fills
 * `savedCard.paymentToken` and `savedCard.paymentMethodData.card.cardNetwork` the way a real
 * checkout would. That is the only network call this screen makes besides the form's own update.
 *
 * This is example code: the returned token is rendered on screen for inspection, which a real app
 * must never do. Nothing here prints a CVC, a session authorization, or a PAN.
 *
 * @format
 */
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {listSavedCards, type SavedCard} from './savedCards';
import {
  CardCVCField,
  CardForm,
  type MerchantSession,
  type VaultCardBrandIcon,
  type VaultCardCVCOptions,
  type VaultCardCVCStyles,
  type VaultCardFormChange,
  type VaultCVCIconDisplay,
  type VaultEnvironment,
  type VaultErrorDisplay,
  type VaultFieldChange,
  type VaultFieldEvent,
  type VaultFormAppearance,
  type VaultFormHandle,
  type VaultLabelBehavior,
  type VaultTokenizeResult,
} from '@juspay-tech/react-native-hyperswitch-vault';

const BRAND = '#0B5FBF';
const LOG_LIMIT = 12;

/* ── Fixtures a chip can switch on ──────────────────────────────────────── */

const playgroundAppearance: VaultFormAppearance = {
  variables: {
    colorPrimary: BRAND,
    colorText: '#0B1220',
    colorTextPlaceholder: '#94A3B8',
    borderColor: '#D7E0E5',
    colorDanger: '#DC2626',
    borderRadius: 12,
    inputFieldHeight: 56,
  },
};

const playgroundCvcStyles: VaultCardCVCStyles = {
  container: {borderWidth: 2, borderColor: '#0F766E', borderRadius: 16, backgroundColor: '#F0FBF9'},
  input: {fontSize: 17, fontWeight: '600'},
  label: {color: '#0F766E', fontWeight: '700'},
  error: {fontWeight: '700'},
  accessory: {opacity: 0.85},
};

/* A session this form must refuse (`invalid_session`): another vault's. */
const brokenSession: MerchantSession = {
  session_token: [],
  vault_details: {vault_type: 'vgs', vault_data: {sdk_authorization: 'not-a-hyperswitch-session'}},
};

/* ── Tri-state choices: "unset" leaves the prop undefined ───────────────── */

type Tri<T extends string> = T | 'unset';
const ENVIRONMENTS: VaultEnvironment[] = ['sandbox', 'production', 'integ'];
const LABEL_BEHAVIORS: Array<Tri<VaultLabelBehavior>> = ['unset', 'above', 'floating', 'never'];
const ERROR_DISPLAYS: Array<Tri<VaultErrorDisplay>> = ['unset', 'none', 'colorOnly', 'inline'];
const CVC_ICONS: Array<Tri<VaultCVCIconDisplay>> = ['unset', 'hidden', 'default'];
const UNSTYLED: Array<Tri<'true' | 'false'>> = ['unset', 'true', 'false'];
const NETWORK_HINTS = ['Visa', 'Mastercard', 'American Express', 'amex', 'RuPay', 'NotARealNetwork'];
void (0 as unknown as VaultCardBrandIcon);

const orUndefined = (text: string) => (text.trim().length > 0 ? text : undefined);

type Outcome = {kind: 'idle'} | {kind: 'success'; token: string} | {kind: 'failed'; line: string};

export function SavedCardPlayground({session}: {session: MerchantSession}) {
  const ref = useRef<VaultFormHandle>(null);

  /* ── the props, every one empty or unset to begin with ─────────────────── */
  const [environment, setEnvironment] = useState<VaultEnvironment>('production');
  const [useBrokenSession, setUseBrokenSession] = useState(false);
  const [paymentToken, setPaymentToken] = useState('');
  const [cardNetwork, setCardNetwork] = useState('');
  const [vaultBaseUrl, setVaultBaseUrl] = useState('');
  const [withAppearance, setWithAppearance] = useState(false);
  const [withCvcStyles, setWithCvcStyles] = useState(false);
  const [listening, setListening] = useState(true);

  /* the field's options, member by member */
  const [placeholder, setPlaceholder] = useState('');
  const [label, setLabel] = useState('');
  const [accessibilityLabel, setAccessibilityLabel] = useState('');
  const [accessibilityHint, setAccessibilityHint] = useState('');
  const [testID, setTestID] = useState('');
  const [labelBehavior, setLabelBehavior] = useState<Tri<VaultLabelBehavior>>('unset');
  const [errorDisplay, setErrorDisplay] = useState<Tri<VaultErrorDisplay>>('unset');
  const [cvcIcon, setCvcIcon] = useState<Tri<VaultCVCIconDisplay>>('unset');
  const [unstyled, setUnstyled] = useState<Tri<'true' | 'false'>>('unset');

  /* ── observation ───────────────────────────────────────────────────────── */
  const [log, setLog] = useState<string[]>([]);
  const append = useCallback((line: string) => {
    setLog(previous => [line, ...previous].slice(0, LOG_LIMIT));
  }, []);
  const [outcome, setOutcome] = useState<Outcome>({kind: 'idle'});
  const [busy, setBusy] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [listing, setListing] = useState<string | null>(null);

  const onFieldChange = useCallback(
    (e: VaultFieldChange) => {
      append(
        `change ${e.elementType} · empty=${e.empty} complete=${e.complete} valid=${e.valid} touched=${e.touched}` +
          (e.brand ? ` brand=${e.brand}` : '') +
          (e.error ? ` error=${e.errorCode}: ${e.error}` : ''),
      );
    },
    [append],
  );
  const onFieldEvent = useCallback(
    (name: string) => (e: VaultFieldEvent) => append(`${name} ${e.elementType}`),
    [append],
  );
  const onFormChange = useCallback(
    (e: VaultCardFormChange) => {
      setCanSubmit(e.canSubmit);
      append(`${e.eventName} · session=${e.sessionStatus} fieldsReady=${e.fieldsReady} canSubmit=${e.canSubmit}`);
    },
    [append],
  );

  const cvcOptions = useMemo<VaultCardCVCOptions>(() => ({
    placeholder: orUndefined(placeholder),
    label: orUndefined(label),
    accessibilityLabel: orUndefined(accessibilityLabel),
    accessibilityHint: orUndefined(accessibilityHint),
    testID: orUndefined(testID),
    labelBehavior: labelBehavior === 'unset' ? undefined : labelBehavior,
    errorDisplay: errorDisplay === 'unset' ? undefined : errorDisplay,
    cvcIcon: cvcIcon === 'unset' ? undefined : cvcIcon,
    unstyled: unstyled === 'unset' ? undefined : unstyled === 'true',
  }), [placeholder, label, accessibilityLabel, accessibilityHint, testID, labelBehavior, errorDisplay, cvcIcon, unstyled]);

  const describe = (result: VaultTokenizeResult | undefined) =>
    result === undefined
      ? 'not mounted'
      : result.status === 'success'
        ? 'success'
        : `${result.status} / ${result.error.code} (${result.error.type}) — ${result.error.message}`;

  const update = useCallback(async () => {
    setBusy(true);
    setOutcome({kind: 'idle'});
    const result = await ref.current?.tokenize();
    setBusy(false);
    append(`tokenize() · ${describe(result)}`);
    if (result?.status === 'success') {setOutcome({kind: 'success', token: result.token});}
    else {setOutcome({kind: 'failed', line: describe(result)});}
  }, [append]);

  /* Two calls in one tick: the second must be the SAME promise, and one request goes out. */
  const updateTwice = useCallback(async () => {
    const handle = ref.current;
    if (!handle) {return;}
    setBusy(true);
    const first = handle.tokenize();
    const second = handle.tokenize();
    append(`tokenize() ×2 · ${first === second ? 'same promise' : 'DIFFERENT promises (bug)'}`);
    const result = await first;
    setBusy(false);
    append(`tokenize() ×2 · ${describe(result)}`);
    if (result.status === 'success') {setOutcome({kind: 'success', token: result.token});}
    else {setOutcome({kind: 'failed', line: describe(result)});}
  }, [append]);

  const reset = useCallback(() => {
    ref.current?.reset();
    setOutcome({kind: 'idle'});
    append('reset() · CVC cleared (no-op while a request is in flight)');
  }, [append]);

  const list = useCallback(async () => {
    setListing('listing…');
    setCards(null);
    try {
      const found = await listSavedCards(session, environment);
      setCards(found);
      setListing(found.length === 0 ? 'no saved cards for this customer — save one on the "New card" screen first' : null);
      append(`list-payment-methods · ${found.length} card(s), ${found.filter(c => c.requiresCvc).length} need a CVC`);
    } catch (error) {
      setListing(`list-payment-methods failed: ${(error as Error).message}`);
      append('list-payment-methods · failed');
    }
  }, [session, environment, append]);

  const pick = (card: SavedCard) => {
    setPaymentToken(card.token);
    setCardNetwork(card.network);
    append(`picked the ${card.network || 'unknown'} card ending ${card.last4} (requires_cvv=${card.requiresCvc})`);
  };

  return (
    <View style={s.panel}>
      <Text style={s.heading}>Saved card — CVC only</Text>
      <Text style={s.hint}>
        One CardCVCField with savedCard, inside CardForm, settled by tokenize(). Every prop below starts empty.
      </Text>

      {/* ── THE FORM ──────────────────────────────────────────────────────── */}
      <View style={s.stage}>
        <CardForm
          ref={ref}
          session={useBrokenSession ? brokenSession : session}
          environment={environment}
          vaultEndpoint={orUndefined(vaultBaseUrl) ? {baseUrl: vaultBaseUrl} : undefined}
          appearance={withAppearance ? playgroundAppearance : undefined}
          onChange={listening ? onFormChange : undefined}>
          <CardCVCField
            {...cvcOptions}
            styles={withCvcStyles ? playgroundCvcStyles : undefined}
            savedCard={{
              paymentToken: orUndefined(paymentToken),
              paymentMethodData: {card: {cardNetwork: orUndefined(cardNetwork)}},
            }}
            onReady={listening ? onFieldEvent('ready') : undefined}
            onFocus={listening ? onFieldEvent('focus') : undefined}
            onBlur={listening ? onFieldEvent('blur') : undefined}
            onChange={listening ? onFieldChange : undefined}
          />
        </CardForm>
      </View>

      {/* ── THE HANDLE ────────────────────────────────────────────────────── */}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={update}
        style={({pressed}) => [s.cta, pressed && s.ctaPressed, !canSubmit && s.ctaIdle]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.ctaLabel}>tokenize()</Text>}
      </Pressable>
      <View style={s.row}>
        <Secondary label="×2 (same promise?)" onPress={updateTwice} />
        <Secondary label="reset()" onPress={reset} />
        <Secondary label="focus(cardCvc)" onPress={() => { ref.current?.focus('cardCvc'); append('focus(cardCvc)'); }} />
      </View>

      {outcome.kind === 'success' ? (
        <View style={s.resultOk}>
          <Text style={s.resultTitle}>Token returned (demo only — never render this in a real app)</Text>
          <Text style={s.token} selectable>{outcome.token}</Text>
          <Text style={s.hint}>
            {outcome.token === paymentToken ? 'Same value as the input token.' : 'Differs from the input token.'} Use this one. The CVC is held for 15 minutes.
          </Text>
        </View>
      ) : null}
      {outcome.kind === 'failed' ? (
        <View style={s.resultBad}>
          <Text style={s.resultTitle}>No token</Text>
          <Text style={s.error}>{outcome.line}</Text>
        </View>
      ) : null}

      {/* ── REQUIRED PROPS ────────────────────────────────────────────────── */}
      <Section title="session (required)">
        <Chips
          options={['valid', 'broken']}
          value={useBrokenSession ? 'broken' : 'valid'}
          onChange={v => setUseBrokenSession(v === 'broken')}
        />
        <Text style={s.hint}>"broken" passes another vault's session → error / invalid_session.</Text>
      </Section>

      <Section title="environment (required)">
        <Chips options={ENVIRONMENTS} value={environment} onChange={setEnvironment} />
        <Text style={s.hint}>Must match the merchant server's HYPERSWITCH_ENVIRONMENT.</Text>
      </Section>

      <Section title="savedCard.paymentToken (required for the update)">
        <Field value={paymentToken} onChange={setPaymentToken} placeholder="empty → validation_error naming the fix" />
        <View style={s.row}>
          <Secondary label="List saved cards" onPress={list} />
          <Secondary label="Clear" onPress={() => setPaymentToken('')} />
        </View>
        {listing ? <Text style={s.hint}>{listing}</Text> : null}
        {cards?.map(card => (
          <Pressable key={card.token} accessibilityRole="button" onPress={() => pick(card)} style={s.cardRow}>
            <Text style={s.cardRowText}>
              {card.network || 'unknown network'} · ending {card.last4} · requires_cvv={String(card.requiresCvc)}
            </Text>
            <Text style={s.cardRowToken}>…{card.token.slice(-6)}</Text>
          </Pressable>
        ))}
        <Text style={s.hint}>Changing the token clears the CVC: it was typed for a different card.</Text>
      </Section>

      {/* ── OPTIONAL PROPS ────────────────────────────────────────────────── */}
      <Section title="savedCard.paymentMethodData.card.cardNetwork (selects the CVC length rule)">
        <Field value={cardNetwork} onChange={setCardNetwork} placeholder="empty → 3 or 4 digits accepted" />
        <Chips options={NETWORK_HINTS} value={cardNetwork} onChange={v => setCardNetwork(v === cardNetwork ? '' : v)} />
        <Text style={s.hint}>Amex needs 4. With no hint, valid turns true at 3 digits even on an Amex. Case and aliases are canonicalised.</Text>
      </Section>

      <Section title="vaultEndpoint.baseUrl">
        <Field value={vaultBaseUrl} onChange={setVaultBaseUrl} placeholder="empty → the environment's host" autoCapitalize="none" />
        <Text style={s.hint}>Try ftp://nope → unsupported_configuration.</Text>
      </Section>

      <Section title="appearance / styles / events">
        <View style={s.chips}>
          <Chip on={withAppearance} label={`appearance: ${withAppearance ? 'custom' : 'unset'}`} onPress={() => setWithAppearance(v => !v)} />
          <Chip on={withCvcStyles} label={`styles: ${withCvcStyles ? 'custom' : 'unset'}`} onPress={() => setWithCvcStyles(v => !v)} />
          <Chip on={listening} label={`events: ${listening ? 'attached' : 'none'}`} onPress={() => setListening(v => !v)} />
        </View>
        <Text style={s.hint}>Re-attaching onChange yields exactly one snapshot of the current state.</Text>
      </Section>

      <Section title="field options">
        <Field value={placeholder} onChange={setPlaceholder} placeholder="placeholder (empty → library's; type a space for none)" />
        <Field value={label} onChange={setLabel} placeholder="label" />
        <Field value={accessibilityLabel} onChange={setAccessibilityLabel} placeholder="accessibilityLabel" />
        <Field value={accessibilityHint} onChange={setAccessibilityHint} placeholder="accessibilityHint" />
        <Field value={testID} onChange={setTestID} placeholder="testID" autoCapitalize="none" />
        <Text style={s.small}>labelBehavior</Text>
        <Chips options={LABEL_BEHAVIORS} value={labelBehavior} onChange={setLabelBehavior} />
        <Text style={s.small}>errorDisplay</Text>
        <Chips options={ERROR_DISPLAYS} value={errorDisplay} onChange={setErrorDisplay} />
        <Text style={s.small}>cvcIcon</Text>
        <Chips options={CVC_ICONS} value={cvcIcon} onChange={setCvcIcon} />
        <Text style={s.small}>unstyled</Text>
        <Chips options={UNSTYLED} value={unstyled} onChange={setUnstyled} />
      </Section>

      <View style={s.logBox}>
        <Text style={s.logTitle}>Events (newest first)</Text>
        {log.length === 0 ? (
          <Text style={s.logEmpty}>Nothing yet. Focus the field or type.</Text>
        ) : (
          log.map((line, index) => (
            <Text key={`${index}-${line}`} style={s.logLine} numberOfLines={2}>{line}</Text>
          ))
        )}
      </View>
    </View>
  );
}

/* ── Small controls ────────────────────────────────────────────────────── */

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field(props: {value: string; onChange: (v: string) => void; placeholder: string; autoCapitalize?: 'none'}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChange}
      placeholder={props.placeholder}
      placeholderTextColor="#94A3B8"
      autoCapitalize={props.autoCapitalize ?? 'sentences'}
      autoCorrect={false}
      style={s.input}
    />
  );
}

function Chips<T extends string>({options, value, onChange}: {options: T[]; value: string; onChange: (v: T) => void}) {
  return (
    <View style={s.chips}>
      {options.map(option => (
        <Chip key={option} on={option === value} label={option} onPress={() => onChange(option)} />
      ))}
    </View>
  );
}

function Chip({on, onPress, label}: {on: boolean; onPress: () => void; label: string}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipLabel, on && s.chipLabelOn]}>{label}</Text>
    </Pressable>
  );
}

function Secondary({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.secondary, s.rowItem]}>
      <Text style={s.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  panel: {gap: 12},
  heading: {fontSize: 20, fontWeight: '700', color: '#0B1220'},
  hint: {fontSize: 12, color: '#64748B'},
  small: {fontSize: 11, color: '#64748B', fontWeight: '700', marginTop: 4},
  stage: {paddingVertical: 4},

  section: {gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0'},
  sectionTitle: {fontSize: 13, fontWeight: '700', color: '#0B1220', fontFamily: 'Courier'},
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#0B1220',
    backgroundColor: '#F8FAFC',
  },

  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF'},
  chipOn: {borderColor: BRAND, backgroundColor: '#E8F1FF'},
  chipLabel: {fontSize: 12, color: '#64748B', fontWeight: '600'},
  chipLabelOn: {color: BRAND},

  row: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  rowItem: {flexGrow: 1, flexBasis: '40%'},

  cta: {height: 52, borderRadius: 12, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center'},
  ctaPressed: {opacity: 0.85},
  ctaIdle: {opacity: 0.55},
  ctaLabel: {color: '#FFFFFF', fontSize: 15, fontWeight: '600', fontFamily: 'Courier'},
  secondary: {height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8},
  secondaryLabel: {color: '#0B1220', fontSize: 13, fontWeight: '600'},

  cardRow: {padding: 10, borderRadius: 8, backgroundColor: '#F1F5F9', gap: 2},
  cardRowText: {fontSize: 13, color: '#0B1220', fontWeight: '600'},
  cardRowToken: {fontSize: 11, color: '#64748B', fontFamily: 'Courier'},

  resultOk: {backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, gap: 6},
  resultBad: {backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, gap: 6},
  resultTitle: {fontSize: 14, fontWeight: '700', color: '#0B1220'},
  token: {fontSize: 13, color: '#065F46', fontFamily: 'Courier'},
  error: {fontSize: 14, color: '#B91C1C'},

  logBox: {backgroundColor: '#0B1220', borderRadius: 12, padding: 12, gap: 4},
  logTitle: {color: '#94A3B8', fontSize: 11, fontWeight: '700', marginBottom: 2},
  logEmpty: {color: '#64748B', fontSize: 11, fontFamily: 'Courier'},
  logLine: {color: '#A7F3D0', fontSize: 11, fontFamily: 'Courier'},
});
