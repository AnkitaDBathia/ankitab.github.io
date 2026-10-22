import { createClient } from "@supabase/supabase-js";
import { guestMode } from "./mode.js";
const { supabaseUrl: url, supabasePublishableKey: key } =
  window.MY_JOURNEY_CONFIG ?? {};
export const supabase =
  !guestMode && url && key && !url.includes("YOUR_PROJECT")
    ? createClient(url, key)
    : null;
