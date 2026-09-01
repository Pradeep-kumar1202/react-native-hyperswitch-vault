/**
 * The short version.
 *
 * This is the whole modern integration in one screen: fetch a session from the merchant's own
 * backend, render the ready-made form, and pay through a merchant-owned button.
 * Everything else in this app — the storefront in `MerchantCheckout`, the hand-placed fields in
 * `CustomLayoutCheckout`, the device controls in `DeveloperPanel` — is elaboration on top of it.
 *
 * There is no API key here and no React Native `.env`. The app calls `example-server/`, which holds
 * the secret key, and receives only the client-safe session response.
 */
import React, {useCallback, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  HyperswitchVault,
  type MerchantSession,
  type VaultFormFieldOptions,
  type VaultFormFieldStyles,
  type VaultFormHandle,
  type VaultPaymentResult,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {fetchMerchantSession, vaultPaymentFrom, directPaymentFrom} from './merchantServer';

/*
 * WHICH ELEMENTS EXIST. Every one of these is now ON by default, so this block changes nothing that
 * matters — it is kept because it is the readable way to SEE what a field can render, and because
 * naming the strings here is how a merchant would localise them without a `localisation` prop.
 * Delete it entirely and this checkout looks the same.
 */
const fieldOptions: VaultFormFieldOptions = {
  cardholderName: {placeholder: 'Name on card', errorDisplay: 'inline'},
  cardNumber: {placeholder: 'Card number', brandIconMode: 'standard', errorDisplay: 'inline'},
  expiry: {placeholder: 'MM/YY', errorDisplay: 'inline'},
  cvc: {placeholder: 'CVC', cvcIcon: 'default', errorDisplay: 'inline'},
};

/* HOW THE ENABLED ELEMENTS LOOK. A separate axis from the options above. */
const fieldStyles: VaultFormFieldStyles = {
  cardholderName: {container: {borderColor: '#CBD5F5', borderRadius: 12}},
  cardNumber: {
    container: {borderColor: '#CBD5F5', borderRadius: 12},
    input: {fontSize: 17},
    placeholder: {fontSize: 15},
    label: {fontSize: 12},
  },
  expiry: {container: {borderColor: '#CBD5F5', borderRadius: 12}},
  cvc: {container: {borderColor: '#CBD5F5', borderRadius: 12}},
};

export function QuickStartCheckout() {
  const formRef = useRef<VaultFormHandle>(null);

  const [session, setSession] = useState<MerchantSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  /*
   * The library publishes no form state any more, so the Pay button is the merchant's own state.
   * It stays enabled: an incomplete card is answered with `validation_error` and no network
   * request, which is a better experience than a button that never explains itself.
   */
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<VaultPaymentResult>();

  /* 1. The merchant's own backend creates the session. The app never holds a secret key. */
  const startCheckout = useCallback(async () => {
    setLoadingSession(true);
    setSessionError(null);
    setResult(undefined);
    try {
      setSession(await fetchMerchantSession());
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Could not reach the merchant server.');
    } finally {
      setLoadingSession(false);
    }
  }, []);

  /*
   * ── 2. Submit ──────────────────────────────────────────────────────────────
   *
   * `confirmPayment()` resolves to a navigation decision. The library owns every network call, so
   * there is no token to hand back and nothing for this screen to forward to a backend.
   *
   * `cardSource` is the only thing that differs between the two flows, and this screen makes the
   * choice visible because it is the choice that matters:
   *
   *   vault  — tokenize the card, then confirm with the token. The card is saved.
   *   direct — confirm with the card itself. One request, no token, nothing saved.
   *
   * The FORM is identical either way. That is the whole point of the correction: turning vaulting
   * off changes what the request carries, not who owns the card fields.
   */
  const [vaulting, setVaulting] = useState(true);

  const pay = useCallback(async () => {
    if (!session) {
      return;
    }
    setSubmitting(true);
    const outcome = await formRef.current?.confirmPayment(
      vaulting ? vaultPaymentFrom(session) : directPaymentFrom(session),
    );
    setSubmitting(false);
    setResult(outcome);
  }, [session, vaulting]);

  /*
   * The result is discriminated on `status`. Only the three failure statuses carry an `error`, and
   * only `requires_customer_action` carries a `nextAction` — the union says so, so there is nothing
   * to guess at.
   */
  const failure =
    result &&
    (result.status === 'failed' ||
      result.status === 'validation_error' ||
      result.status === 'not_ready')
      ? result.error
      : undefined;
  const unknownOutcome = failure?.code === 'unknown_outcome';

  if (!session) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>Add a card</Text>
        <Text style={styles.muted}>Your backend creates the payment-method session.</Text>
        <Pressable style={styles.primary} onPress={startCheckout} disabled={loadingSession}>
          {loadingSession ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Start</Text>}
        </Pressable>
        {sessionError ? <Text style={styles.error}>{sessionError}</Text> : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Add a card</Text>

        {/* 3. The form. Cardholder name, card number, expiry and CVC — the library owns all four. */}
        <HyperswitchVault.CardForm
          ref={formRef}
          session={session}
          environment="sandbox"
          fieldOptions={fieldOptions}
          fieldStyles={fieldStyles}
        />

        {/*
          * A developer toggle, not a customer control: in a real integration the merchant profile
          * decides this. It is here so the two sources can be compared against one identical form.
          */}
        <Pressable style={styles.sourceToggle} onPress={() => setVaulting(current => !current)}>
          <Text style={styles.muted}>
            {vaulting ? 'Vaulting ON — tokenize, then confirm' : 'Vaulting OFF — confirm directly'}
          </Text>
        </Pressable>

        {/* 4. A merchant-owned Pay button. Its enabled state is this screen's business, not the library's. */}
        <Pressable
          style={[styles.primary, submitting && styles.primaryDisabled]}
          disabled={submitting}
          onPress={pay}>
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>Pay</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondary} onPress={() => formRef.current?.reset()}>
          <Text style={styles.secondaryText}>Reset</Text>
        </Pressable>

        {/* 5. Result handling. Success means the PAYMENT succeeded — no token exists to store. */}
        {result?.status === 'succeeded' ? <Text style={styles.ok}>Payment succeeded.</Text> : null}
        {result?.status === 'processing' ? (
          <Text style={styles.muted}>Payment is processing. Your backend will hear the outcome.</Text>
        ) : null}

        {result?.status === 'requires_customer_action' ? (
          <View>
            <Text style={styles.muted}>
              The customer has to finish this payment: {result.nextAction.type_}
            </Text>
            {/*
              * A real app would drive the action here — open `redirectUrl` in a browser or web view,
              * run the 3DS challenge, and then ask its own backend for the final status.
              */}
            {result.nextAction.redirectUrl ? (
              <Text style={styles.muted}>Redirect required.</Text>
            ) : null}
          </View>
        ) : null}

        {failure ? (
          <View>
            <Text style={styles.error}>{failure.message}</Text>
            {/*
              * An unknown outcome is NOT a failure: the payment may or may not have been taken.
              * Ask your backend what happened before charging the customer again.
              */}
            <Text style={styles.muted}>
              {unknownOutcome
                ? 'We could not confirm the result. Check with support before trying again.'
                : 'You can try again.'}
            </Text>
            {!unknownOutcome ? (
              <Pressable style={styles.secondary} onPress={pay}>
                <Text style={styles.secondaryText}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sourceToggle: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  root: {flex: 1, backgroundColor: '#F6F7FB'},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24},
  body: {padding: 20, gap: 14},
  title: {fontSize: 22, fontWeight: '700', color: '#0B1220'},
  muted: {fontSize: 13, color: '#64748B'},
  ok: {fontSize: 14, color: '#15803D', fontWeight: '600'},
  error: {fontSize: 14, color: '#B91C1C'},
  primary: {
    backgroundColor: '#0B1220',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    minWidth: 160,
  },
  primaryDisabled: {backgroundColor: '#CBD5E1'},
  primaryText: {color: '#FFFFFF', fontWeight: '700', fontSize: 15},
  secondary: {paddingVertical: 10, alignItems: 'center'},
  secondaryText: {color: '#0B1220', fontWeight: '600'},
});
