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
  /*
   * The library publishes no form state, so the button is entirely the merchant's affair. Keeping
   * it enabled costs nothing: an incomplete card is answered with `validation_error` and makes no
   * network request at all.
   */
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
