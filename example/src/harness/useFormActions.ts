/**
 * The handle's operations as buttons, shared by both form screens. Example code only.
 *
 * @format
 */
import {useCallback, useState, type RefObject} from 'react';
import type {VaultField, VaultFormHandle} from '@juspay-tech/react-native-hyperswitch-vault';
import {describeOutcome, type Outcome} from './controls';

export const useFormActions = (formRef: RefObject<VaultFormHandle | null>, append: (line: string) => void) => {
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const [busy, setBusy] = useState(false);

  const tokenize = useCallback(async () => {
    setBusy(true);
    setOutcome('idle');
    const result = await formRef.current?.tokenize();
    setBusy(false);
    const next: Outcome = result ?? 'unmounted';
    setOutcome(next);
    append(`tokenize() · ${describeOutcome(next)}`);
  }, [formRef, append]);

  /* Two calls in one tick: the second must be the SAME promise, and one request goes out. */
  const tokenizeTwice = useCallback(async () => {
    const handle = formRef.current;
    if (!handle) {
      setOutcome('unmounted');
      return;
    }
    setBusy(true);
    const first = handle.tokenize();
    const second = handle.tokenize();
    append(`tokenize() ×2 · ${first === second ? 'same promise' : 'DIFFERENT promises (bug)'}`);
    const result = await first;
    setBusy(false);
    setOutcome(result);
    append(`tokenize() ×2 · ${describeOutcome(result)}`);
  }, [formRef, append]);

  const reset = useCallback(() => {
    formRef.current?.reset();
    setOutcome('idle');
    append('reset() · values, errors, touched flags, co-badge pick and cached token cleared (no-op while busy)');
  }, [formRef, append]);

  const focus = useCallback(
    (field: VaultField) => {
      formRef.current?.focus(field);
      append(`focus('${field}')`);
    },
    [formRef, append],
  );

  return {outcome, busy, tokenize, tokenizeTwice, reset, focus};
};
