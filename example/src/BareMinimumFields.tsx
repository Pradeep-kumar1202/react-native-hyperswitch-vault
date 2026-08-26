import React, {useRef, useState} from 'react';
import {Button, SafeAreaView} from 'react-native';

import {
  HyperswitchVaultFormProvider,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
  type MerchantSession,
  type VaultFormHandle,
} from '@juspay-tech/react-native-hyperswitch-vault';

type BareMinimumFieldsProps = {
  session: MerchantSession;
  onTokenized: (token: string) => void;
};

export function BareMinimumFields({
  session,
  onTokenized,
}: BareMinimumFieldsProps) {
  const formRef = useRef<VaultFormHandle>(null);
  const [canSubmit, setCanSubmit] = useState(false);

  const tokenize = async () => {
    const result = await formRef.current?.submit();

    if (result?.status === 'success') {
      onTokenized(result.token);
    }
  };

  return (
    <SafeAreaView style={{flex: 1}}>
      <HyperswitchVaultFormProvider
        ref={formRef}
        session={session}
        environment="sandbox"
        onFormStateChange={state => {
          setCanSubmit(state.canSubmit);
        }}
      >
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>

      <Button
        title="Tokenize"
        disabled={!canSubmit}
        onPress={tokenize}
      />
    </SafeAreaView>
  );
}
