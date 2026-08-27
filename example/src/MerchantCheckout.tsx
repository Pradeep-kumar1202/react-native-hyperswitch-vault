/**
 * A stand-in merchant storefront, for demoing the vault flow the way a customer would meet it.
 *
 * The point of the sequencing: tapping **Checkout** does NOT open the card sheet. It calls the
 * merchant's own backend first, and only presents the sheet once a session comes back — which is
 * how a real integration has to work, because the sheet cannot render without one. The brief
 * "Starting secure checkout…" state is that round trip, and it is worth showing rather than hiding.
 *
 * The merchant shown here is a stand-in for a parking operator: pay for a session, and save the
 * card so future exits are automatic. Names, zones, plates and prices are invented for the demo,
 * and the styling is a placeholder — it is not anyone's real brand.
 */
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  HyperswitchVaultForm,
  type HyperswitchVaultFormHandle,
  type MerchantSession,
  type VaultFormAppearance,
  type VaultPaymentResult,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {fetchMerchantSession, vaultPaymentFrom} from './merchantServer';

/* ── The "store" ─────────────────────────────────────────────────────────── */

const STORE = 'Arrive Group';

const PLATE = 'AB-123-CD';

const BASKET = [
  {id: '1', emoji: '🅿️', name: 'Zone B12 · Centraal', variant: '09:15 – 12:30 · 3h 15m', price: 1040},
  {id: '2', emoji: '🚗', name: 'Vehicle', variant: PLATE, price: 0},
];

const SERVICE_FEE = 50;
/* Euro, with the decimal comma most of the merchant's markets use. */
const money = (cents: number) => `€${(cents / 100).toFixed(2).replace('.', ',')}`;

const subtotal = BASKET.reduce((sum, item) => sum + item.price, 0);
const total = subtotal + SERVICE_FEE;

/*
 * Field layout. `false` is one bordered block with expiry and CVC sharing a row — what a card-only
 * hyperswitch-client-core sheet looks like. Flip to `true` for three separately bordered fields,
 * with each error directly under its own field. Both are one prop; nothing else changes.
 */
const SPLIT_CARD_FIELDS = false;

/* The merchant's brand, handed to the card form so it does not look like a bolted-on widget. */
const BRAND = '#0B5FBF';
const cardAppearance: VaultFormAppearance = {
  primaryColor: BRAND,
  textColor: '#0B1220',
  placeholderColor: '#94A3B8',
  borderColor: '#E2E8F0',
  errorColor: '#DC2626',
  borderRadius: 12,
  inputHeight: 52,
  brandIconMode : "animated"
};

type Phase =
  | {kind: 'browsing'}
  | {kind: 'starting'}
  | {kind: 'paying'; session: MerchantSession}
  | {kind: 'done'; outcome: 'succeeded' | 'processing'; reference: string};

