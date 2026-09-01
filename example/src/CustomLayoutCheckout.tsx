/**
 * Custom layout — the merchant composes the page.
 *
 * The journey shown here is card-on-file for a parking operator: no charge now, just a saved card
 * so the barrier can charge on exit. The three card fields are ordinary components, each dropped
 * into its own section with the merchant's own number-plate field in between. One provider wraps
 * them; validation, formatting, focus order and the vault call stay with the package.
 *
 * The merchant is a stand-in and the styling is a placeholder — not anyone's real brand.
 *
 * Nothing sensitive is shown or logged: the session appears only as a counter, and `submit()`
 * returns a navigation decision rather than a credential, so there is nothing here to render.
 */
import React, {useCallback, useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  HyperswitchVaultFormProvider,
  CardholderNameWidget,
  CardNumberWidget,
  CardExpiryWidget,
  CardCVCWidget,
  type HyperswitchVaultFormHandle,
  type MerchantSession,
  type VaultFormAppearance,
  type VaultPaymentResult,
  type WidgetHandle,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {fetchMerchantSession, vaultPaymentFrom} from './merchantServer';
import {logFieldState, logFormState} from './eventLog';

const MERCHANT = 'Arrive Group';
const BRAND = '#0B5FBF';

/* Provider-level appearance reaches every widget, wherever each one is rendered. */
const cardAppearance: VaultFormAppearance = {
  primaryColor: BRAND,
  textColor: '#0B1220',
  placeholderColor: '#94A3B8',
  borderColor: '#D7E0E5',
  errorColor: '#DC2626',
  borderRadius: 12,
  inputHeight: 52,
  /*
   * No form-wide brandIconMode. The card number sets its own `animated` below, which is the
   * arrangement worth showing: form-wide is a blunt instrument, and per-field is how you say
   * "this one, differently".
   *
   * It no longer decides WHETHER a mark appears — artwork is on by default — only which one.
   */
};

type Phase =
  | {kind: 'idle'}
  | {kind: 'starting'}
  | {kind: 'collecting'; session: MerchantSession}
  | {kind: 'done'; outcome: 'succeeded' | 'processing'};

export function CustomLayoutCheckout() {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);
  const numberRef = useRef<WidgetHandle>(null);

  const [phase, setPhase] = useState<Phase>({kind: 'idle'});
  const [sessionSerial, setSessionSerial] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  /* Fed by `onFormStateChange`; false until every gate the library checks is satisfied. */
  const [formReady, setFormReady] = useState(false);
  /* The merchant's own field. The SDK neither sees nor sends it. */
  const [plate, setPlate] = useState('');

  const start = useCallback(async () => {
    setError(null);
    setPhase({kind: 'starting'});
    try {
      const session = await fetchMerchantSession();
      setSessionSerial(serial => serial + 1);
      setPhase({kind: 'collecting', session});
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not start checkout.');
      setPhase({kind: 'idle'});
    }
  }, []);

  const pay = useCallback(async () => {
    if (phase.kind !== 'collecting') {
      return;
    }
    setPaying(true);
    setError(null);
    const result: VaultPaymentResult | undefined = await formRef.current?.confirmPayment(
      vaultPaymentFrom(phase.session),
    );
    setPaying(false);
    if (!result) {
      return;
    }
    /* The result is discriminated on `status`: only the failure statuses carry an `error`. */
    if (result.status === 'succeeded' || result.status === 'processing') {
      setPhase({kind: 'done', outcome: result.status});
    } else if (result.status === 'requires_customer_action') {
      /* A real app drives the action — redirect, 3DS challenge — and then asks its own backend. */
      setError('This card needs an extra step to finish. Not implemented in this demo.');
    } else {
      setError(result.error.message);
    }
  }, [phase]);

  if (phase.kind === 'done') {
    return (
      <Success
        outcome={phase.outcome}
        onDone={() => {
          setPlate('');
          setPhase({kind: 'idle'});
        }}
      />
    );
  }

  /*
   * The library publishes no form state, so this is the merchant's own gate. It stays enabled while
   * idle: an incomplete card is answered with `validation_error` and makes no network request.
   */
  /* Driven by the form callback now, not just by "is a request in flight". */
  const canPay = !paying && formReady;

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>N</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.merchant}>{MERCHANT}</Text>
              <Text style={styles.merchantSub}>Auto-pay · fields placed by the merchant</Text>
            </View>
          </View>

          {phase.kind !== 'collecting' ? (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={phase.kind === 'starting'}
                onPress={start}
                style={({pressed}) => [styles.cta, pressed && styles.ctaPressed]}>
                {phase.kind === 'starting' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.ctaLabel}>Start checkout</Text>
                )}
              </Pressable>
            </>
          ) : (
            <HyperswitchVaultFormProvider
              ref={formRef}
              session={phase.session}
              environment="sandbox"
              appearance={cardAppearance}
              onFormStateChange={state => {
                logFormState(state);
                setFormReady(state.canSubmit);
              }}>

              {/*
                * The exact reported integration: a placeholder and nothing else. The cardholder
                * name is OPTIONAL in a custom layout — a provider with only number, expiry and CVC
                * submits perfectly well — and is shown here because this checkout wants it.
                */}
              {/*
                * Every field reports its own state. `logFieldState` prints only what changed, and
                * refuses to print anything card-shaped — a demonstration of the boundary, not a
                * safeguard the snapshots need.
                */}
              {/*
                * `animated` cycles Visa / Mastercard / Amex / Diners / Discover / JCB in the icon
                * slot while the field is empty and no brand is detected, then settles on the real
                * mark once the number identifies one. `standard` is the same thing without the
                * cycle. Per-field, so the other three widgets are unaffected.
                */}
              <CardNumberWidget
                placeholder="Card Number"
                brandIconMode="animated"
                onStateChange={logFieldState}
              />
              <CardExpiryWidget placeholder="Expiry" onStateChange={logFieldState} />
              <CardCVCWidget placeholder="CVC" onStateChange={logFieldState} />
              <CardholderNameWidget placeholder="Name on card" onStateChange={logFieldState} />

              <View style={styles.controls}>
                <Chip label="Focus number" onPress={() => numberRef.current?.focus()} />
                <Chip label="Focus name" onPress={() => formRef.current?.focus('cardholderName')} />
                <Chip label="Reset" onPress={() => formRef.current?.reset()} />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canPay}
                onPress={pay}
                style={({pressed}) => [
                  styles.cta,
                  pressed && styles.ctaPressed,
                  !canPay && styles.ctaDisabled,
                ]}>
                {paying ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.ctaLabel}>Save card for auto-pay</Text>
                )}
              </Pressable>

              <Text style={styles.footnote}>🔒 Session #{sessionSerial} · card details go straight to Hyperswitch</Text>
            </HyperswitchVaultFormProvider>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({
  title,
  sdk,
  children,
}: {
  title: string;
  sdk?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, sdk && styles.sectionSdk]}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={[styles.owner, sdk && styles.ownerSdk]}>{sdk ? 'Hyperswitch' : 'Your UI'}</Text>
      </View>
      {children}
    </View>
  );
}

