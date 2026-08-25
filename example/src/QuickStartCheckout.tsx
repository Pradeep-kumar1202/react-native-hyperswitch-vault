/**
 * The short version.
 *
 * This is the whole modern integration in one screen: fetch a session from the merchant's own
 * backend, render the ready-made form, and drive a merchant-owned Pay button from `canSubmit`.
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
  type CardBrand,
  type MerchantSession,
  type VaultFormFieldStyles,
  type VaultFormHandle,
  type VaultFormState,
  type VaultSubmitResult,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {fetchMerchantSession} from './merchantServer';

/* Per-field styling: one grouped prop, no flat per-slot props. */
const fieldStyles: VaultFormFieldStyles = {
  cardNumber: {
    container: {borderColor: '#CBD5F5', borderRadius: 12},
    input: {fontSize: 17},
    placeholder: {fontSize: 15},
    label: {fontSize: 12},
  },
  expiry: {container: {borderColor: '#CBD5F5', borderRadius: 12}},
  cvc: {container: {borderColor: '#CBD5F5', borderRadius: 12}},
};

const BRAND_LABEL: Partial<Record<CardBrand, string>> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  americanExpress: 'American Express',
  dinersClub: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  cartesBancaires: 'Cartes Bancaires',
  interac: 'Interac',
  maestro: 'Maestro',
  unionPay: 'UnionPay',
  rupay: 'RuPay',
  sodexo: 'Sodexo',
  bajaj: 'Bajaj',
};

export function QuickStartCheckout() {
  const formRef = useRef<VaultFormHandle>(null);

  const [session, setSession] = useState<MerchantSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [state, setState] = useState<VaultFormState>();
  const [result, setResult] = useState<VaultSubmitResult>();

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

  /* 2. Submit, and handle the three outcomes a merchant has to distinguish. */
  const pay = useCallback(async () => {
    const outcome = await formRef.current?.submit();
    setResult(outcome);
    if (outcome?.status === 'success') {
      /* Send the token to YOUR backend. Never store or display it in the app. */
      await Promise.resolve(outcome.token);
    }
  }, []);

  const unknownOutcome = result?.status === 'error' && result.error.code === 'unknown_outcome';

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

        {/* 3. The form. `onFormStateChange` is the only thing driving the button below. */}
        <HyperswitchVault.CardForm
          ref={formRef}
          session={session}
          environment="sandbox"
          fieldStyles={fieldStyles}
          onFormStateChange={setState}
        />

        {/*
          * Safe field state. The ready-made form reports the aggregate, which carries the detected
          * brand and the three field states — never a card value. (In a custom layout you would put
          * `onStateChange` on `CardNumberField` instead and read the same `brand` from there.)
          */}
        {state && state.brand !== 'unknown' ? (
          <Text style={styles.muted}>{BRAND_LABEL[state.brand] ?? state.brand} detected</Text>
        ) : null}
        {state?.fields.cvc.error ? (
          <Text style={styles.error}>{state.fields.cvc.error.message}</Text>
        ) : null}

        {/* The session itself can be unusable — say so instead of showing a dead button. */}
        {state?.sessionStatus === 'invalid' ? (
          <Text style={styles.error}>This checkout session has expired. Start again.</Text>
        ) : null}

        {/* 4. A merchant-owned Pay button, driven entirely by `canSubmit`. */}
        <Pressable
          style={[styles.primary, !state?.canSubmit && styles.primaryDisabled]}
          disabled={!state?.canSubmit}
          onPress={pay}>
          {state?.submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>Save card</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondary} onPress={() => formRef.current?.reset()}>
          <Text style={styles.secondaryText}>Reset</Text>
        </Pressable>

        {/* 5. Result handling. Success carries a token and nothing else. */}
        {result?.status === 'success' ? (
          <Text style={styles.ok}>Card saved. The token went to your backend.</Text>
        ) : null}

        {result && result.status !== 'success' ? (
          <View>
            <Text style={styles.error}>{result.error.message}</Text>
            {/*
              * An unknown outcome is NOT a failure: the vault may or may not have saved the card.
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
