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
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  type MerchantSession,
  type VaultFormAppearance,
  type VaultFormHandle,
  type VaultFormState,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {fetchMerchantSession} from './src/merchantServer';

const BRAND = '#0B5FBF';

const appearance: VaultFormAppearance = {
  primaryColor: BRAND,
  textColor: '#0B1220',
  placeholderColor: '#94A3B8',
  borderColor: '#D7E0E5',
  errorColor: '#DC2626',
  borderRadius: 12,
  inputHeight: 56,
};

type Outcome =
  | {kind: 'idle'}
  | {kind: 'tokenized'; token: string}
  | {kind: 'failed'; message: string};

export default function App() {
  const formRef = useRef<VaultFormHandle>(null);

  const [session, setSession] = useState<MerchantSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({kind: 'idle'});

  useEffect(() => {
    fetchMerchantSession()
      .then(setSession)
      .catch(() => setSessionError('Could not reach the merchant server. Is `yarn server` running?'));
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    setOutcome({kind: 'idle'});
    const result = await formRef.current?.tokenize();
    setBusy(false);

    if (result === undefined) {
      setOutcome({kind: 'failed', message: 'The form was not mounted.'});
    } else if (result.status === 'success') {
      setOutcome({kind: 'tokenized', token: result.token});
    } else {
      setOutcome({kind: 'failed', message: result.error.message});
    }
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
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Save a card</Text>
        <Text style={styles.subtitle}>
          Your card is sent straight to Hyperswitch. This app never sees the number.
        </Text>

        <HyperswitchVaultFormProvider
          ref={formRef}
          session={session}
          environment="sandbox"
          appearance={appearance}
          onFormStateChange={(state: VaultFormState) =>
            setCanSubmit(state.canSubmit && state.sessionStatus === 'valid')
          }>
          <View style={styles.field}>
            <CardNumberField />
          </View>

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <CardExpiryField />
            </View>
            <View style={styles.rowItem}>
              <CardCVCField />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={save}
            style={({pressed}) => [
              styles.cta,
              pressed && styles.ctaPressed,
              !canSubmit && styles.ctaIdle,
            ]}>
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaLabel}>Save card</Text>
            )}
          </Pressable>
        </HyperswitchVaultFormProvider>

        {outcome.kind === 'tokenized' ? (
          <View style={styles.resultOk}>
            <Text style={styles.resultTitle}>Card saved</Text>
            <Text style={styles.token} selectable>
              {outcome.token}
            </Text>
          </View>
        ) : null}

        {outcome.kind === 'failed' ? (
          <View style={styles.resultBad}>
            <Text style={styles.resultTitle}>Not saved</Text>
            <Text style={styles.error}>{outcome.message}</Text>
          </View>
        ) : null}

        <Text style={styles.footnote}>🔒 tokenize() · one call · the token never touches this app's state beyond this screen</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F6F7FB'},
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  page: {padding: 20, gap: 14},

  title: {fontSize: 26, fontWeight: '700', color: '#0B1220'},
  subtitle: {fontSize: 14, color: '#64748B', marginBottom: 6},

  field: {marginBottom: 2},
  row: {flexDirection: 'row', gap: 12},
  rowItem: {flex: 1},

  cta: {
    marginTop: 10,
    height: 52,
    borderRadius: 12,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {opacity: 0.85},
  ctaIdle: {opacity: 0.55},
  ctaLabel: {color: '#FFFFFF', fontSize: 16, fontWeight: '600'},

  resultOk: {backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, gap: 6},
  resultBad: {backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, gap: 6},
  resultTitle: {fontSize: 15, fontWeight: '700', color: '#0B1220'},
  token: {fontSize: 13, color: '#065F46', fontFamily: 'Courier'},
  error: {fontSize: 14, color: '#B91C1C'},

  footnote: {fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 8},
});
