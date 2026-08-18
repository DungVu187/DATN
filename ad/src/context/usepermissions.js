import { useContext } from "react";
import PermissionContext from "./permissioncontext-core";

export const usePermissions = () => {
  const context = useContext(PermissionContext);
  if (context === null) {
    throw new Error("usePermissions must be used within PermissionProvider");
  }
  return context;
};
