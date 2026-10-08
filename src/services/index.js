// Picks the backend ONCE, explicitly:
//   1. Supabase env vars present            -> live database (the only source of truth)
//   2. VITE_DEMO_MODE=true (explicit opt-in) -> in-memory demo station, loudly labelled
//   3. otherwise                             -> "not connected" state; NO sample data is shown
// There is deliberately no silent fallback to demo data.
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { createSupabaseInventory } from './inventoryService';
import { createDemoInventory } from './demoInventoryService';
import { createUnconfiguredInventory } from './unconfiguredInventoryService';

const demoRequested = import.meta.env.VITE_DEMO_MODE === 'true';

export const inventoryApi = isSupabaseConfigured
  ? createSupabaseInventory(supabase)
  : demoRequested ? createDemoInventory() : createUnconfiguredInventory();
export { isSupabaseConfigured };
export { payrollApi } from './payrollService';

