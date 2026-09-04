import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AddRounded,
  ArrowBackRounded,
  CheckCircleRounded,
  DeleteOutlineRounded,
  LocalShippingOutlined,
  LocationOnOutlined,
  LockOutlined,
  PaymentsOutlined,
  RadioButtonCheckedRounded,
  RadioButtonUncheckedRounded,
  RemoveRounded,
  ShoppingBagOutlined,
} from "@mui/icons-material";
import {
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
} from "@mui/material";
import toast from "react-hot-toast";
import { ShopContext } from "../context/shopcontext";
import { getCustomerProfile } from "../api/customerAccountApi";
import { createCustomerOrder } from "../api/customerOrderApi";
import {
  getStorefrontProduct,
  resolveStorefrontAssetUrl,
} from "../api/storefrontCatalogApi";
import { isContactOnlyVariant } from "../utils/productpricing";
import { trackCustomerBehavior } from "../utils/customerBehaviorTracker";
import "./styles/cart.css";

const formatMoney = (value) => new Intl.NumberFormat("vi-VN").format(Number(value) || 0) + " đ";

const formatAddress = (address) => [
  address?.addressLine,
  address?.wardName,
  address?.provinceName,
].filter(Boolean).join(", ") || address?.addressDetail || "";

const variantAttributes = (variant) => [
  variant?.color,
  variant?.shape,
  variant?.frame,
  variant?.buttonCount,
].filter(Boolean).join(" · ");

