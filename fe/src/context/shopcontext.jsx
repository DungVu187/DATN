import React, { createContext, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { apiFetch, getAuthFailure } from "../api/httpClient";
import { text } from "../constants/customerText.js";
import { trackCustomerBehavior } from "../utils/customerBehaviorTracker";

export const ShopContext = createContext(null);

const ShopContextProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);

  // Hàm gửi yêu cầu API với cookie
  const sendRequest = async (path, method, body = null) => {
    try {
      const response = await apiFetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : null,
      });
      if (!response.ok) {
        if (getAuthFailure(response) === "unauthorized") {
          toast.error(text("login_required_action"));
          setTimeout(() => {
            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          }, 1000);
          throw new Error("Unauthorized");
        }
        // Lỗi nghiệp vụ (vượt tồn kho, số lượng sai...) thì hiện đúng thông báo backend trả về
        const errorData = await response.json().catch(() => ({}));
        const requestError = new Error("Failed to update cart");
        requestError.userMessage = typeof errorData?.message === "string" ? errorData.message : "";
        throw requestError;
      }
      const data = await response.json();
      setCartItems(data.cart || []);
      return data;
    } catch (error) {
      console.error(`Error with ${path}:`, error);
      if (error.message !== "Unauthorized") {
        toast.error(error.userMessage || text("generic_error_retry"));
      }
      throw error;
    }
  };

  // Lấy giỏ hàng từ server
  const fetchCart = async () => {
    try {
      const response = await apiFetch("/carts/getCart", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setCartItems(data.cart || []);
      } else if (getAuthFailure(response) === "unauthorized") {
        setCartItems([]);
        // Không hiển thị lỗi ở đây để tránh thông báo khi chưa đăng nhập
      } else {
        throw new Error("Failed to fetch cart");
      }
    } catch (error) {
      console.error("Error fetching cart from server:", error);
    }
  };

  // Lấy giỏ hàng từ server khi load ứng dụng
  useEffect(() => {
    fetchCart();
  }, []);

  // Thêm sản phẩm vào giỏ hàng
  const addToCart = async (productId, variantIndex, quantity = 1) => {
    const sanitizedQuantity = Math.max(1, parseInt(quantity, 10) || 1);
    try {
      await sendRequest("/carts/addToCart", "POST", {
        productId,
        variantIndex,
        quantity: sanitizedQuantity,
      });
      trackCustomerBehavior({ eventType: "add_to_cart", productId });
      toast.success(text("add_cart_success"));
    } catch (error) {
      // Lỗi đã được xử lý trong sendRequest
    }
  };

  // Xóa sản phẩm khỏi giỏ hàng
  const removeFromCart = async (productId, variantIndex) => {
    try {
      await sendRequest("/carts/removeFromCart", "POST", {
        productId,
        variantIndex,
      });
    } catch (error) {
      // Lỗi đã được xử lý trong sendRequest
    }
  };

  // Cập nhật số lượng sản phẩm trong giỏ hàng
  const updateCartItem = async (productId, variantIndex, quantity) => {
    try {
      await sendRequest("/carts/updateCartItem", "PUT", {
        productId,
        variantIndex,
        quantity,
      });
    } catch (error) {
      // Lỗi đã được xử lý trong sendRequest
    }
  };

  // Cập nhật trạng thái của sản phẩm
  const updateCartItemStatus = async (productId, variantIndex, status) => {
    try {
      await sendRequest("/carts/updateStatus", "PUT", {
        productId,
        variantIndex,
        status,
      });
      toast.success(text("cart_status_updated"));
    } catch (error) {
      // Lỗi đã được xử lý trong sendRequest
    }
  };

  // Xóa toàn bộ giỏ hàng
  const clearCart = async () => {
    try {
      await sendRequest("/carts/clearCart", "POST");
      toast.success(text("cart_cleared"));
    } catch (error) {
      // Lỗi đã được xử lý trong sendRequest
    }
  };

  const getCartItemCount = () => cartItems.length;

  return (
    <ShopContext.Provider
      value={{
        cartItems,
        fetchCart,
        addToCart,
        removeFromCart,
        updateCartItem,
        updateCartItemStatus,
        getCartItemCount,
        clearCart,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
};

export default ShopContextProvider;
