/**
 * EXACTLY ONE CARDHOLDER NAME FIELD — and who owns it.
 *
 * ── THE BUG THIS PINS ──────────────────────────────────────────────────────────
 *
 * Two "card holder name" inputs appeared on screen in both client-core card flows. The library's
 * ready-made form renders one unconditionally; client-core's dynamic required-fields rendered
 * another, because its `CardHolderName` field render type was grouped with `FirstName`/`LastName`
 * and reached `FullNameElement`.
 *
 * Neither side could see the other, so neither could tell it was asking twice.
 *
 * ── THE FIX, FROM THIS SIDE ────────────────────────────────────────────────────
 *
 * The form gained `cardholderName: 'collect' | 'omit'`. It defaults to `collect`, so a merchant
 * integration is unchanged; a host that already collects a name of its own passes `omit` and the
 * field is NOT RENDERED — not hidden, not zero-height, not present-and-invisible. A hidden input is
 * still mounted, still reachable by a screen reader and still part of the form, which is why the
 * count below is over mounted inputs rather than over what happens to be visible.
 *
 * The client-core half of the fix is pinned by
 * `hyperswitch-client-core/__tests__/CardholderNameOwnership-test.js`.
 */
import * as React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {TextInput} from 'react-native';
import {
  HyperswitchVaultForm,
  HyperswitchVaultFormProvider,
  CardholderNameField,
  CardNumberField,
  CardExpiryField,
  CardCVCField,
} from '@juspay-tech/react-native-hyperswitch-vault';
/* The payment flows are the checkout SDK's contract: handle and result types come from ./host. */
import type {HostFormHandle} from '@juspay-tech/react-native-hyperswitch-vault/host';

const PAN = '4242424242424242';
const EXPIRY = `12${String((new Date().getFullYear() + 3) % 100).padStart(2, '0')}`;
const CVC = '123';
const NAME = 'Ada Lovelace';

const DIRECT_CONFIRM = {
  cardSource: {type_: 'direct'} as const,
  paymentId: 'pay_123',
  sdkAuthorization: 'intent-credential',
};

type Call = {url: string; options: any};
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
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

const render = (element: React.ReactElement) => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(element);
  });
  mounted.push(r);
  return r;
};

const inputs = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(TextInput);
const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  inputs(r).find(i => i.props.testID === id);
const cardholderInputs = (r: ReactTestRenderer.ReactTestRenderer) =>
  inputs(r).filter(i => i.props.testID === 'CardholderNameInputTestId');

const CARDHOLDER_OPTIONS = {
  testID: 'CardholderNameInputTestId',
  accessibilityLabel: 'Cardholder name',
  label: 'Cardholder name',
  placeholder: 'Name on card',
} as const;

describe('the ready-made form', () => {
  it('renders exactly ONE cardholder input by default', () => {
    const r = render(
      <HyperswitchVaultForm
        environment="sandbox"
        fieldOptions={{cardholderName: CARDHOLDER_OPTIONS}}
      />,
    );
    expect(cardholderInputs(r)).toHaveLength(1);
  });

  it('renders exactly one accessibility label and one test ID for it', () => {
    const r = render(
      <HyperswitchVaultForm
        environment="sandbox"
        fieldOptions={{cardholderName: CARDHOLDER_OPTIONS}}
      />,
    );
    const labelled = inputs(r).filter(i => i.props.accessibilityLabel === 'Cardholder name');
    expect(labelled).toHaveLength(1);
    expect(cardholderInputs(r)).toHaveLength(1);
  });

  it('renders exactly FOUR inputs in total — name, number, expiry, CVC', () => {
    const r = render(<HyperswitchVaultForm environment="sandbox" />);
    expect(inputs(r)).toHaveLength(4);
  });

  it('renders ZERO cardholder inputs when the host owns the name', () => {
    const r = render(
      <HyperswitchVaultForm
        environment="sandbox"
        cardholderName="omit"
        fieldOptions={{cardholderName: CARDHOLDER_OPTIONS}}
      />,
    );
    /*
     * Not rendered, not merely invisible: a hidden input would still be found here, and would still
     * be announced by a screen reader as a second name field.
     */
    expect(cardholderInputs(r)).toHaveLength(0);
    expect(inputs(r)).toHaveLength(3);
  });

  it('omitting it changes nothing about the other three fields', () => {
    const r = render(<HyperswitchVaultForm environment="sandbox" cardholderName="omit" />);
    expect(byId(r, 'CardNumberInputTestId')).toBeDefined();
    expect(byId(r, 'ExpiryInputTestId')).toBeDefined();
    expect(byId(r, 'CVCInputTestId')).toBeDefined();
  });
});

