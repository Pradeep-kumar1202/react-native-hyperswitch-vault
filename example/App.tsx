/**
 * Example app shell.
 *
 * Four sections, one tab bar:
 *   - Bare      — the smallest independent-fields integration: the three field components with no
 *                 props at all, placed by the merchant's own View layout. Read this one first if
 *                 you are laying the fields out yourself.
 *   - Start     — the shortest complete integration: session, ready-made form, and a merchant Pay
 *                 button driven by `canSubmit`.
 *   - Store     — the ready-made <HyperswitchVaultForm/> inside a normal checkout sheet.
 *   - Custom    — <HyperswitchVaultFormProvider/> with the three field widgets placed wherever the
 *                 merchant's own layout wants them.
 *   - Developer — the bare form plus the controls docs/manual-device-checklist.md drives.
 *
 * Neither screen holds an API key and there is no React Native .env: the app only ever calls the
 * merchant server in `example-server/` and receives the client-safe session response.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, SafeAreaView, StyleSheet, Text, View} from 'react-native';
import {BareMinimumFields} from './src/BareMinimumFields';
import {fetchMerchantSession} from './src/merchantServer';
import type {MerchantSession} from '@juspay-tech/react-native-hyperswitch-vault';
import {QuickStartCheckout} from './src/QuickStartCheckout';
import {MerchantCheckout} from './src/MerchantCheckout';
import {DeveloperPanel} from './src/DeveloperPanel';
import {CustomLayoutCheckout} from './src/CustomLayoutCheckout';

type Tab = 'bare' | 'start' | 'store' | 'custom' | 'dev';

const TABS: {key: Tab; icon: string; label: string}[] = [
  {key: 'bare', icon: '▫️', label: 'Bare minimum'},
  {key: 'start', icon: '⚡', label: 'Start'},
  {key: 'store', icon: '🛍', label: 'Store'},
  {key: 'custom', icon: '🧩', label: 'Custom layout'},
  {key: 'dev', icon: '🛠', label: 'Developer'},
];

export default function App() {
  const [tab, setTab] = useState<Tab>('bare');

  /*
   * The app owns session acquisition. `BareMinimumFields` takes a non-null `MerchantSession`, so
   * this guard is what guarantees the provider is never handed a null one.
   */
  const [bareSession, setBareSession] = useState<MerchantSession | null>(null);
  useEffect(() => {
    if (tab === 'bare' && !bareSession) {
      fetchMerchantSession().then(setBareSession).catch(() => {});
    }
  }, [tab, bareSession]);

  return (
    <View style={styles.root}>
      <View style={styles.screen}>
        {tab === 'bare' ? (
          bareSession ? (
            <BareMinimumFields
              session={bareSession}
              onTokenized={token => {
                /* Send the token to YOUR backend. Never store or display it in the app. */
                void token;
              }}
            />
          ) : null
        ) : tab === 'start' ? (
          <QuickStartCheckout />
        ) : tab === 'store' ? (
          <MerchantCheckout />
        ) : tab === 'custom' ? (
          <CustomLayoutCheckout />
        ) : (
          <DeveloperPanel />
        )}
      </View>

      <SafeAreaView style={styles.tabBarSafe}>
        <View style={styles.tabBar}>
          {TABS.map(item => {
            const active = item.key === tab;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{selected: active}}
                onPress={() => setTab(item.key)}
                style={({pressed}) => [styles.tab, pressed && styles.tabPressed]}>
                <Text style={[styles.tabIcon, !active && styles.tabIconIdle]}>{item.icon}</Text>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
                <View style={[styles.tabRule, active && styles.tabRuleActive]} />
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F6F7FB'},
  screen: {flex: 1},

  tabBarSafe: {backgroundColor: '#FFFFFF'},
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    paddingBottom: 6,
  },
  tab: {flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4},
  tabPressed: {opacity: 0.6},
  tabIcon: {fontSize: 18},
  tabIconIdle: {opacity: 0.55},
  tabLabel: {fontSize: 11, fontWeight: '600', color: '#94A3B8'},
  tabLabelActive: {color: '#0B1220'},
  tabRule: {height: 2, width: 22, borderRadius: 1, backgroundColor: 'transparent', marginTop: 2},
  tabRuleActive: {backgroundColor: '#0B1220'},
});
