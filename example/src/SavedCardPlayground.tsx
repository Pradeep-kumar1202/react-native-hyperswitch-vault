/**
 * A playground for `<HyperswitchVaultSavedCardForm />` (ADR-0008).
 *
 * Every prop the component takes is editable from this screen, and every one starts EMPTY or
 * unset, so what you see first is the bare component: no token, no network hint, no options,
 * default appearance. Fill a field or flip a chip and the component re-resolves live.
 *
 * "List saved cards" performs the merchant's own listing call — `GET …/list-payment-methods`
 * with the session's `sdk_authorization` — and lets you pick a card, which fills
 * `paymentMethodToken` and `cardNetwork` the way a real checkout would. That is the only network
 * call this screen makes besides the component's own update.
 *
 * This is example code: the returned token is rendered on screen for inspection, which a real app
 * must never do. Nothing here prints a CVC, a session authorization, or a PAN.
 *
 * @format
 */
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  HyperswitchVaultSavedCardForm,
  type MerchantSession,
  type VaultCVCOptions,
  type VaultCVCState,
  type VaultCVCStyles,
  type VaultEnvironment,
  type VaultFormAppearance,
  type VaultSavedCardHandle,
  type VaultTokenizeResult,
} from '@juspay-tech/react-native-hyperswitch-vault';

const BRAND = '#0B5FBF';
const LOG_LIMIT = 12;

/* The library's own vault hosts, per environment — only used for the merchant's listing call. */
const VAULT_HOSTS: Record<VaultEnvironment, string> = {
  sandbox: 'https://beta.hyperswitch.io/api',
  integration: 'https://dev.hyperswitch.io/api',
  production: 'https://checkout.hyperswitch.io/api',
};

/* ── Fixtures a chip can switch on ──────────────────────────────────────── */

const playgroundAppearance: VaultFormAppearance = {
  primaryColor: BRAND,
  textColor: '#0B1220',
  placeholderColor: '#94A3B8',
  borderColor: '#D7E0E5',
  errorColor: '#DC2626',
  borderRadius: 12,
  inputHeight: 56,
};

const playgroundCvcStyles: VaultCVCStyles = {
  container: {borderWidth: 2, borderColor: '#0F766E', borderRadius: 16, backgroundColor: '#F0FBF9'},
  input: {fontSize: 17, fontWeight: '600'},
  label: {color: '#0F766E', fontWeight: '700'},
  error: {fontWeight: '700'},
  accessory: {opacity: 0.85},
};

const playgroundContainerStyle = {
  padding: 10,
  borderRadius: 14,
  borderWidth: 1,
  borderStyle: 'dashed' as const,
  borderColor: '#7C3AED',
  backgroundColor: '#FAF5FF',
};

/* A session this component must refuse (`invalid_session`): another vault's. */
const brokenSession: MerchantSession = {
  session_token: [],
  vault_details: {vault_type: 'vgs', vault_data: {sdk_authorization: 'not-a-hyperswitch-session'}},
};

/* ── The merchant's listing call ────────────────────────────────────────── */

