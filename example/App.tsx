/**
 * The example app is a TEST HARNESS for @juspay-tech/react-native-hyperswitch-vault.
 *
 * Three screens, switched by the tab bar at the bottom:
 *
 *   Custom layout    the provider plus the four field widgets placed by hand — every provider prop,
 *                    every field prop, mount / unmount / duplicate, the handle
 *   Ready-made form  HyperswitchVaultForm — the same provider props plus layout, fieldArrangement,
 *                    fieldOptions and fieldStyles
 *   Saved card       HyperswitchVaultSavedCardForm (ADR-0008) — every prop, list-payment-methods,
 *                    the handle
 *
 * Every prop starts UNSET on every screen, so the first thing rendered is the library's own
 * default. Flip a chip or type in a field and the component re-resolves live.
 *
 * The session comes from the merchant server in ../example-server, which holds the secret key.
 * This app never sees the card number, and never receives a credential other than the session.
 *
 * @format
 */
import React, {useEffect, useState} from 'react';
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
import {type MerchantSession} from '@juspay-tech/react-native-hyperswitch-vault';
import {fetchMerchantSession} from './src/merchantServer';
import {BRAND} from './src/harness/controls';
import {CustomLayoutScreen} from './src/screens/CustomLayoutScreen';
import {ReadyMadeFormScreen} from './src/screens/ReadyMadeFormScreen';
import {SavedCardPlayground} from './src/SavedCardPlayground';

type Screen = 'custom' | 'form' | 'saved';
const TABS: Array<{id: Screen; label: string}> = [
  {id: 'custom', label: 'Custom layout'},
  {id: 'form', label: 'Ready-made form'},
  {id: 'saved', label: 'Saved card'},
];

export default function App() {
  const [session, setSession] = useState<MerchantSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('custom');

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

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {/* Keyed by screen so switching tabs remounts the form and starts from a clean state. */}
        {screen === 'custom' ? <CustomLayoutScreen key="custom" session={session} /> : null}
        {screen === 'form' ? <ReadyMadeFormScreen key="form" session={session} /> : null}
        {screen === 'saved' ? <SavedCardPlayground key="saved" session={session} /> : null}
      </ScrollView>

      {/* At the BOTTOM, where no status bar or camera cut-out can cover it. */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            onPress={() => setScreen(tab.id)}
            style={[styles.tab, screen === tab.id && styles.tabOn]}>
            <Text style={[styles.tabLabel, screen === tab.id && styles.tabLabelOn]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F6F7FB'},
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12},
  /* SafeAreaView pads nothing on Android, so the status bar / camera cut-out is padded by hand. */
  page: {
    padding: 16,
    paddingTop: 16 + (Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 0),
    paddingBottom: 24,
  },
  error: {fontSize: 14, color: '#B91C1C', textAlign: 'center'},
  muted: {fontSize: 13, color: '#64748B'},

  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  tab: {
    flex: 1,
    height: 44,
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
});
