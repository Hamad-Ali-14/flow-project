import { useEffect, useMemo, useState } from 'react';
import { useTanks } from './useTanks';
import { buildShiftScope, isOwnerRole } from '../utils/rbac';

// Who is looking, and which shift are they limited to?
//   owner / admin -> { scoped: false }  (ready as soon as the role is known)
//   manager       -> { scoped: true, shiftId, shiftName }  (ready once the profile's shift is loaded)
// While anything is still loading `ready` is false and `scoped` is true, so pages wait instead of
// flashing other shifts' data (fail closed).
export function useViewerScope() {
  const { api, overview } = useTanks();
  const role = overview?.viewer?.role || null;
  const owner = isOwnerRole(role);
  const [profile, setProfile] = useState(null); // { shiftId, shiftName } | null
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!role || owner) return undefined;
    let alive = true;
    setLoaded(false);
    Promise.resolve(api?.getViewerScope ? api.getViewerScope() : null)
      .then((p) => { if (alive) { setProfile(p); setLoaded(true); } })
      .catch(() => { if (alive) { setProfile(null); setLoaded(true); } });
    return () => { alive = false; };
  }, [api, role, owner]);

  return useMemo(() => {
    if (!role) return { ...buildShiftScope({ role: null }), scoped: true, ready: false };
    if (owner) return { ...buildShiftScope({ role }), ready: true };
    return {
      ...buildShiftScope({ role, shiftId: profile?.shiftId, shiftName: profile?.shiftName }),
      ready: loaded,
    };
  }, [role, owner, profile, loaded]);
}
