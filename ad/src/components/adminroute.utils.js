export const LAST_CUSTOMER_PATH_KEY = 'NOVA:lastCustomerPath';

export const getSafeCustomerReturnPath = (
  storage = window.sessionStorage,
) => {
  try {
    const savedPath = storage.getItem(LAST_CUSTOMER_PATH_KEY);
    if (!savedPath || !savedPath.startsWith('/') || savedPath.startsWith('//')) {
      return '/';
    }

    const parsed = new URL(savedPath, window.location.origin);
    if (
      parsed.origin !== window.location.origin ||
      parsed.pathname === '/admin' ||
      parsed.pathname.startsWith('/admin/')
    ) {
      return '/';
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
};