function Cart() {
  const navigate = useNavigate();
  const {
    cartItems,
    fetchCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    updateCartItemStatus,
  } = useContext(ShopContext);
  const [products, setProducts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [checkoutNote, setCheckoutNote] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [openAddressDialog, setOpenAddressDialog] = useState(false);
  const [openClearDialog, setOpenClearDialog] = useState(false);

  useEffect(() => {
    let active = true;

    const loadCheckoutData = async () => {
      setLoading(true);
      try {
        const profileResponse = await getCustomerProfile();
        if (!profileResponse.ok) {
          if (active) setIsLoggedIn(false);
          return;
        }

        const user = await profileResponse.json();
        if (!active) return;
        setProfile(user);
        setIsLoggedIn(true);
        const defaultAddress = user.addresses?.find((address) => address.isDefault) || user.addresses?.[0];
        setSelectedAddressId(defaultAddress?._id || "");
      } catch (error) {
        console.error("Could not load checkout profile:", error);
        if (active) setIsLoggedIn(false);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCheckoutData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      const productIds = [...new Set(cartItems.map((item) => item.productId).filter(Boolean))];
      if (productIds.length === 0) {
        if (active) setProducts([]);
        return;
      }

      const responses = await Promise.all(productIds.map(async (productId) => {
        try {
          const response = await getStorefrontProduct(productId);
          return response.ok ? response.json() : null;
        } catch {
          return null;
        }
      }));
      if (active) setProducts(responses.filter(Boolean));
    };

    loadProducts();
    return () => {
      active = false;
    };
  }, [cartItems]);

  const cartRows = useMemo(() => cartItems.map((item) => {
    const product = products.find((candidate) => candidate._id === item.productId);
    const variant = product?.variant?.[item.variantIndex];
    return {
      item,
      product,
      variant,
      available: item.available !== false && Boolean(product && variant),
      contactOnly: Boolean(variant && isContactOnlyVariant(variant)),
    };
  }), [cartItems, products]);

  const purchasableRows = cartRows.filter((row) => row.available && !row.contactOnly);
  const selectedRows = purchasableRows.filter((row) => row.item.status);
  const totalPrice = selectedRows.reduce(
    (total, row) => total + Number(row.variant?.price || 0) * Number(row.item.quantity || 0),
    0,
  );
  const selectedAddress = profile?.addresses?.find((address) => address._id === selectedAddressId);
  const allPurchasableSelected = purchasableRows.length > 0 && selectedRows.length === purchasableRows.length;

  const toggleSelectAll = () => {
    purchasableRows.forEach(({ item }) => {
      if (item.status !== !allPurchasableSelected) {
        updateCartItemStatus(item.productId, item.variantIndex, !allPurchasableSelected);
      }
    });
  };

  const handleQuantity = (row, nextQuantity) => {
    const safeQuantity = Math.max(1, Math.min(Number(nextQuantity) || 1, Number(row.variant?.quantityForSale || 1)));
    updateCartItem(row.item.productId, row.item.variantIndex, safeQuantity);
  };

  const handleCheckout = async () => {
    if (isCreatingOrder) return;
    if (!isLoggedIn) {
      toast.error("Vui lòng đăng nhập để đặt hàng.");
      navigate(`/login?redirect=${encodeURIComponent("/cart")}`);
      return;
    }
    if (selectedRows.length === 0) {
      toast.error("Hãy chọn ít nhất một sản phẩm có thể thanh toán.");
      return;
    }
    if (!selectedAddress) {
      toast.error("Vui lòng chọn địa chỉ nhận hàng.");
      setOpenAddressDialog(true);
      return;
    }
    trackCustomerBehavior({ eventType: "start_checkout", path: "/cart" });

    setIsCreatingOrder(true);
    try {
      const response = await createCustomerOrder({
        cartItems: selectedRows.map(({ item }) => ({
          productId: item.productId,
          variantIndex: item.variantIndex,
          quantity: item.quantity,
        })),
        addressId: selectedAddress._id,
        checkoutNote,
        paymentMethod,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể tạo đơn hàng.");

      await fetchCart();
      if (paymentMethod === "SEPAY") {
        navigate(`/payment/sepay/${data.order._id}`);
        return;
      }

      toast.success("Đơn hàng COD đã được tạo thành công.");
      navigate("/myorder");
    } catch (error) {
      toast.error(error.message || "Không thể tạo đơn hàng.");
    } finally {
      setIsCreatingOrder(false);
    }
  };

  if (loading) {
    return <div className="checkout-loading"><CircularProgress size={34} /><span>Đang chuẩn bị phiên thanh toán…</span></div>;
  }

  return (
    <main className="cart-checkout-page">
      <div className="checkout-shell">
        <button className="checkout-back" type="button" onClick={() => navigate("/product")}>
          <ArrowBackRounded /> Tiếp tục mua sắm
        </button>

        <header className="checkout-heading">
          <div>
            <p className="checkout-eyebrow">NOVA INDUSTRIAL COMMERCE</p>
            <h1>Hoàn tất đơn hàng</h1>
            <p>Kiểm tra sản phẩm, chọn nơi nhận và phương thức thanh toán phù hợp.</p>
          </div>
          <div className="checkout-count"><ShoppingBagOutlined /><strong>{cartItems.length}</strong><span>sản phẩm trong giỏ</span></div>
        </header>

        <div className="checkout-grid">
          <div className="checkout-main-column">
            <section className="checkout-panel cart-products-panel">
              <div className="checkout-panel-header">
                <div>
                  <span className="checkout-section-index">01</span>
                  <h2>Sản phẩm đã chọn</h2>
                  <p>{selectedRows.length} sản phẩm sẽ được đưa vào đơn hàng.</p>
                </div>
                <label className="cart-select-all">
                  <Checkbox checked={allPurchasableSelected} indeterminate={selectedRows.length > 0 && !allPurchasableSelected} onChange={toggleSelectAll} />
                  Chọn tất cả
                </label>
              </div>

              {cartRows.length === 0 ? (
                <div className="cart-empty-state">
                  <ShoppingBagOutlined />
                  <h3>Giỏ hàng đang trống</h3>
                  <p>Khám phá thiết bị phù hợp cho hệ thống của bạn.</p>
                  <Button variant="contained" onClick={() => navigate("/product")}>Xem sản phẩm</Button>
                </div>
              ) : (
                <div className="checkout-product-list">
                  {cartRows.map((row) => {
                    const { item, product, variant, available, contactOnly } = row;
                    const disabled = !available || contactOnly;
                    const imageUrl = resolveStorefrontAssetUrl(variant?.imgUrl || "");
                    return (
                      <article className={`checkout-product-row${disabled ? " is-muted" : ""}`} key={`${item.productId}-${item.variantIndex}`}>
                        <Checkbox checked={Boolean(item.status) && !disabled} disabled={disabled} onChange={(event) => updateCartItemStatus(item.productId, item.variantIndex, event.target.checked)} />
                        <div className="checkout-product-image">
                          {imageUrl ? <img src={imageUrl} alt={product?.name || "Sản phẩm"} /> : <ShoppingBagOutlined />}
                        </div>
                        <div className="checkout-product-info">
                          <div className="checkout-product-title-row">
                            <h3>{product?.name || "Sản phẩm không còn khả dụng"}</h3>
                            {contactOnly && <span className="checkout-product-tag">Cần báo giá</span>}
                            {!available && <span className="checkout-product-tag is-warning">Tạm hết hàng</span>}
                          </div>
                          <p>{[product?.code, variantAttributes(variant)].filter(Boolean).join(" · ") || "Đang cập nhật thông tin"}</p>
                          <strong>{contactOnly ? "Liên hệ để báo giá" : formatMoney(variant?.price)}</strong>
                        </div>
                        <div className="checkout-quantity" aria-label="Số lượng">
                          <IconButton size="small" disabled={disabled || item.quantity <= 1} onClick={() => handleQuantity(row, item.quantity - 1)}><RemoveRounded /></IconButton>
                          <span>{item.quantity}</span>
                          <IconButton size="small" disabled={disabled || item.quantity >= Number(variant?.quantityForSale || 0)} onClick={() => handleQuantity(row, item.quantity + 1)}><AddRounded /></IconButton>
                        </div>
                        <div className="checkout-row-total">{contactOnly ? "—" : formatMoney(Number(variant?.price || 0) * item.quantity)}</div>
                        <IconButton className="checkout-delete-button" aria-label="Xóa sản phẩm" onClick={() => removeFromCart(item.productId, item.variantIndex)}><DeleteOutlineRounded /></IconButton>
                      </article>
                    );
                  })}
                </div>
              )}

              {cartItems.length > 0 && <button className="clear-cart-link" type="button" onClick={() => setOpenClearDialog(true)}>Xóa toàn bộ giỏ hàng</button>}
            </section>

            <section className="checkout-panel">
              <div className="checkout-panel-header">
                <div>
                  <span className="checkout-section-index">02</span>
                  <h2>Địa chỉ nhận hàng</h2>
                  <p>Thông tin này được lưu cùng đơn hàng để xử lý giao nhận.</p>
                </div>
                <Button variant="text" onClick={() => setOpenAddressDialog(true)}>Thay đổi</Button>
              </div>

              {selectedAddress ? (
                <div className="shipping-address-card">
                  <div className="shipping-address-icon"><LocationOnOutlined /></div>
                  <div>
                    <div className="shipping-address-name"><strong>{selectedAddress.receiverName}</strong><span>{selectedAddress.receiverPhone}</span>{selectedAddress.isDefault && <em>Mặc định</em>}</div>
                    <p>{formatAddress(selectedAddress)}</p>
                  </div>
                </div>
              ) : (
                <button type="button" className="shipping-address-empty" onClick={() => setOpenAddressDialog(true)}>
                  <LocationOnOutlined /><span><strong>Chọn địa chỉ nhận hàng</strong><small>Bạn cần chọn địa chỉ trước khi đặt đơn.</small></span>
                </button>
              )}
            </section>

            <section className="checkout-panel">
              <div className="checkout-panel-header">
                <div>
                  <span className="checkout-section-index">03</span>
                  <h2>Phương thức thanh toán</h2>
                  <p>Chọn phương thức thanh toán thuận tiện cho đơn hàng.</p>
                </div>
              </div>
              <div className="payment-method-list">
                <button className={`payment-method-card${paymentMethod === "COD" ? " is-selected" : ""}`} type="button" onClick={() => setPaymentMethod("COD")}>
                  {paymentMethod === "COD" ? <RadioButtonCheckedRounded /> : <RadioButtonUncheckedRounded />}
                  <span className="payment-method-icon"><LocalShippingOutlined /></span>
                  <span><strong>Thanh toán khi nhận hàng</strong><small>Thanh toán cho đơn vị vận chuyển sau khi nhận hàng.</small></span>
                </button>
                <button className={`payment-method-card${paymentMethod === "SEPAY" ? " is-selected" : ""}`} type="button" onClick={() => setPaymentMethod("SEPAY")}>
                  {paymentMethod === "SEPAY" ? <RadioButtonCheckedRounded /> : <RadioButtonUncheckedRounded />}
                  <span className="payment-method-icon is-sepay"><PaymentsOutlined /></span>
                  <span><strong>Chuyển khoản qua SePay</strong><small>Quét VietQR và đơn tự xác nhận ngay khi tiền vào tài khoản.</small></span>
                </button>
              </div>
              <div className="checkout-note-field">
                <label htmlFor="checkout-note">Ghi chú cho đơn hàng</label>
                <TextField id="checkout-note" className="checkout-note" value={checkoutNote} onChange={(event) => setCheckoutNote(event.target.value)} placeholder="Ví dụ: Gọi trước khi giao hàng, thời gian nhận hàng…" multiline minRows={2} inputProps={{ maxLength: 500 }} fullWidth />
              </div>
            </section>
          </div>

          <aside className="checkout-summary-panel">
            <div className="checkout-summary-topline"><span>TÓM TẮT ĐƠN HÀNG</span><LockOutlined /></div>
            <div className="checkout-summary-lines">
              <div><span>Tạm tính</span><strong>{formatMoney(totalPrice)}</strong></div>
              <div><span>Phí vận chuyển</span><strong className="is-neutral">Sẽ xác nhận sau</strong></div>
            </div>
            <div className="checkout-summary-total"><span>Tổng thanh toán</span><strong>{formatMoney(totalPrice)}</strong></div>
            <div className="checkout-summary-method"><span>Phương thức</span><strong>{paymentMethod === "SEPAY" ? "SePay VietQR" : "Thanh toán khi nhận hàng"}</strong></div>
            <Button className="checkout-submit" variant="contained" size="large" onClick={handleCheckout} disabled={isCreatingOrder || selectedRows.length === 0}>
              {isCreatingOrder ? "Đang tạo đơn…" : paymentMethod === "SEPAY" ? "Tiếp tục thanh toán" : "Đặt hàng COD"}
            </Button>
            <div className="checkout-trust-line"><CheckCircleRounded /> <span>{paymentMethod === "SEPAY" ? "Tự động xác nhận khi nhận đúng số tiền." : "Xác nhận đơn hàng trong thời gian sớm nhất."}</span></div>
          </aside>
        </div>
      </div>

      <Dialog open={openAddressDialog} onClose={() => setOpenAddressDialog(false)} fullWidth maxWidth="sm" className="checkout-address-dialog">
        <DialogTitle>Chọn địa chỉ nhận hàng</DialogTitle>
        <DialogContent>
          <div className="checkout-address-list">
            {profile?.addresses?.length ? profile.addresses.map((address) => (
              <button key={address._id} type="button" onClick={() => { setSelectedAddressId(address._id); setOpenAddressDialog(false); }} className={`checkout-address-option${selectedAddressId === address._id ? " is-selected" : ""}`}>
                {selectedAddressId === address._id ? <RadioButtonCheckedRounded /> : <RadioButtonUncheckedRounded />}
                <span><strong>{address.receiverName} · {address.receiverPhone}</strong><small>{formatAddress(address)}</small>{address.isDefault && <em>Địa chỉ mặc định</em>}</span>
              </button>
            )) : <div className="checkout-address-no-data">Bạn chưa lưu địa chỉ nhận hàng.</div>}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => navigate("/profile?section=addresses")}>Quản lý địa chỉ</Button>
          <Button variant="contained" onClick={() => setOpenAddressDialog(false)}>Xong</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openClearDialog} onClose={() => setOpenClearDialog(false)} className="checkout-clear-dialog">
        <DialogTitle>
          <div className="clear-dialog-title">
            <span className="clear-dialog-icon"><DeleteOutlineRounded /></span>
            <span><strong>Xóa toàn bộ giỏ hàng?</strong><small>Thao tác này không thể hoàn tác</small></span>
          </div>
        </DialogTitle>
        <DialogContent>Bạn sẽ cần thêm lại các sản phẩm nếu muốn đặt hàng sau đó.</DialogContent>
        <DialogActions>
          <Button className="clear-dialog-keep" onClick={() => setOpenClearDialog(false)}>Giữ lại</Button>
          <Button className="clear-dialog-delete" color="error" variant="contained" onClick={() => { clearCart(); setOpenClearDialog(false); }}>Xóa giỏ hàng</Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}

export default Cart;
