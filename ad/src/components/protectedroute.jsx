import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Box, CircularProgress } from '@mui/material';
import { getAdminProfile } from '../api/adminAuthApi';
import { getSafeCustomerReturnPath } from './adminroute.utils';

const redirectCustomerToStorefront = (path) => window.location.replace(path);

const ProtectedRoute = ({
  children,
  redirectTo = '/login',
  onCustomerRedirect = redirectCustomerToStorefront,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkAuthAndRole = async () => {
      try {
        const response = await getAdminProfile();

        if (response.ok) {
          const profile = await response.json();

          if (profile?.role === 'customer') {
            setIsAuthenticated(false);
            onCustomerRedirect(getSafeCustomerReturnPath());
            return;
          }

          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          if (location.pathname !== redirectTo) {
            toast.error('Vui lòng đăng nhập để tiếp tục!');
            navigate(redirectTo, { state: { from: location } });
          }
        }
      } catch (error) {
        console.error('Lỗi khi kiểm tra xác thực:', error);
        setIsAuthenticated(false);
        if (location.pathname !== redirectTo) {
          toast.error('Không thể xác thực. Vui lòng thử lại!');
          navigate(redirectTo, { state: { from: location } });
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthAndRole();
  }, [navigate, location, redirectTo, onCustomerRedirect]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return isAuthenticated ? children : null;
};

export default ProtectedRoute;
