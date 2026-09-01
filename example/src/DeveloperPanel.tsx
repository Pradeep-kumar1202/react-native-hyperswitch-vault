/**
 * Developer panel — the bare form plus the controls docs/manual-device-checklist.md drives.
 *
 * This is NOT the demo screen; see MerchantCheckout.tsx for that. It exists so the manual runtime
 * procedure can be walked on a device without editing code.
 *
 * The whole integration is: fetch a session from your backend, render <HyperswitchVaultForm/>, and
 * call submit({paymentId, sdkAuthorization}) through a ref. The app never sees a PAN, expiry, CVC,
 * sdk_authorization from the vault details or anything decoded from it.
 *
 * Handling rules this file follows, and yours should too:
 *   - the session lives in component state only. It is never written to AsyncStorage, to a
 *     persisted Redux store, or to any other durable storage: `sdk_authorization` is a short-lived
 *     credential for one payment-method session, and persisting it outlives the session it belongs
 *     to;
 *   - nothing here LOGS the session, the authorization, anything decoded from it, or a card value.
 *     `console.log(session)` in a React Native app reaches Metro, logcat and Console.app, where it
 *     persists; rendering it on screen does not.
 *
 * There is no token box any more, and that is the point: the library performs the final payment
 * confirmation itself, so `submit()` resolves to a NAVIGATION decision — succeeded, processing, a
 * customer action, or a typed error — and no payment-method token ever crosses into the app.
 *
 * The controls below "Pay" exist so that docs/manual-device-checklist.md can be walked
 * without editing code. A production integration needs only the Pay button.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
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
  type VaultPaymentResult,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {MERCHANT_BACKEND, vaultPaymentFrom} from './merchantServer';

export function DeveloperPanel() {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);
  const [session, setSession] = useState<MerchantSession | null>(null);
  /* A counter, NOT the session id: nothing decoded from the authorization is ever displayed. */
  const [sessionSerial, setSessionSerial] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Enter a card to continue.');
  const [detail, setDetail] = useState<string>('');
  const [busy, setBusy] = useState(false);
  /* Live toggle so both layouts can be shown, and checked, without editing code. */
  const [split, setSplit] = useState(false);

  const loadSession = useCallback(async () => {
    setSessionError(null);
    try {
      const response = await fetch(`${MERCHANT_BACKEND}/vault-session`);
      if (!response.ok) {
        /*
         * The server reached Hyperswitch and was refused. Its body carries no detail on purpose —
         * check the server's own log, which prints the HTTP status and nothing else.
         */
        setSessionError(
          `Merchant server could not create a session (HTTP ${response.status}). ` +
            'Check the server log and example-server/.env.',
        );
        return;
      }
      setSession(await response.json());
      setSessionSerial(previous => previous + 1);
      setStatus('Enter a card to continue.');
      setDetail('');
    } catch {
      setSessionError(`Could not reach the merchant server at ${MERCHANT_BACKEND}.`);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const show = useCallback((result: VaultPaymentResult | undefined) => {
    if (!result) {
      return;
    }
    /* The result is discriminated on `status`: only the failure statuses carry an `error`. */
    switch (result.status) {
      case 'succeeded':
        setStatus('Payment succeeded');
        setDetail('succeeded — no token crosses the boundary');
        return;
      case 'processing':
        setStatus('Payment processing');
        setDetail('processing — ask your backend for the final status');
        return;
      case 'requires_customer_action':
        setStatus('Customer action required');
        setDetail(`requires_customer_action / ${result.nextAction.type_}`);
        return;
      default:
        setStatus(result.error.message);
        setDetail(`${result.status} / ${result.error.code}`);
    }
  }, []);

  /*
   * The NON-CARD input `confirmPayment()` needs: the two credentials, plus the card source that
   * says which flow to run. This panel exercises the VAULT source — the one with two requests —
   * because that is the sequence the manual checklist steps through.
   */
  const payment = session ? vaultPaymentFrom(session) : null;

  const onSubmit = useCallback(async () => {
    if (!payment) {
      return;
    }
    setBusy(true);
    setDetail('');
    show(await formRef.current?.confirmPayment(payment));
    setBusy(false);
  }, [payment, show]);

  /* Checklist step 6: two presses in one tick must share one request. */
  const onDoubleSubmit = useCallback(async () => {
    if (!payment) {
      return;
    }
    setBusy(true);
    setDetail('');
    const first = formRef.current?.confirmPayment(payment);
    const second = formRef.current?.confirmPayment(payment);
    setDetail(first === second ? 'same promise returned' : 'DIFFERENT promises — bug');
    show(await first);
    await second;
    setBusy(false);
  }, [payment, show]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.title}>Save a card</Text>

          {sessionError ? (
            <>
              <Text style={styles.error}>{sessionError}</Text>
              <Pressable style={styles.secondary} onPress={loadSession}>
                <Text style={styles.secondaryLabel}>Retry</Text>
              </Pressable>
            </>
          ) : session ? (
            <>
              <HyperswitchVaultForm
                ref={formRef}
                session={session}
                environment="sandbox"
                layout="inline"
                fieldArrangement={split ? 'separate' : 'fused'}
              />

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onSubmit}
                style={[styles.button, busy && styles.buttonMuted]}>
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonLabel}>Pay</Text>
                )}
              </Pressable>

              <Text style={styles.status}>{status}</Text>
              {detail ? <Text style={styles.detail}>{detail}</Text> : null}

              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>
                Manual checks — session #{sessionSerial}, layout {split ? 'split' : 'stacked'}
              </Text>

              <View style={styles.row}>
                <Control label="Reset" onPress={() => formRef.current?.reset()} />
                <Control label="Submit ×2" onPress={onDoubleSubmit} />
                <Control label="New session" onPress={loadSession} />
                <Control label={split ? 'Stacked' : 'Split'} onPress={() => setSplit(v => !v)} />
              </View>
              <View style={styles.row}>
                <Control label="Focus name" onPress={() => formRef.current?.focus('cardholderName')} />
                <Control label="Focus number" onPress={() => formRef.current?.focus('cardNumber')} />
                <Control label="Focus expiry" onPress={() => formRef.current?.focus('expiry')} />
                <Control label="Focus CVC" onPress={() => formRef.current?.focus('cvc')} />
              </View>
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Control({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F6F8FA'},
  scroll: {paddingVertical: 16},
  card: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    gap: 16,
  },
  title: {fontSize: 20, fontWeight: '600', color: '#1A1A1A'},
  button: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0570DE',
  },
  buttonMuted: {opacity: 0.5},
  buttonLabel: {color: '#FFFFFF', fontSize: 16, fontWeight: '600'},
  status: {color: '#4B5563'},
  detail: {color: '#6B7280', fontSize: 12},
  error: {color: '#DF1B41'},
  divider: {height: StyleSheet.hairlineWidth, backgroundColor: '#E6E6E6'},
  sectionLabel: {color: '#6B7280', fontSize: 12},
  row: {flexDirection: 'row', gap: 8},
  secondary: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C9CED6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {color: '#1A1A1A', fontSize: 13},
});
