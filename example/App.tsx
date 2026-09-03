
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CardCVCField,
  CardExpiryField,
  CardNumberField,
  // CardholderNameField,
  CardForm,
  HyperswitchVaultSavedCardForm,
  type MerchantSession,
  type VaultFormHandle,
  type VaultFormState,
  type VaultSavedCardHandle,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {fetchMerchantSession} from './src/merchantServer';
import {listSavedCards, type SavedCard} from './src/savedCards';


// import {DevHarness} from './src/DevHarness';

const ENVIRONMENT = 'sandbox' as const;

type Flow = 'new' | 'saved';

type Outcome =
  | {kind: 'idle'}
  | {kind: 'done'; token: string}
  | {kind: 'failed'; message: string};

export default function App() {
  const [session, setSession] = useState<MerchantSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [flow, setFlow] = useState<Flow>('new');

  useEffect(() => {
    fetchMerchantSession()
      .then(setSession)
      .catch((error: Error) => setSessionError(error.message));
  }, []);

  if (sessionError) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centre}>
          <Text style={styles.error}>{sessionError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centre}>
          <ActivityIndicator color={BRAND} />
          <Text style={styles.muted}>Fetching a session from the merchant server…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const activeSession: MerchantSession = session;

  // return <DevHarness session={activeSession} />;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <Tab label="New card" on={flow === 'new'} onPress={() => setFlow('new')} />
          <Tab label="Saved card" on={flow === 'saved'} onPress={() => setFlow('saved')} />
        </View>

        {flow === 'new' ? (
          <NewCardFlow session={activeSession} />
        ) : (
          <SavedCardFlow session={activeSession} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** THE WHOLE CARD: the provider, the four fields, and `tokenize()`. */
function NewCardFlow({session}: {session: MerchantSession}) {
  const formRef = useRef<VaultFormHandle>(null);
  const [canSave, setCanSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({kind: 'idle'});

  const save = useCallback(async () => {
    setBusy(true);
    setOutcome({kind: 'idle'});
    const result = await formRef.current?.tokenize();
    setBusy(false);

    if (result === undefined) {
      setOutcome({kind: 'failed', message: 'The form is not mounted.'});
    } else if (result.status === 'success') {
      /* Send this to YOUR backend. Never store or log it in the app. */
      setOutcome({kind: 'done', token: result.token});
    } else {
      setOutcome({kind: 'failed', message: result.error.message});
    }
  }, []);

  return (
    <View style={styles.flow}>
      <Text style={styles.title}>Save a card</Text>

      <CardForm
        ref={formRef}
        session={session}
        environment={ENVIRONMENT}
        onFormStateChange={(state: VaultFormState) =>
          setCanSave(state.canSubmit && state.sessionStatus === 'valid')
        }>
        {/* <CardholderNameField /> */}
        <CardNumberField />
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <CardExpiryField />
          </View>
          <View style={styles.rowItem}>
            <CardCVCField />
          </View>
        </View>
      </CardForm>

      <Cta label="Save card" disabled={!canSave} busy={busy} onPress={save} />
      <Result outcome={outcome} />
    </View>
  );
}

/**
 * ONLY THE CVC, for a card the customer has already saved.
 *
 * The list comes from `list-payment-methods` — see src/savedCards.ts. Each entry carries
 * `requires_cvv`, and that flag alone decides whether this component is mounted at all: a card that
 * does not need one is paid with its listed token and no field is rendered.
 */
function SavedCardFlow({session}: {session: MerchantSession}) {
  const savedRef = useRef<VaultSavedCardHandle>(null);
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SavedCard | null>(null);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({kind: 'idle'});

  const load = useCallback(async () => {
    setCards(null);
    setListError(null);
    setSelected(null);
    setOutcome({kind: 'idle'});
    try {
      const list = await listSavedCards(session, ENVIRONMENT);
      setCards(list);
      setSelected(list[0] ?? null);
    } catch (error) {
      setListError((error as Error).message);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const confirm = useCallback(async () => {
    setBusy(true);
    setOutcome({kind: 'idle'});
    const result = await savedRef.current?.updateSavedPaymentMethod();
    setBusy(false);

    if (result === undefined) {
      setOutcome({kind: 'failed', message: 'The form is not mounted.'});
    } else if (result.status === 'success') {
      /* Pay with THIS token, not the one that was listed. */
      setOutcome({kind: 'done', token: result.token});
    } else {
      setOutcome({kind: 'failed', message: result.error.message});
    }
  }, []);

  return (
    <View style={styles.flow}>
      <Text style={styles.title}>Pay with a saved card</Text>

      {listError !== null ? <Text style={styles.error}>{listError}</Text> : null}
      {cards === null && listError === null ? (
        <View style={styles.row}>
          <ActivityIndicator color={BRAND} />
          <Text style={styles.muted}>Listing saved cards…</Text>
        </View>
      ) : null}
      {cards !== null && cards.length === 0 ? (
        <Text style={styles.muted}>
          This customer has no saved cards yet. Save one on the other tab, then refresh.
        </Text>
      ) : null}

      {(cards ?? []).map(card => (
        <Pressable
          key={card.token}
          accessibilityRole="button"
          onPress={() => {
            setSelected(card);
            setValid(false);
            setOutcome({kind: 'idle'});
          }}
          style={[styles.card, selected?.token === card.token && styles.cardOn]}>
          <Text style={styles.cardLabel}>
            {`${card.network || 'Card'} •••• ${card.last4}`}
          </Text>
          <Text style={styles.muted}>
            {card.requiresCvc ? 'CVC required' : 'no CVC needed'}
          </Text>
        </Pressable>
      ))}

      {selected !== null && selected.requiresCvc ? (
        <>
          {/* Keyed by token so picking another card starts from an empty field. */}
          <HyperswitchVaultSavedCardForm
            key={selected.token}
            ref={savedRef}
            session={session}
            environment={ENVIRONMENT}
            paymentMethodToken={selected.token}
            cardNetwork={selected.network || undefined}
            onStateChange={state => setValid(state.valid)}
          />
          <Cta label="Confirm" disabled={!valid} busy={busy} onPress={confirm} />
        </>
      ) : null}

      {selected !== null && !selected.requiresCvc ? (
        <Text style={styles.muted}>
          This card needs no security code. Pay with its listed token directly — the CVC component
          is not mounted at all.
        </Text>
      ) : null}

      <Pressable accessibilityRole="button" onPress={load} style={styles.secondary}>
        <Text style={styles.secondaryLabel}>Refresh</Text>
      </Pressable>

      <Result outcome={outcome} />
    </View>
  );
}

/* ── Small shared pieces, so each flow above reads as the integration only ──── */

function Tab({label, on, onPress}: {label: string; on: boolean; onPress: () => void}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.tab, styles.rowItem, on && styles.tabOn]}>
      <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{label}</Text>
    </Pressable>
  );
}

function Cta({
  label,
  disabled,
  busy,
  onPress,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={[styles.cta, (disabled || busy) && styles.ctaIdle]}>
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.ctaLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

function Result({outcome}: {outcome: Outcome}) {
  if (outcome.kind === 'done') {
    return (
      <Text style={styles.token} selectable>
        {outcome.token}
      </Text>
    );
  }
  if (outcome.kind === 'failed') {
    return <Text style={styles.error}>{outcome.message}</Text>;
  }
  return null;
}

const BRAND = '#0B5FBF';

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F6F7FB'},
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12},
  /* SafeAreaView pads nothing on Android, so the status bar / camera cut-out is padded by hand. */
  page: {
    padding: 16,
    paddingTop: 16 + (Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 0),
    paddingBottom: 24,
    gap: 12,
  },
  flow: {gap: 12},

  title: {fontSize: 22, fontWeight: '700', color: '#0B1220'},
  row: {flexDirection: 'row', gap: 12},
  rowItem: {flex: 1},

  tab: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: {borderColor: BRAND, backgroundColor: '#E8F1FF'},
  tabLabel: {fontSize: 13, fontWeight: '600', color: '#64748B'},
  tabLabelOn: {color: BRAND},

  cta: {
    marginTop: 4,
    height: 52,
    borderRadius: 12,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaIdle: {opacity: 0.5},
  ctaLabel: {color: '#FFFFFF', fontSize: 16, fontWeight: '600'},

  card: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  cardOn: {borderColor: BRAND, backgroundColor: '#E8F1FF'},
  cardLabel: {fontSize: 14, fontWeight: '600', color: '#0B1220'},

  secondary: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {fontSize: 13, fontWeight: '600', color: '#0B1220'},

  token: {fontSize: 13, color: '#065F46', fontFamily: 'Courier'},
  error: {fontSize: 14, color: '#B91C1C'},
  muted: {fontSize: 13, color: '#64748B'},
});
