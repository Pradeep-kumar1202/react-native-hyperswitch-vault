/**
 * Smoke test: the example app mounts.
 *
 * `fetch` is stubbed. The app fetches a session on mount, and with a real `fetch` this test depends
 * on whether the merchant server happens to be running: it passes with the server up and fails
 * intermittently without it, because the rejection lands after the test has finished ("Cannot log
 * after tests are done"). A test whose result depends on a background process is worse than no test.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

declare const global: {fetch: unknown};

const fakeSession = {
  vault_details: {
    vault_type: 'hyperswitch',
    /* base64 of "payment_method_session_id=pms_EXAMPLE_FAKE" — obviously fake, never a real one. */
    vault_data: {
      sdk_authorization: 'cGF5bWVudF9tZXRob2Rfc2Vzc2lvbl9pZD1wbXNfRVhBTVBMRV9GQUtF',
    },
  },
};

test('renders correctly', async () => {
  global.fetch = jest.fn(async () => ({json: async () => fakeSession}));

  let tree!: ReturnType<typeof ReactTestRenderer.create>;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });

  /* Unmount inside act() so nothing is left in flight once the test ends. */
  await ReactTestRenderer.act(() => {
    tree.unmount();
  });
});
