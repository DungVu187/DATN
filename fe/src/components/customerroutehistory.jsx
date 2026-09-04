import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { rememberCustomerPath } from './customerroutehistory.utils';
import { trackCustomerBehavior } from '../utils/customerBehaviorTracker';

const CustomerRouteHistory = () => {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    rememberCustomerPath({ pathname, search, hash });
    const productMatch = pathname.match(/^\/product\/([^/]+)$/);
    if (productMatch) {
      trackCustomerBehavior({
        eventType: 'view_product',
        productId: productMatch[1],
        path: pathname + search + hash,
      });
    }
  }, [pathname, search, hash]);

  return null;
};

export default CustomerRouteHistory;
