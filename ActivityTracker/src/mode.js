// Cloud storage is the default. Guest mode must be explicitly enabled for local testing.
export function isGuestMode(config) {
  return config?.guestMode === true;
}
export const guestMode = isGuestMode(globalThis.MY_JOURNEY_CONFIG);