/* base64 → text, without Buffer or atob so it runs on every React Native version. */
/* eslint-disable no-bitwise */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const fromBase64 = (input: string): string => {
  const clean = input.replace(/[\s=]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const symbol of clean) {
    const value = B64.indexOf(symbol);
    if (value < 0) {return '';}
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
};
/* eslint-enable no-bitwise */

const sessionIdOf = (session: MerchantSession): string | null => {
  const authorization = session.vault_details?.vault_data?.sdk_authorization;
  if (typeof authorization !== 'string') {return null;}
  const pair = fromBase64(authorization)
    .split(',')
    .map(part => part.trim())
    .find(part => part.startsWith('payment_method_session_id='));
  return pair ? pair.slice('payment_method_session_id='.length) : null;
};

type SavedCard = {
  token: string;
  network: string;
  last4: string;
  requiresCvc: boolean;
};

const listSavedCards = async (session: MerchantSession, environment: VaultEnvironment): Promise<SavedCard[]> => {
  const authorization = session.vault_details?.vault_data?.sdk_authorization;
  const sessionId = sessionIdOf(session);
  if (typeof authorization !== 'string' || !sessionId) {
    throw new Error('the session carries no payment_method_session_id');
  }
  const response = await fetch(
    `${VAULT_HOSTS[environment]}/v1/payment-method-sessions/${encodeURIComponent(sessionId)}/list-payment-methods`,
    {headers: {Authorization: authorization}},
  );
  if (!response.ok) {throw new Error(`list-payment-methods answered HTTP ${response.status}`);}
  const body = (await response.json()) as {customer_payment_methods?: Array<Record<string, any>>};
  return (body.customer_payment_methods ?? [])
    .filter(entry => (entry.payment_method ?? entry.payment_method_type) === 'card')
    .map(entry => ({
      token: String(entry.payment_method_token ?? entry.payment_token ?? ''),
      network: String(entry.card?.card_network ?? ''),
      last4: String(entry.card?.last4_digits ?? entry.card?.last4 ?? '????'),
      requiresCvc: entry.requires_cvv === true,
    }))
    .filter(card => card.token.length > 0);
};

/* ── Tri-state choices: "unset" leaves the prop undefined ───────────────── */

type Tri<T extends string> = T | 'unset';
const ENVIRONMENTS: VaultEnvironment[] = ['sandbox', 'production', 'integration'];
const LABEL_BEHAVIORS: Array<Tri<'none' | 'static' | 'floating'>> = ['unset', 'none', 'static', 'floating'];
const ERROR_DISPLAYS: Array<Tri<'none' | 'inline'>> = ['unset', 'none', 'inline'];
const CVC_ICONS: Array<Tri<'none' | 'default'>> = ['unset', 'none', 'default'];
const UNSTYLED: Array<Tri<'true' | 'false'>> = ['unset', 'true', 'false'];
const NETWORK_HINTS = ['Visa', 'Mastercard', 'American Express', 'amex', 'RuPay', 'NotARealNetwork'];

const orUndefined = (text: string) => (text.trim().length > 0 ? text : undefined);

type Outcome = {kind: 'idle'} | {kind: 'success'; token: string} | {kind: 'failed'; line: string};

export function SavedCardPlayground({session}: {session: MerchantSession}) {
  const ref = useRef<VaultSavedCardHandle>(null);

  /* ── the props, every one empty or unset to begin with ─────────────────── */
  const [environment, setEnvironment] = useState<VaultEnvironment>('production');
  const [useBrokenSession, setUseBrokenSession] = useState(false);
  const [paymentMethodToken, setPaymentMethodToken] = useState('');
  const [cardNetwork, setCardNetwork] = useState('');
  const [vaultBaseUrl, setVaultBaseUrl] = useState('');
  const [withAppearance, setWithAppearance] = useState(false);
  const [withCvcStyles, setWithCvcStyles] = useState(false);
  const [withContainerStyle, setWithContainerStyle] = useState(false);
  const [listening, setListening] = useState(true);

  /* cvcOptions, member by member */
  const [placeholder, setPlaceholder] = useState('');
  const [label, setLabel] = useState('');
  const [accessibilityLabel, setAccessibilityLabel] = useState('');
  const [accessibilityHint, setAccessibilityHint] = useState('');
  const [testID, setTestID] = useState('');
  const [labelBehavior, setLabelBehavior] = useState<Tri<'none' | 'static' | 'floating'>>('unset');
  const [errorDisplay, setErrorDisplay] = useState<Tri<'none' | 'inline'>>('unset');
  const [cvcIcon, setCvcIcon] = useState<Tri<'none' | 'default'>>('unset');
  const [unstyled, setUnstyled] = useState<Tri<'true' | 'false'>>('unset');

  /* ── observation ───────────────────────────────────────────────────────── */
  const [log, setLog] = useState<string[]>([]);
  const append = useCallback((line: string) => {
    setLog(previous => [line, ...previous].slice(0, LOG_LIMIT));
  }, []);
  const [outcome, setOutcome] = useState<Outcome>({kind: 'idle'});
  const [busy, setBusy] = useState(false);
  const [valid, setValid] = useState(false);
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [listing, setListing] = useState<string | null>(null);

  const onStateChange = useCallback(
    (state: VaultCVCState) => {
      setValid(state.valid);
      append(
        `${state.field} · ${state.status} valid=${state.valid} touched=${state.touched}` +
          ` focused=${state.focused}` +
          (state.error ? ` error=${state.error.code}: ${state.error.message}` : ''),
      );
    },
    [append],
  );

  const cvcOptions = useMemo<VaultCVCOptions | undefined>(() => {
    const options: VaultCVCOptions = {
      placeholder: orUndefined(placeholder),
      label: orUndefined(label),
      accessibilityLabel: orUndefined(accessibilityLabel),
      accessibilityHint: orUndefined(accessibilityHint),
      testID: orUndefined(testID),
      labelBehavior: labelBehavior === 'unset' ? undefined : labelBehavior,
      errorDisplay: errorDisplay === 'unset' ? undefined : errorDisplay,
      cvcIcon: cvcIcon === 'unset' ? undefined : cvcIcon,
      unstyled: unstyled === 'unset' ? undefined : unstyled === 'true',
    };
    /* All unset ⇒ pass no `cvcOptions` at all, so the default path is what gets exercised. */
    return Object.values(options).some(v => v !== undefined) ? options : undefined;
  }, [placeholder, label, accessibilityLabel, accessibilityHint, testID, labelBehavior, errorDisplay, cvcIcon, unstyled]);

  const describe = (result: VaultTokenizeResult | undefined) =>
    result === undefined
      ? 'not mounted'
      : result.status === 'success'
        ? 'success'
        : `${result.status} / ${result.error.code} — ${result.error.message}`;

  const update = useCallback(async () => {
    setBusy(true);
    setOutcome({kind: 'idle'});
    const result = await ref.current?.updateSavedPaymentMethod();
    setBusy(false);
    append(`updateSavedPaymentMethod() · ${describe(result)}`);
    if (result?.status === 'success') {setOutcome({kind: 'success', token: result.token});}
    else {setOutcome({kind: 'failed', line: describe(result)});}
  }, [append]);

  /* Two calls in one tick: the second must be the SAME promise, and one request goes out. */
  const updateTwice = useCallback(async () => {
    const handle = ref.current;
    if (!handle) {return;}
    setBusy(true);
    const first = handle.updateSavedPaymentMethod();
    const second = handle.updateSavedPaymentMethod();
    append(`updateSavedPaymentMethod() ×2 · ${first === second ? 'same promise' : 'DIFFERENT promises (bug)'}`);
    const result = await first;
    setBusy(false);
    append(`updateSavedPaymentMethod() ×2 · ${describe(result)}`);
    if (result.status === 'success') {setOutcome({kind: 'success', token: result.token});}
    else {setOutcome({kind: 'failed', line: describe(result)});}
  }, [append]);

  const reset = useCallback(() => {
    ref.current?.reset();
    setOutcome({kind: 'idle'});
    append('reset() · CVC cleared, any in-flight request aborted');
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
    setPaymentMethodToken(card.token);
    setCardNetwork(card.network);
    append(`picked the ${card.network || 'unknown'} card ending ${card.last4} (requires_cvv=${card.requiresCvc})`);
  };

  return (
    <View style={s.panel}>
      <Text style={s.heading}>Saved card — CVC only</Text>
      <Text style={s.hint}>
        Every prop below starts empty. The component is mounted the whole time, so each change re-resolves live.
      </Text>

      {/* ── THE COMPONENT ─────────────────────────────────────────────────── */}
      <View style={s.stage}>
        <HyperswitchVaultSavedCardForm
          ref={ref}
          session={useBrokenSession ? brokenSession : session}
          environment={environment}
          paymentMethodToken={paymentMethodToken}
          cardNetwork={orUndefined(cardNetwork)}
          vaultEndpoint={orUndefined(vaultBaseUrl) ? {baseUrl: vaultBaseUrl} : undefined}
          appearance={withAppearance ? playgroundAppearance : undefined}
          cvcOptions={cvcOptions}
          cvcStyles={withCvcStyles ? playgroundCvcStyles : undefined}
          containerStyle={withContainerStyle ? playgroundContainerStyle : undefined}
          onStateChange={listening ? onStateChange : undefined}
        />
      </View>

      {/* ── THE HANDLE ────────────────────────────────────────────────────── */}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={update}
        style={({pressed}) => [s.cta, pressed && s.ctaPressed, !valid && s.ctaIdle]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.ctaLabel}>updateSavedPaymentMethod()</Text>}
      </Pressable>
      <View style={s.row}>
        <Secondary label="×2 (same promise?)" onPress={updateTwice} />
        <Secondary label="reset()" onPress={reset} />
        <Secondary label="focus()" onPress={() => { ref.current?.focus(); append('focus()'); }} />
        <Secondary label="blur()" onPress={() => { ref.current?.blur(); append('blur()'); }} />
      </View>

      {outcome.kind === 'success' ? (
        <View style={s.resultOk}>
          <Text style={s.resultTitle}>Token returned (demo only — never render this in a real app)</Text>
          <Text style={s.token} selectable>{outcome.token}</Text>
          <Text style={s.hint}>
            {outcome.token === paymentMethodToken ? 'Same value as the input token.' : 'Differs from the input token.'} Use this one. The CVC is held for 15 minutes.
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
        <Text style={s.hint}>Changing it mid-request aborts the request and KEEPS the CVC.</Text>
      </Section>

      <Section title="paymentMethodToken (required)">
        <Field value={paymentMethodToken} onChange={setPaymentMethodToken} placeholder="empty → not_ready on submit" />
        <View style={s.row}>
          <Secondary label="List saved cards" onPress={list} />
          <Secondary label="Clear" onPress={() => setPaymentMethodToken('')} />
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
        <Text style={s.hint}>Changing the token mid-request aborts it and CLEARS the CVC.</Text>
      </Section>

      {/* ── OPTIONAL PROPS ────────────────────────────────────────────────── */}
      <Section title="cardNetwork (hint — selects the CVC length rule)">
        <Field value={cardNetwork} onChange={setCardNetwork} placeholder="empty → 3 or 4 digits accepted" />
        <Chips options={NETWORK_HINTS} value={cardNetwork} onChange={v => setCardNetwork(v === cardNetwork ? '' : v)} />
        <Text style={s.hint}>Amex needs 4. With no hint, valid turns true at 3 digits even on an Amex.</Text>
      </Section>

      <Section title="vaultEndpoint.baseUrl">
        <Field value={vaultBaseUrl} onChange={setVaultBaseUrl} placeholder="empty → the environment's host" autoCapitalize="none" />
        <Text style={s.hint}>Try ftp://nope → unsupported_configuration. Changing it aborts and KEEPS the CVC.</Text>
      </Section>

      <Section title="appearance / cvcStyles / containerStyle / onStateChange">
        <View style={s.chips}>
          <Chip on={withAppearance} label={`appearance: ${withAppearance ? 'custom' : 'unset'}`} onPress={() => setWithAppearance(v => !v)} />
          <Chip on={withCvcStyles} label={`cvcStyles: ${withCvcStyles ? 'custom' : 'unset'}`} onPress={() => setWithCvcStyles(v => !v)} />
          <Chip on={withContainerStyle} label={`containerStyle: ${withContainerStyle ? 'dashed box' : 'unset'}`} onPress={() => setWithContainerStyle(v => !v)} />
          <Chip on={listening} label={`onStateChange: ${listening ? 'attached' : 'none'}`} onPress={() => setListening(v => !v)} />
        </View>
        <Text style={s.hint}>Re-attaching the listener yields exactly one snapshot of the current state.</Text>
      </Section>

      <Section title="cvcOptions">
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
