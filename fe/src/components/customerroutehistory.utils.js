export const LAST_CUSTOMER_PATH_KEY = 'NOVA:lastCustomerPath';

export const rememberCustomerPath = (
  { pathname, search = '', hash = '' },
  storage = window.sessionStorage,
) => {
  if (
    !pathname ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/')
  ) {
    return false;
  }

  storage.setItem(
    LAST_CUSTOMER_PATH_KEY,
    `${pathname}${search}${hash}`,
  );
  return true;
};
