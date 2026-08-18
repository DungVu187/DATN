import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { rememberCustomerPath } from './customerroutehistory.utils';

const CustomerRouteHistory = () => {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    rememberCustomerPath({ pathname, search, hash });
  }, [pathname, search, hash]);

  return null;
};

export default CustomerRouteHistory;
