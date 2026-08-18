export const ALL_ORDER_FILTER = "Tất cả";

const ORDER_STATUSES = new Set(["Processing", "Delivering", "Completed"]);

export const getOrderNavigationFilterPatch = (navigationState) => {
  if (navigationState?.orderId) {
    return { id: navigationState.orderId };
  }

  if (navigationState?.statusFilter === "Cancelled") {
    return {
      id: "",
      status: ALL_ORDER_FILTER,
      state: "Cancelled",
    };
  }

  if (ORDER_STATUSES.has(navigationState?.statusFilter)) {
    return {
      id: "",
      status: navigationState.statusFilter,
      state: "Processing",
    };
  }

  return null;
};

export const createInitialOrderFilters = (navigationState) => ({
  status: ALL_ORDER_FILTER,
  payment: ALL_ORDER_FILTER,
  state: "Processing",
  phone: "",
  name: "",
  id: "",
  startDate: "",
  endDate: "",
  ...getOrderNavigationFilterPatch(navigationState),
});
