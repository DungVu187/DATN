import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import Sidebar from './layout/sidebar';
import Products from './components/products';
import Chips from './components/chips';
import ProductDisplay from './components/productdisplay';
import Orders from './components/orders';
import SalesOrderDetail from './components/order/orderdetail';
import Login from './components/login';
import ProtectedRoute from './components/protectedroute';
import RoleGuard from './components/RoleGuard';
import Manage from './components/manage';
import PolicyManagement from './components/policymanagement';
import SectionDisplay from './components/sectiondisplay';
import SoldProducts from './components/soldproducts';
import IpOrders from './components/iporder/iporders';
import ImportOrderDetail from './components/iporder/iporderdetail';
import IpOrderTemplate from './components/iporder/ipordertemplate';
import OrderedProducts from './components/iporder/orderedproducts';
import EpOrders from './components/eporder/eporders';
import ExportOrderDetail from './components/eporder/eporderdetail';
import ExportedProducts from './components/eporder/exportedproducts';
import Account from './components/account';
import Customers from './components/customers';
import { HistoryExport, HistoryImport } from './components/history';
import ActivityLog from './components/activitylog';
import { PermissionProvider } from './context/permissioncontext';

const App = () => {
  return (
    <PermissionProvider>
      <Router basename="/admin">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Box sx={{ display: 'flex', width: "100%", height: "100dvh", overflow: "hidden", bgcolor: 'background.default' }}>
                  <Sidebar />
                  <Box component="main" className="admin-content-wrapper" sx={{ flex: 1, height: "100%", overflowY: "auto", p: { xs: 1.5, sm: 2 }, pt: { xs: '68px', md: 2 }, minWidth: 0 }}>
                    <Routes>
                      <Route index element={<Navigate to="/product" replace />} />
                      <Route path="/account" element={<RoleGuard adminOnly><Account /></RoleGuard>} />
                      <Route path="/product" element={<RoleGuard requiredPermission="product.view"><Products /></RoleGuard>} />
                      <Route path="/chip" element={<RoleGuard requiredPermission="product.view"><Chips /></RoleGuard>} />
                      <Route path="/cluster" element={<RoleGuard requiredPermission="product.view"><Chips onlySection={true} /></RoleGuard>} />
                      <Route path="/product/:productId" element={<RoleGuard requiredPermission="product.view"><ProductDisplay /></RoleGuard>} />
                      <Route path="/order" element={<RoleGuard requiredPermission="order.view"><Orders /></RoleGuard>} />
                      <Route path="/salesorder/:id" element={<RoleGuard requiredPermission="order.view"><SalesOrderDetail /></RoleGuard>} />
                      <Route path="/manage" element={<RoleGuard requiredPermission="storefront.manage"><Manage /></RoleGuard>} />
                      <Route path="/policies" element={<RoleGuard requiredPermission="storefront.manage"><PolicyManagement /></RoleGuard>} />
                      <Route path="/sectiondisplay" element={<RoleGuard requiredPermission="storefront.manage"><SectionDisplay /></RoleGuard>} />
                      <Route path="/soldproducts" element={<RoleGuard requiredPermission="order.view"><SoldProducts /></RoleGuard>} />
                      <Route path="/orderedproducts" element={<RoleGuard requiredPermission="iporder.view"><OrderedProducts /></RoleGuard>} />
                      <Route path="/importorder" element={<RoleGuard requiredPermission="iporder.view"><IpOrders /></RoleGuard>} />
                      <Route path="/importorder/:id" element={<RoleGuard requiredPermission="iporder.view"><ImportOrderDetail /></RoleGuard>} />
                      <Route path="/exportedproducts" element={<RoleGuard requiredPermission="eporder.view"><ExportedProducts /></RoleGuard>} />
                      <Route path="/exportorder" element={<RoleGuard requiredPermission="eporder.view"><EpOrders /></RoleGuard>} />
                      <Route path="/exportorder/:id" element={<RoleGuard requiredPermission="eporder.view"><ExportOrderDetail /></RoleGuard>} />
                      <Route path="/importordertemplate/:index" element={<RoleGuard requiredPermission="iporder.view"><IpOrderTemplate /></RoleGuard>} />
                      <Route path="/exportordertemplate/:index" element={<RoleGuard requiredPermission="eporder.view"><IpOrderTemplate /></RoleGuard>} />
                      <Route path="/customers" element={<RoleGuard requiredPermission="customer.view"><Customers /></RoleGuard>} />
                      <Route path="/history/import" element={<RoleGuard requiredPermission="history_import.view"><HistoryImport /></RoleGuard>} />
                      <Route path="/history/export" element={<RoleGuard requiredPermission="history_export.view"><HistoryExport /></RoleGuard>} />
                      <Route path="/activity-log" element={<RoleGuard requiredPermission="activitylog.view"><ActivityLog /></RoleGuard>} />
                      <Route path="*" element={<Navigate to="/product" replace />} />
                    </Routes>
                  </Box>
                </Box>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </PermissionProvider>
  );
};

export default App;
