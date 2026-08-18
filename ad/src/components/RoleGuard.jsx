import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Box, CircularProgress } from '@mui/material';
import { usePermissions } from '../context/usepermissions';

const RoleGuard = ({ children, requiredPermission, adminOnly = false }) => {
  const { isLoading, can, canAny, isAdminOrSuperadmin, profile } = usePermissions();
  const navigate = useNavigate();
  const [decided, setDecided] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (!profile) {
      toast.error('Vui lòng đăng nhập để tiếp tục!');
      navigate('/login');
      setDecided(true);
      return;
    }

    if (adminOnly) {
      if (isAdminOrSuperadmin) {
        setAllowed(true);
      } else {
        toast.error('Bạn không có quyền truy cập trang này!');
        navigate('/product');
      }
      setDecided(true);
      return;
    }

    if (requiredPermission) {
      const hasAccess = Array.isArray(requiredPermission)
        ? canAny(requiredPermission)
        : can(requiredPermission);

      if (hasAccess) {
        setAllowed(true);
      } else {
        toast.error('Bạn không có quyền truy cập trang này!');
        navigate('/product');
      }
      setDecided(true);
      return;
    }

    setAllowed(true);
    setDecided(true);
  }, [isLoading, profile, adminOnly, requiredPermission, isAdminOrSuperadmin, can, canAny, navigate]);

  if (isLoading || !decided) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return allowed ? children : null;
};

export default RoleGuard;
