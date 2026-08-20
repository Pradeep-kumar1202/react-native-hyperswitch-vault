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
 * Nothing sensitive is shown or logged: the state strip carries booleans and the detected scheme,
 * the session appears only as a counter. The token is rendered for demo reading only.
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
  CardNumberWidget,
  CardExpiryWidget,
  CardCVCWidget,
  type CardFormState,
  type HyperswitchVaultFormHandle,
  type MerchantSession,
  type VaultFormAppearance,
  type VaultSubmitResult,
  type WidgetHandle,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {fetchMerchantSession} from './merchantServer';

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
  brandIconMode: 'animated',
};

type Phase =
  | {kind: 'idle'}
  | {kind: 'starting'}
  | {kind: 'collecting'; session: MerchantSession}
  | {kind: 'done'; token: string};

export function CustomLayoutCheckout() {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);
  const numberRef = useRef<WidgetHandle>(null);

  const [phase, setPhase] = useState<Phase>({kind: 'idle'});
  const [sessionSerial, setSessionSerial] = useState(0);
  const [cardState, setCardState] = useState<CardFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  /* The merchant's own field. The SDK neither sees nor sends it. */
  const [plate, setPlate] = useState('');

  const start = useCallback(async () => {
    setError(null);
    setCardState(null);
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
    setPaying(true);
    setError(null);
    const result: VaultSubmitResult | undefined = await formRef.current?.submit();
    setPaying(false);
    if (!result) {
      return;
    }
    if (result.status === 'success') {
      setPhase({kind: 'done', token: result.token});
    } else {
      setError(result.error.message);
    }
  }, []);

  if (phase.kind === 'done') {
    return (
      <Success
        token={phase.token}
        onDone={() => {
          setPlate('');
          setCardState(null);
          setPhase({kind: 'idle'});
        }}
      />
    );
  }

  const canPay = Boolean(cardState?.complete) && !paying;

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
              onStateChange={setCardState}>


              

              {/* <Section title="Card number" sdk> */}
                <CardNumberWidget ref={numberRef} />
              {/* </Section> */}

              {/* <Section title="Expiry" sdk> */}
                <CardExpiryWidget />
              {/* </Section> */}

                 {/* <Section title="Security code" sdk> */}
                <CardCVCWidget />
              {/* </Section> */}

             

              <View style={styles.stateStrip}>
                <Pill label="number" ok={cardState?.cardNumberValid} />
                <Pill label="expiry" ok={cardState?.expiryValid} />
                <Pill label="cvc" ok={cardState?.cvcValid} />
                <View style={styles.flex} />
                <Text style={styles.stateBrand}>{cardState?.brand || '—'}</Text>
              </View>

              <View style={styles.controls}>
                <Chip label="Focus number" onPress={() => numberRef.current?.focus()} />
                <Chip label="Focus expiry" onPress={() => formRef.current?.focus('expiry')} />
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

function Pill({label, ok}: {label: string; ok?: boolean}) {
  return (
    <View style={[styles.pill, ok && styles.pillOn]}>
      <Text style={[styles.pillText, ok && styles.pillTextOn]}>{label}</Text>
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

function Success({token, onDone}: {token: string; onDone: () => void}) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.successBadge}>
          <Text style={styles.successTick}>✓</Text>
        </View>
        <Text style={styles.successTitle}>Auto-pay is on</Text>
        <Text style={styles.successSub}>Drive out without stopping</Text>

        <View style={styles.tokenBox}>
          <Text style={styles.tokenLabel}>payment_method token — demo only</Text>
          <Text selectable style={styles.tokenValue}>
            {token}
          </Text>
        </View>

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

  stateStrip: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2},
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#E9EDF2',
  },
  pillOn: {backgroundColor: '#CCFBF1'},
  pillText: {fontSize: 11.5, fontWeight: '600', color: '#94A3B8'},
  pillTextOn: {color: BRAND},
  stateBrand: {fontSize: 12, fontWeight: '700', color: '#0B1220'},

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
  tokenBox: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    gap: 6,
  },
  tokenLabel: {color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5},
  tokenValue: {
    color: '#0F172A',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
