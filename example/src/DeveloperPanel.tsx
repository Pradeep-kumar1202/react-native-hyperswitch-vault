/**
 * Developer panel — the bare form plus the controls docs/manual-device-checklist.md drives.
 *
 * This is NOT the demo screen; see MerchantCheckout.tsx for that. It exists so the manual runtime
 * procedure can be walked on a device without editing code.
 *
 * The whole integration is: fetch a session from your backend, render <HyperswitchVaultForm/>, and
 * call submit() through a ref. The app never sees a PAN, expiry, CVC, sdk_authorization or anything
 * decoded from it.
 *
 * Handling rules this file follows, and yours should too:
 *   - the session lives in component state only. It is never written to AsyncStorage, to a
 *     persisted Redux store, or to any other durable storage: `sdk_authorization` is a short-lived
 *     credential for one payment-method session, and persisting it outlives the session it belongs
 *     to;
 *   - nothing here LOGS the session, the authorization, anything decoded from it, a card value or
 *     the returned token. `console.log(session)` in a React Native app reaches Metro, logcat and
 *     Console.app, where it persists; rendering it on screen does not;
 *   - the token goes straight to the merchant's own backend.
 *
 * ONE deliberate exception, for this example only: the returned payment-method token IS shown on
 * screen, so a developer can read it off the device and check it against their dashboard. It is a
 * reference to the stored card, not card data — but it is still a credential for charging that
 * card, so a production app should send it to its own backend and never render it. The README says
 * the same.
 *
 * The controls below "Save card" exist so that docs/manual-device-checklist.md can be walked
 * without editing code. A production integration needs only the Save button.
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
  type VaultSubmitResult,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {MERCHANT_BACKEND} from './merchantServer';

export function DeveloperPanel() {
  const formRef = useRef<HyperswitchVaultFormHandle>(null);
  const [session, setSession] = useState<MerchantSession | null>(null);
  /* A counter, NOT the session id: nothing decoded from the authorization is ever displayed. */
  const [sessionSerial, setSessionSerial] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Enter a card to continue.');
  const [detail, setDetail] = useState<string>('');
  /* Example-only: see the note at the top of this file. */
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
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
      setToken(null);
    } catch {
      setSessionError(`Could not reach the merchant server at ${MERCHANT_BACKEND}.`);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const show = useCallback((result: VaultSubmitResult | undefined) => {
    if (!result) {
      return;
    }
    if (result.status === 'success') {
      setStatus(`Card saved •••• ${result.card.last4Digits}`);
      setToken(result.token);
      setDetail(
        `expires ${result.card.expiryMonth}/${result.card.expiryYear}` +
          (result.card.binNumber ? ` · BIN ${result.card.binNumber}` : ''),
      );
    } else {
      setStatus(result.error.message);
      setDetail(`${result.status} / ${result.error.code}`);
      setToken(null);
    }
  }, []);

  const onSubmit = useCallback(async () => {
    setBusy(true);
    setDetail('');
    setToken(null);
    show(await formRef.current?.submit());
    setBusy(false);
  }, [show]);

  /* Checklist step 6: two presses in one tick must share one request. */
  const onDoubleSubmit = useCallback(async () => {
    setBusy(true);
    setDetail('');
    setToken(null);
    const first = formRef.current?.submit();
    const second = formRef.current?.submit();
    setDetail(first === second ? 'same promise returned' : 'DIFFERENT promises — bug');
    show(await first);
    await second;
    setBusy(false);
  }, [show]);

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
                splitCardFields={split}
                onStateChange={state => setComplete(state.complete)}
              />

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onSubmit}
                style={[styles.button, (busy || !complete) && styles.buttonMuted]}>
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonLabel}>Save card</Text>
                )}
              </Pressable>

              <Text style={styles.status}>{status}</Text>
              {detail ? <Text style={styles.detail}>{detail}</Text> : null}

              {token ? (
                <View style={styles.tokenBox}>
                  <Text style={styles.tokenLabel}>
                    payment_method token — shown for this example only
                  </Text>
                  {/* Selectable so it can be copied off the device for a dashboard lookup. */}
                  <Text selectable style={styles.tokenValue}>
                    {token}
                  </Text>
                </View>
              ) : null}

              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>
                Manual checks — session #{sessionSerial}, form {complete ? 'complete' : 'incomplete'}
                , layout {split ? 'split' : 'stacked'}
              </Text>

              <View style={styles.row}>
                <Control
                  label="Reset"
                  onPress={() => {
                    formRef.current?.reset();
                    setToken(null);
                  }}
                />
                <Control label="Submit ×2" onPress={onDoubleSubmit} />
                <Control label="New session" onPress={loadSession} />
                <Control label={split ? 'Stacked' : 'Split'} onPress={() => setSplit(v => !v)} />
              </View>
              <View style={styles.row}>
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
  tokenBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    gap: 4,
  },
  tokenLabel: {color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5},
  tokenValue: {color: '#0F172A', fontSize: 13, fontFamily: 'monospace'},
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