export function MerchantCheckout() {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);
  const [phase, setPhase] = useState<Phase>({kind: 'browsing'});
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  /*
   * Checkout: ask OUR backend for a session, then present the sheet. Not the other way round.
   */
  const onCheckout = useCallback(async () => {
    setStoreError(null);
    setPhase({kind: 'starting'});
    try {
      const session = await fetchMerchantSession();
      setPayError(null);
      setPhase({kind: 'paying', session});
    } catch (error) {
      setStoreError(error instanceof Error ? error.message : 'Could not reach the store.');
      setPhase({kind: 'browsing'});
    }
  }, []);

  const onPay = useCallback(async () => {
    if (phase.kind !== 'paying') {
      return;
    }
    setPaying(true);
    setPayError(null);
    /*
     * `submit()` names the payment it is confirming and answers with a navigation decision. The
     * library owns both network calls, so no payment-method token reaches this screen.
     */
    const result: VaultPaymentResult | undefined = await formRef.current?.confirmPayment(
      vaultPaymentFrom(phase.session),
    );
    setPaying(false);
    if (!result) {
      return;
    }
    /* The result is discriminated on `status`: only the failure statuses carry an `error`. */
    if (result.status === 'succeeded' || result.status === 'processing') {
      setPhase({
        kind: 'done',
        outcome: result.status,
        reference: `ARV-${Math.floor(Math.random() * 900000 + 100000)}`,
      });
    } else if (result.status === 'requires_customer_action') {
      /* A real storefront drives the action — redirect or 3DS — then confirms with its backend. */
      setPayError('This card needs one more step. Not implemented in this demo.');
    } else {
      /* Every failure is a typed result, so there is always something honest to show. */
      setPayError(result.error.message);
    }
  }, [phase]);

  const closeSheet = useCallback(() => {
    if (paying) {
      return; /* never yank the sheet out from under an in-flight confirmation */
    }
    setPhase({kind: 'browsing'});
  }, [paying]);

  const sheetOpen = phase.kind === 'paying';
  /*
   * The library publishes no form state, so the Pay button is the storefront's own. It stays
   * enabled: an incomplete card is refused locally, with no network request and a typed message.
   */
  const canPay = !paying;
  /* The blue P is the European parking sign, not a logo. */
  const brandMark = useMemo(() => 'P', []);

  if (phase.kind === 'done') {
    return (
      <Confirmation
        outcome={phase.outcome}
        reference={phase.reference}
        onDone={() => setPhase({kind: 'browsing'})}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>{brandMark}</Text>
          </View>
          <View>
            <Text style={styles.store}>{STORE}</Text>
            <Text style={styles.storeSub}>Parking session · {PLATE}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          {BASKET.map((item, index) => (
            <View key={item.id} style={[styles.row, index > 0 && styles.rowDivided]}>
              <View style={styles.thumb}>
                <Text style={styles.thumbEmoji}>{item.emoji}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemVariant}>{item.variant}</Text>
              </View>
              <Text style={styles.itemPrice}>{money(item.price)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <SummaryLine label="Subtotal" value={money(subtotal)} />
          <SummaryLine label="Service fee" value={money(SERVICE_FEE)} />
          <View style={styles.totalDivider} />
          <SummaryLine label="Total" value={money(total)} emphasis />
        </View>

        {storeError ? <Text style={styles.storeError}>{storeError}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={phase.kind === 'starting'}
          onPress={onCheckout}
          style={({pressed}) => [
            styles.cta,
            pressed && styles.ctaPressed,
            phase.kind === 'starting' && styles.ctaBusy,
          ]}>
          {phase.kind === 'starting' ? (
            <View style={styles.ctaBusyRow}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.ctaLabel}>Starting secure checkout…</Text>
            </View>
          ) : (
            <Text style={styles.ctaLabel}>Pay {money(total)}</Text>
          )}
        </Pressable>

        <Text style={styles.legal}>
          Card details are collected by Hyperswitch and never touch this app.
        </Text>
      </ScrollView>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
        statusBarTranslucent>
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropFill} onPress={closeSheet} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheet}>
              <View style={styles.grabber} />

              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Payment</Text>
                <Text style={styles.sheetAmount}>{money(total)}</Text>
              </View>
              <Text style={styles.sheetSub}>
                Pay for this session and save the card, so future exits are automatic.
              </Text>

              {phase.kind === 'paying' ? (
                <HyperswitchVaultForm
                  ref={formRef}
                  session={phase.session}
                  environment="sandbox"
                  appearance={cardAppearance}
                  layout="inline"
                  fieldOptions={{
                    cardholderName: {placeholder: 'Name on card', errorDisplay: 'inline'},
                    cardNumber: {placeholder: 'Card number', brandIconMode: 'standard', errorDisplay: 'inline'},
                    expiry: {placeholder: 'MM/YY', errorDisplay: 'inline'},
                    cvc: {placeholder: 'CVC', cvcIcon: 'default', errorDisplay: 'inline'},
                  }}
                  fieldArrangement={SPLIT_CARD_FIELDS ? 'separate' : 'fused'}
                />
              ) : null}

              {payError ? <Text style={styles.payError}>{payError}</Text> : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canPay}
                onPress={onPay}
                style={({pressed}) => [
                  styles.payButton,
                  pressed && styles.ctaPressed,
                  !canPay && styles.payButtonDisabled,
                ]}>
                {paying ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.ctaLabel}>Pay {money(total)}</Text>
                )}
              </Pressable>

              <Pressable onPress={closeSheet} disabled={paying} style={styles.cancel}>
                <Text style={[styles.cancelLabel, paying && styles.cancelDisabled]}>Cancel</Text>
              </Pressable>

              <Text style={styles.secured}>🔒 Secured by Hyperswitch</Text>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SummaryLine({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.summaryLine}>
      <Text style={[styles.summaryLabel, emphasis && styles.summaryStrong]}>{label}</Text>
      <Text style={[styles.summaryValue, emphasis && styles.summaryStrong]}>{value}</Text>
    </View>
  );
}

