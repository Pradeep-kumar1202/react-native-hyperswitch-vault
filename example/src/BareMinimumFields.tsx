import React, {useRef, useState} from 'react';
import {Button, SafeAreaView} from 'react-native';

import {
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  type MerchantSession,
  type VaultFormHandle,
  type VaultPaymentResult,
} from '@juspay-tech/react-native-hyperswitch-vault';
import {vaultPaymentFrom} from './merchantServer';
import {logFormState} from './eventLog';

type BareMinimumFieldsProps = {
  session: MerchantSession;
  /*
   * `submit()` resolves to a NAVIGATION decision, never a token: the library performs the final
   * payment confirmation itself, so there is no credential left for the app to receive.
   */
  onResult: (result: VaultPaymentResult) => void;
};

export function BareMinimumFields({session, onResult}: BareMinimumFieldsProps) {
  const formRef = useRef<VaultFormHandle>(null);
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    setBusy(true);
    const result = await formRef.current?.confirmPayment(vaultPaymentFrom(session));
    setBusy(false);
    if (result) {
      onResult(result);
    }
  };

  return (
    <SafeAreaView style={{flex: 1}}>
      <HyperswitchVaultFormProvider
        ref={formRef}
        session={session}
        environment="sandbox"
        /*
         * OBSERVE ONLY. The button stays enabled on purpose: this screen exists to show that a
         * premature press is answered with `validation_error` and makes no network request, so
         * nothing here is gated on `canSubmit`. `CustomLayoutCheckout` shows the other style,
         * where the button is disabled until the form reports itself ready.
         *
         * The fields themselves still take no props at all — the screen is still bare.
         */
        onFormStateChange={logFormState}
      >
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>

      <Button
        title="Pay"
        disabled={busy}
        onPress={pay}
      />
    </SafeAreaView>
  );
}
