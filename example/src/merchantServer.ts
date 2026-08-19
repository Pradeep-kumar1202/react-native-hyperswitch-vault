import {Platform} from 'react-native';
import type {MerchantSession} from '@juspay-tech/react-native-hyperswitch-vault';

/*
 * The merchant server — see `example-server/`. This app holds no API key and no .env: the only
 * thing it ever receives is the client-safe session response.
 *
 * Must match PORT in example-server/.env (default 3001).
 */
export const MERCHANT_SERVER_PORT = 3001;

/*
 * Physical Android device? An emulator reaches the host machine on 10.0.2.2, but a real handset
 * does not — set this to your machine's LAN address for the run, e.g.
 *
 *   export const LAN_OVERRIDE = 'http://192.168.1.20:3001';
 *
 * (`ipconfig getifaddr en0` on macOS.) Both devices must be on the same network. Leave it null
 * otherwise; it exists so a device run needs no secret-bearing React Native .env.
 */
export const LAN_OVERRIDE: string | null = null;

export const MERCHANT_BACKEND =
  LAN_OVERRIDE ??
  (Platform.OS === 'android'
    ? `http://10.0.2.2:${MERCHANT_SERVER_PORT}`
    : `http://localhost:${MERCHANT_SERVER_PORT}`);

/**
 * Asks the merchant's own backend for a vault session.
 *
 * This is the ONLY network call the app makes itself. The secret API key stays on the server; what
 * comes back is the client-safe session response, which is handed to <HyperswitchVaultForm/>
 * untouched.
 */
export async function fetchMerchantSession(): Promise<MerchantSession> {
  const response = await fetch(`${MERCHANT_BACKEND}/vault-session`);
  if (!response.ok) {
    /*
     * The server reached Hyperswitch and was refused. Its body carries no detail on purpose — the
     * server logs the HTTP status and nothing else.
     */
    throw new Error(
      `The store could not start checkout (HTTP ${response.status}). Check the merchant server log.`,
    );
  }
  return response.json();
}
