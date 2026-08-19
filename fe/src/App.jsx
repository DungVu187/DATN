import './App.css';
import Navbar from './layout/navbar/navbar.jsx';
import Footer from './layout/footer/footer.jsx';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/dashboard.jsx';
import Product from './pages/product.jsx';
import Cart from './pages/cart.jsx';
import LogIn from './pages/login.jsx';
import { Toaster } from 'react-hot-toast';
import ProductDisplay from './components/productdisplay.jsx';
import ShopContextProvider from './context/shopcontext.jsx';
import MyOrder from './pages/myorder.jsx';
import ScrollRestoration from './components/scrollrestoration.jsx';
import Intro from './pages/intro.jsx';
import Policy from './pages/policy.jsx';
import ValueList from './pages/valuelist.jsx';
import ChangePassword from './pages/changepassword.jsx';
import Profile from './pages/profile.jsx';
import CustomerRouteHistory from './components/customerroutehistory.jsx';
import MobileBottomNav from './layout/mobilebottomnav/mobilebottomnav.jsx';


function App() {
  return (
    <ShopContextProvider>
      <BrowserRouter>
        <CustomerRouteHistory />
        <Navbar />
        <div className="main-content">
          <ScrollRestoration>
            <div className="page-container">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/product" element={<Product />} />
                <Route path="/product/:productId" element={<ProductDisplay />} />
                <Route path="/login" element={<LogIn />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/myorder" element={<MyOrder />} />
                <Route path="/introduction" element={<Intro />} />
                <Route path="/policy" element={<Policy />} />
                <Route path="/policy/:policyKey" element={<Policy />} />
                <Route path="/section/:sectionName" element={<ValueList />} />
                <Route path="/change-password" element={<ChangePassword />} />
                <Route path="/profile" element={<Profile />} />
              </Routes>
            </div>
            <Footer />
          </ScrollRestoration>
        </div>

        <MobileBottomNav />
        <Toaster position="top-center" />
      </BrowserRouter>
    </ShopContextProvider>
  );
}

export default App;
