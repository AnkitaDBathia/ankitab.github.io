// Temporary default. Set guestMode: false in config.js to require Supabase login again.
export const guestMode = globalThis.MY_JOURNEY_CONFIG?.guestMode !== false;