function Confirmation({
  outcome,
  reference,
  onDone,
}: {
  outcome: 'succeeded' | 'processing';
  reference: string;
  onDone: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.successBadge}>
          <Text style={styles.successTick}>✓</Text>
        </View>
        <Text style={styles.successTitle}>
          {outcome === 'succeeded' ? 'Session paid' : 'Payment processing'}
        </Text>
        <Text style={styles.successSub}>
          {STORE} · {reference}
        </Text>

        <View style={styles.panel}>
          <SummaryLine
            label={outcome === 'succeeded' ? 'Paid' : 'Pending'}
            value={money(total)}
            emphasis
          />
          <View style={styles.totalDivider} />
          <SummaryLine label="Card saved" value="for future exits" />
          <View style={styles.totalDivider} />
          <SummaryLine label="Next exit" value="Barrier opens automatically" />
        </View>

        {/*
          There is nothing sensitive to display here, by construction. The library performs the
          final payment confirmation itself, so no payment-method token crosses into the app.
        */}

        <Pressable accessibilityRole="button" onPress={onDone} style={styles.cta}>
          <Text style={styles.ctaLabel}>Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F6F7FB'},
  scroll: {padding: 20, gap: 16},

  header: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4},
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {color: '#FFFFFF', fontSize: 20, fontWeight: '700'},
  store: {fontSize: 20, fontWeight: '700', color: '#0B1220', letterSpacing: -0.3},
  storeSub: {fontSize: 13, color: '#64748B', marginTop: 2},

  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#0B1220',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10},
  rowDivided: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0'},
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbEmoji: {fontSize: 22},
  rowBody: {flex: 1},
  itemName: {fontSize: 15, fontWeight: '600', color: '#0B1220'},
  itemVariant: {fontSize: 13, color: '#64748B', marginTop: 2},
  itemPrice: {fontSize: 15, fontWeight: '600', color: '#0B1220'},

  summaryLine: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6},
  summaryLabel: {fontSize: 14, color: '#64748B'},
  summaryValue: {fontSize: 14, color: '#0B1220'},
  summaryStrong: {fontSize: 16, fontWeight: '700', color: '#0B1220'},
  totalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginVertical: 6,
  },

  cta: {
    height: 54,
    borderRadius: 14,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {opacity: 0.85},
  ctaBusy: {opacity: 0.9},
  ctaBusyRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  ctaLabel: {color: '#FFFFFF', fontSize: 16, fontWeight: '700'},
  legal: {fontSize: 12, color: '#94A3B8', textAlign: 'center'},
  storeError: {color: '#DC2626', fontSize: 13},

  backdrop: {flex: 1, backgroundColor: 'rgba(11,18,32,0.45)', justifyContent: 'flex-end'},
  backdropFill: {flex: 1},
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    gap: 14,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline'},
  sheetTitle: {fontSize: 20, fontWeight: '700', color: '#0B1220'},
  sheetAmount: {fontSize: 18, fontWeight: '700', color: BRAND},
  sheetSub: {fontSize: 13, color: '#64748B', marginTop: -8},
  payError: {color: '#DC2626', fontSize: 13},
  payButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonDisabled: {backgroundColor: '#C7D2FE'},
  cancel: {alignItems: 'center', paddingVertical: 4},
  cancelLabel: {color: '#64748B', fontSize: 15},
  cancelDisabled: {opacity: 0.4},
  secured: {fontSize: 12, color: '#94A3B8', textAlign: 'center'},

  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 24,
  },
  successTick: {fontSize: 34, color: '#16A34A', fontWeight: '700'},
  successTitle: {fontSize: 24, fontWeight: '700', color: '#0B1220', textAlign: 'center'},
  successSub: {fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: -8},
});
