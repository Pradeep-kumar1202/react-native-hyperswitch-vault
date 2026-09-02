/**
 * SCAN CARD, with the optional scanner PRESENT.
 *
 * `coBadgeEligibilityScan.test.tsx` covers the ordinary case — the package is not installed, no
 * button, no error. That proves the absent branch and nothing else, so this suite supplies the
 * scanner and exercises the other one.
 *
 * The scanner is a native module the library deliberately does not depend on: `ScanCardBridge`
 * resolves it with a `require` inside a `try`, exactly as client-core did. A virtual jest mock
 * intercepts that same require, which is why the mock has to be installed before the library is
 * imported — `isAvailable` is decided once, at module load.
 *
 * What matters here is that a scanned card is not a second, privileged input path. The PAN and
 * expiry go through `CardFieldLogic`, the same functions a keystroke uses, so they are formatted
 * and validated identically — and nothing about the scan is reported to the host.
 */
import * as React from 'react';

/* `mock`-prefixed so jest's out-of-scope guard permits the factory to close over it. */
const mockLaunchScanCard: jest.Mock = jest.fn();

jest.mock(
  '@juspay-tech/react-native-hyperswitch-scancard',
  () => ({
    isAvailable: true,
    launchScanCard: (callback: (result: unknown) => void) => mockLaunchScanCard(callback),
  }),
  {virtual: true},
);

import ReactTestRenderer from 'react-test-renderer';
import {TextInput} from 'react-native';
import {HyperswitchVaultForm} from '@juspay-tech/react-native-hyperswitch-vault';
/* The payment flows are the checkout SDK's contract: handle and result types come from ./host. */
import type {HostFormHandle} from '@juspay-tech/react-native-hyperswitch-vault/host';

const SCANNED_PAN = '4242424242424242';
const SCANNED_EXPIRY = {month: '11', year: '2032'};
const CVC = '123';

const DIRECT_CONFIRM = {
  cardSource: {type_: 'direct'} as const,
  paymentId: 'pay_123',
  sdkAuthorization: 'intent-credential',
};

type Call = {url: string; options: any};
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  mockLaunchScanCard.mockReset();
  (global as any).fetch = jest.fn((url: string, options: any) => {
    calls.push({url, options});
    return Promise.resolve({ok: true, status: 200, json: async () => ({status: 'succeeded'})});
  });
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) {
    try {
      ReactTestRenderer.act(() => mounted.pop()!.unmount());
    } catch {
      /* already unmounted */
    }
  }
});

const mount = () => {
  const formRef = React.createRef<HostFormHandle>();
  let r!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(<HyperswitchVaultForm ref={formRef} environment="sandbox" />);
  });
  mounted.push(r);
  return {r, formRef};
};

const inputs = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(TextInput);
const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  inputs(r).find(i => i.props.testID === id)!;
const nodes = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll(node => node.props?.testID === id, {deep: true});
const pressable = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  nodes(r, id).find(node => typeof node.props?.onPress === 'function')!;

/** Answers the pending scan with a successful result. */
const succeedScan = (r: ReactTestRenderer.ReactTestRenderer) => {
  ReactTestRenderer.act(() => pressable(r, 'ScanCardButtonTestId').props.onPress({}));
  const callback = mockLaunchScanCard.mock.calls[0][0];
  ReactTestRenderer.act(() =>
    callback({
      status: 'Succeeded',
      data: {pan: SCANNED_PAN, expiryMonth: SCANNED_EXPIRY.month, expiryYear: SCANNED_EXPIRY.year},
    }),
  );
};

describe('the scan button', () => {
  it('appears when the optional package resolves', () => {
    const {r} = mount();
    expect(nodes(r, 'ScanCardButtonTestId').length).toBeGreaterThan(0);
  });

  it('disappears once there is a number to scan over', () => {
    const {r} = mount();
    ReactTestRenderer.act(() => byId(r, 'CardNumberInputTestId').props.onChangeText('4'));
    /*
     * client-core's rule, reproduced: a scan replaces what is there, so offering it on top of a
     * number the customer has begun typing would be a button that destroys their own input.
     */
    expect(nodes(r, 'ScanCardButtonTestId')).toHaveLength(0);
  });

  it('comes back when the field is cleared again', () => {
    const {r} = mount();
    ReactTestRenderer.act(() => byId(r, 'CardNumberInputTestId').props.onChangeText('4'));
    ReactTestRenderer.act(() => byId(r, 'CardNumberInputTestId').props.onChangeText(''));
    expect(nodes(r, 'ScanCardButtonTestId').length).toBeGreaterThan(0);
  });
});

describe('a successful scan', () => {
  it('fills the number FORMATTED, through the same path a keystroke takes', () => {
    const {r} = mount();
    succeedScan(r);
    expect(byId(r, 'CardNumberInputTestId').props.value).toBe('4242 4242 4242 4242');
  });

  it('fills the expiry as the display string the field owns', () => {
    const {r} = mount();
    succeedScan(r);
    /* `MM / YY` — the scanner reports two fields; the field state holds one string. */
    expect(byId(r, 'ExpiryInputTestId').props.value).toBe('11 / 32');
  });

  it('reaches the wire with the scanned values, un-spaced and four-digit', async () => {
    const {r, formRef} = mount();
    succeedScan(r);
    ReactTestRenderer.act(() => byId(r, 'CVCInputTestId').props.onChangeText(CVC));

    await ReactTestRenderer.act(async () => {
      await formRef.current!.confirmPayment(DIRECT_CONFIRM);
    });

    const card = JSON.parse(calls[0].options.body).payment_method_data.card;
    expect(card.card_number).toBe(SCANNED_PAN);
    expect(card.card_exp_month).toBe('11');
    expect(card.card_exp_year).toBe('2032');
    expect(card.card_cvc).toBe(CVC);
  });

  it('reports nothing about the scan to the host', () => {
    const {r} = mount();
    succeedScan(r);
    const form = r.root.findByProps({environment: 'sandbox'});
    for (const key of Object.keys(form.props)) {
      expect(key).not.toMatch(/^on[A-Z]/);
    }
    expect(JSON.stringify(Object.keys(form.props))).not.toMatch(/scan/i);
  });
});

describe('an unsuccessful scan', () => {
  it.each([['Cancelled'], ['Failed'], ['Something else entirely']])(
    '%s leaves the typed values untouched',
    status => {
      const {r} = mount();
      ReactTestRenderer.act(() => byId(r, 'CardNumberInputTestId').props.onChangeText(''));

      /* Type something first so "untouched" is a claim with content. */
      ReactTestRenderer.act(() => byId(r, 'CVCInputTestId').props.onChangeText('999'));

      ReactTestRenderer.act(() => pressable(r, 'ScanCardButtonTestId').props.onPress({}));
      const callback = mockLaunchScanCard.mock.calls[0][0];
      ReactTestRenderer.act(() => callback({status, data: {pan: '', expiryMonth: '', expiryYear: ''}}));

      expect(byId(r, 'CardNumberInputTestId').props.value).toBe('');
      expect(byId(r, 'ExpiryInputTestId').props.value).toBe('');
      expect(byId(r, 'CVCInputTestId').props.value).toBe('999');
    },
  );

  it('survives a scanner that throws', () => {
    mockLaunchScanCard.mockImplementation(() => {
      throw new Error('native module exploded');
    });
    const {r} = mount();
    expect(() =>
      ReactTestRenderer.act(() => pressable(r, 'ScanCardButtonTestId').props.onPress({})),
    ).not.toThrow();
    expect(byId(r, 'CardNumberInputTestId').props.value).toBe('');
  });
});
