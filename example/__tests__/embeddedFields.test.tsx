/**
 * `/embedded` export contract — the SDK integration surface hyperswitch-client-core renders.
 *
 * These fields are nested ReScript modules, so the compiled output exposes `{make: Component}`.
 * Publishing those module objects once shipped a value React cannot render ("Element type is
 * invalid ... got: object") while every static check still passed — the types described the module
 * object honestly and `createElement` does not validate. This file closes that gap by asserting the
 * shape AND by actually reconciling each field.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  CardNumberField,
  CardExpiryField,
  CardCvcField,
  selectCardFields,
} from '@juspay-tech/react-native-hyperswitch-vault/embedded';

const theme = {
  borderWidth: 1,
  borderRadius: 8,
  gap: 12,
  inputHeight: 48,
  fontFamily: 'System',
  fontScale: 1,
  placeholderTextSizeAdjust: 0,
  placeholderColor: '#6B7280',
  primaryColor: '#0570DE',
  dangerColor: '#DF1B41',
  textColor: '#1A1A1A',
  inputBackground: '#FFFFFF',
  dividerColor: '#E6E6E6',
  errorBorderColor: '#DF1B41',
  normalBorderColor: '#E6E6E6',
  bgStyle: {},
  shadowStyle: {},
} as any;

const renderable = (value: unknown) =>
  typeof value === 'function' || Boolean(value && (value as any).$$typeof);

const isModuleObject = (value: unknown) =>
  Boolean(value && typeof value === 'object' && 'make' in (value as object));

describe('/embedded export shape', () => {
  it.each([
    ['CardNumberField', CardNumberField],
    ['CardExpiryField', CardExpiryField],
    ['CardCvcField', CardCvcField],
  ])('%s is a renderable component, not a ReScript module object', (_name, component) => {
    expect(isModuleObject(component)).toBe(false);
    expect(renderable(component)).toBe(true);
  });

  it('selectCardFields is still a function', () => {
    expect(typeof selectCardFields).toBe('function');
  });
});

describe('/embedded fields reconcile', () => {
  /* React only validates the element type at render, which is why this must actually render. */
  it('renders all three controlled fields without an invalid-element error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let tree!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <>
          <CardNumberField
            value="4242 4242 4242 4242"
            onChange={() => {}}
            label="Card number"
            floatingLabel="Card number"
            theme={theme}
          />
          <CardExpiryField
            value="12 / 30"
            onChange={() => {}}
            label="MM / YY"
            floatingLabel="Expiry"
            theme={theme}
          />
          <CardCvcField
            value="123"
            onChange={() => {}}
            brand="Visa"
            label="CVC"
            floatingLabel="CVC"
            theme={theme}
          />
        </>,
      );
    });

    const inputs = tree.root
      .findAll(
        node =>
          typeof node.type === 'string' && typeof node.props?.onChangeText === 'function',
      )
      .map(node => node.props.testID);

    expect(inputs).toEqual(
      expect.arrayContaining([
        'CardNumberInputTestId',
        'ExpiryInputTestId',
        'CVCInputTestId',
      ]),
    );

    const invalidElement = errorSpy.mock.calls.some(call =>
      String(call[0]).includes('Element type is invalid'),
    );
    expect(invalidElement).toBe(false);
    errorSpy.mockRestore();

    ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