function Chip({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.chip, pressed && styles.chipPressed]}>
      <Text style={styles.chipLabel}>{label}</Text>
    </Pressable>
  );
}

function Success({
  outcome,
  onDone,
}: {
  outcome: 'succeeded' | 'processing';
  onDone: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.successBadge}>
          <Text style={styles.successTick}>✓</Text>
        </View>
        <Text style={styles.successTitle}>Auto-pay is on</Text>
        <Text style={styles.successSub}>
          {outcome === 'succeeded'
            ? 'Drive out without stopping'
            : 'Payment is processing — your backend will hear the outcome'}
        </Text>

        {/*
          * There is deliberately nothing to display here. The library performs the final payment
          * confirmation itself, so no payment-method token ever crosses into the app.
          */}

        <Pressable accessibilityRole="button" onPress={onDone} style={styles.cta}>
          <Text style={styles.ctaLabel}>Run it again</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  screen: {flex: 1, backgroundColor: '#F6F7FB'},
  scroll: {padding: 20, paddingBottom: 28, gap: 12},

  header: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2},
  logo: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {color: '#FFFFFF', fontSize: 19, fontWeight: '700'},
  merchant: {fontSize: 19, fontWeight: '700', color: '#0B1220', letterSpacing: -0.3},
  merchantSub: {fontSize: 13, color: '#64748B', marginTop: 2},

  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    shadowColor: '#0B1220',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 3},
    elevation: 2,
  },
  sectionSdk: {borderLeftWidth: 3, borderLeftColor: BRAND},
  sectionHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sectionTitle: {fontSize: 14, fontWeight: '700', color: '#0B1220'},
  owner: {fontSize: 10.5, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.3},
  ownerSdk: {color: BRAND},

  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#D7E0E5',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0B1220',
  },

  controls: {flexDirection: 'row', gap: 8},
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  chipPressed: {opacity: 0.6},
  chipLabel: {fontSize: 12.5, fontWeight: '600', color: '#0B1220'},

  cta: {
    height: 54,
    borderRadius: 14,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  ctaPressed: {opacity: 0.85},
  ctaDisabled: {backgroundColor: '#9ECFCA'},
  ctaLabel: {color: '#FFFFFF', fontSize: 16, fontWeight: '700'},
  footnote: {fontSize: 11.5, color: '#94A3B8', textAlign: 'center'},
  error: {color: '#DC2626', fontSize: 13},

  successBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 28,
  },
  successTick: {fontSize: 32, color: BRAND, fontWeight: '700'},
  successTitle: {fontSize: 22, fontWeight: '700', color: '#0B1220', textAlign: 'center'},
  successSub: {fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: -6},
});