describe('a custom layout', () => {
  it('renders one cardholder input when the host places one', () => {
    const r = render(
      <HyperswitchVaultFormProvider environment="sandbox">
        <CardholderNameField testID="CardholderNameInputTestId" />
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    expect(cardholderInputs(r)).toHaveLength(1);
  });

  it('renders none when the host places none — the field is optional', () => {
    const r = render(
      <HyperswitchVaultFormProvider environment="sandbox">
        <CardNumberField />
        <CardExpiryField />
        <CardCVCField />
      </HyperswitchVaultFormProvider>,
    );
    expect(cardholderInputs(r)).toHaveLength(0);
    expect(inputs(r)).toHaveLength(3);
  });
});

describe('the value stays inside the library and reaches only the intended request', () => {
  const fill = (r: ReactTestRenderer.ReactTestRenderer, withName: boolean) => {
    if (withName) {
      ReactTestRenderer.act(() => byId(r, 'CardholderNameInputTestId')!.props.onChangeText(NAME));
    }
    ReactTestRenderer.act(() => byId(r, 'CardNumberInputTestId')!.props.onChangeText(PAN));
    ReactTestRenderer.act(() => byId(r, 'ExpiryInputTestId')!.props.onChangeText(EXPIRY));
    ReactTestRenderer.act(() => byId(r, 'CVCInputTestId')!.props.onChangeText(CVC));
  };

  it('sends the typed name as card_holder_name in a direct confirm', async () => {
    const formRef = React.createRef<HostFormHandle>();
    const r = render(
      <HyperswitchVaultForm
        ref={formRef}
        environment="sandbox"
        fieldOptions={{cardholderName: CARDHOLDER_OPTIONS}}
      />,
    );
    fill(r, true);

    let result: any;
    await ReactTestRenderer.act(async () => {
      result = await formRef.current!.confirmPayment(DIRECT_CONFIRM);
    });

    expect(JSON.parse(calls[0].options.body).payment_method_data.card.card_holder_name).toBe(NAME);

    /* And it is nowhere in what comes back. */
    expect(JSON.stringify(result)).not.toContain(NAME);
    expect(Object.keys(result)).toEqual(['status']);
  });

  it('sends NO card_holder_name when the field was omitted', async () => {
    const formRef = React.createRef<HostFormHandle>();
    const r = render(
      <HyperswitchVaultForm ref={formRef} environment="sandbox" cardholderName="omit" />,
    );
    fill(r, false);

    await ReactTestRenderer.act(async () => {
      await formRef.current!.confirmPayment(DIRECT_CONFIRM);
    });

    const card = JSON.parse(calls[0].options.body).payment_method_data.card;
    /*
     * Exactly the classic client-core behaviour: that flow never sent `card_holder_name` either,
     * because the name it collected was the BILLING name and went to the billing subtree.
     */
    expect('card_holder_name' in card).toBe(false);
    expect(card.card_number).toBe(PAN);
  });

  it('publishes no way to read or set the name in either mode', () => {
    for (const mode of ['collect', 'omit'] as const) {
      const formRef = React.createRef<HostFormHandle>();
      const r = render(
        <HyperswitchVaultForm ref={formRef} environment="sandbox" cardholderName={mode} />,
      );
      const form = r.root.findByProps({environment: 'sandbox'});
      for (const key of Object.keys(form.props)) {
        expect(key).not.toMatch(/^on[A-Z]/);
      }
      expect(Object.keys(formRef.current as unknown as object).sort()).toEqual([
        'confirmPayment',
        'focus',
        'reset',
        'tokenize',
      ]);
    }
  });

  it('focus("cardholderName") is still safe when the field is omitted', () => {
    const formRef = React.createRef<HostFormHandle>();
    render(<HyperswitchVaultForm ref={formRef} environment="sandbox" cardholderName="omit" />);
    expect(() => formRef.current!.focus('cardholderName')).not.toThrow();
  });
});
