import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getAdminProfile } from "../api/adminAuthApi";
import PermissionContext from "./permissioncontext-core";

export const PermissionProvider = ({ children }) => {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getAdminProfile();
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      } else {
        setProfile(null);
      }
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const role = profile?.role || "";
  const permissions = useMemo(
    () => (Array.isArray(profile?.permissions) ? profile.permissions : []),
    [profile?.permissions],
  );
  const isSuperadmin = role === "superadmin";
  const isAdmin = role === "admin";
  const isAdminOrSuperadmin = isAdmin || isSuperadmin;

  const can = useCallback(
    (permission) => {
      if (!profile) return false;
      if (isSuperadmin) return true;
      if (isAdmin && permission === "account.manage") return true;
      return Array.isArray(profile.permissions) &&
        profile.permissions.includes(permission);
    },
    [profile, isSuperadmin, isAdmin],
  );

  const canAny = useCallback(
    (input) => {
      const list = Array.isArray(input)
        ? input
        : typeof input === "string"
          ? [input]
          : [];
      if (list.length === 0) return false;
      return list.some((p) => can(p));
    },
    [can],
  );

  const canAll = useCallback(
    (input) => {
      const list = Array.isArray(input)
        ? input
        : typeof input === "string"
          ? [input]
          : [];
      if (list.length === 0) return false;
      return list.every((p) => can(p));
    },
    [can],
  );

  const value = useMemo(
    () => ({
      profile,
      isLoading,
      role,
      permissions,
      isSuperadmin,
      isAdmin,
      isAdminOrSuperadmin,
      can,
      canAny,
      canAll,
      refreshProfile,
    }),
    [
      profile,
      isLoading,
      role,
      permissions,
      isSuperadmin,
      isAdmin,
      isAdminOrSuperadmin,
      can,
      canAny,
      canAll,
      refreshProfile,
    ],
  );

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};
