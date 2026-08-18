import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Pagination,
} from "@mui/material";
import {
  ArrowForwardIosRounded,
  ContentCopyRounded,
  Inventory2Outlined,
  ReceiptLongRounded,
} from "@mui/icons-material";
import toast from "react-hot-toast";
import moment from "moment";
import { useLanguage } from "../context/languagecontext.jsx";
import AccountLayout from "../layout/accountlayout/accountlayout.jsx";
import SafeProductImage from "../components/safeproductimage.jsx";
import { getStorefrontProduct } from "../api/storefrontCatalogApi";
import { cancelCustomerOrder, getCustomerOrders } from "../api/customerOrderApi";
import "./styles/myorder.css";

const ordersPerPage = 10;

const formatMoney = (value, locale) => new Intl.NumberFormat(locale).format(Number(value) || 0) + " VND";
const getOrderCode = (order) => order?.orderCode || order?._id || "";

const enrichOrdersWithProducts = async (rawOrders, unavailableProductName) => {
  const productIds = [...new Set(rawOrders.flatMap((order) => (order.cartItems || []).map((item) => item.productId)).filter(Boolean))];
  const products = await Promise.all(productIds.map(async (productId) => {
    try {
      const response = await getStorefrontProduct(productId);
      if (!response.ok) return [productId, null];
      return [productId, await response.json()];
    } catch (error) {
      console.error("Lỗi khi lấy sản phẩm:", error);
      return [productId, null];
    }
  }));
  const productMap = new Map(products);

  return rawOrders.map((order) => ({
    ...order,
    cartItems: (order.cartItems || []).map((item) => {
      const product = productMap.get(item.productId);
      const variants = Array.isArray(product?.variant) ? product.variant : [];
      const variant = variants[item.variantIndex] || {};
      return {
        ...item,
        productName: product?.name || unavailableProductName,
        productBrand: product?.brand || "",
        productImage: variant.imgUrl || product?.imgUrl || "",
        productPrice: variant.price,
        productColor: variant.color,
        productShape: variant.shape,
        productFrame: variant.frame,
        productButtonCount: variant.buttonCount,
      };
    }),
  }));
};

const MyOrder = () => {
  const { t, locale } = useLanguage();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [openCancelDialog, setOpenCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedState, setSelectedState] = useState(() => sessionStorage.getItem("myorder_active_tab") || "");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    setAuthRequired(false);
    try {
      const response = await getCustomerOrders();

      if (response.status === 401) {
        setAuthRequired(true);
        setOrders([]);
        return;
      }
      if (response.status === 404) {
        setOrders([]);
        return;
      }

      const data = await response.json();
      if (!response.ok) throw new Error(t("error_loading_orders", "Không thể tải đơn hàng"));
      setOrders(await enrichOrdersWithProducts(data.orders || [], t("product_no_longer_exists")));
    } catch {
      const message = t("error_loading_orders", "Không thể tải đơn hàng");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!location.state?.autoOpenOrderId || orders.length === 0) return;
    const foundOrder = orders.find((order) => order._id === location.state.autoOpenOrderId);
    if (foundOrder) {
      setSelectedOrder(foundOrder);
      setOpenDialog(true);
      window.history.replaceState(null, "");
    }
  }, [location.state, orders]);

  const matchesState = useCallback((order, state) => {
    if (!state) return true;
    if (state === "Cancelled") return order.state === "Cancelled";
    return order.state !== "Cancelled" && order.status === state;
  }, []);

  const tabs = useMemo(() => [
    { value: "", label: t("all", "Tất cả") },
    { value: "Processing", label: t("state_processing", "Đang xử lý") },
    { value: "Delivering", label: t("delivering", "Đang giao hàng") },
    { value: "Completed", label: t("completed", "Hoàn thành") },
    { value: "Cancelled", label: t("cancelled", "Đã hủy") },
  ], [t]);

  const tabCounts = useMemo(() => Object.fromEntries(tabs.map((tab) => [tab.value, orders.filter((order) => matchesState(order, tab.value)).length])), [matchesState, orders, tabs]);
  const filteredOrders = useMemo(() => orders.filter((order) => matchesState(order, selectedState)), [matchesState, orders, selectedState]);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPerPage));
  const paginatedOrders = useMemo(() => filteredOrders.slice((page - 1) * ordersPerPage, page * ordersPerPage), [filteredOrders, page]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const selectState = (value) => {
    setSelectedState(value);
    setPage(1);
    sessionStorage.setItem("myorder_active_tab", value);
  };

  const getStatus = (order) => {
    if (order?.state === "Cancelled") return { label: t("cancelled", "Đã hủy"), tone: "cancelled" };
    if (order?.status === "Completed") return { label: t("completed", "Hoàn thành"), tone: "completed" };
    if (order?.status === "Delivering") return { label: t("delivering", "Đang giao hàng"), tone: "delivering" };
    return { label: t("state_processing", "Đang xử lý"), tone: "processing" };
  };

  const canCancelOrder = (order) => Boolean(order && order.state !== "Cancelled" && order.status === "Processing");

  const copyOrderCode = async (order) => {
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(getOrderCode(order));
      toast.success(t("copied", "Đã sao chép mã đơn"));
    } catch (copyError) {
      toast.error(t("copy_failed", "Không thể sao chép mã đơn"));
    }
  };

  const openOrderDetails = (order) => {
    setSelectedOrder(order);
    setOpenDialog(true);
  };

  const closeOrderDetails = () => {
    setOpenDialog(false);
    setOpenCancelDialog(false);
  };

  const cancelOrder = async () => {
    if (!selectedOrder?._id || isCancelling) return;
    setIsCancelling(true);
    try {
      const response = await cancelCustomerOrder(selectedOrder._id);
      if (!response.ok) throw new Error(t("cancel_order_failed", "Hủy đơn hàng thất bại"));

      setOrders((currentOrders) => currentOrders.map((order) => order._id === selectedOrder._id ? { ...order, state: "Cancelled" } : order));
      setOpenCancelDialog(false);
      setOpenDialog(false);
      toast.success(t("cancel_order_success", "Hủy đơn hàng thành công"));
    } catch {
      toast.error(t("cancel_order_failed", "Hủy đơn hàng thất bại"));
    } finally {
      setIsCancelling(false);
    }
  };

  const renderProductThumb = (item) => (
    <span className="order-product-thumb">
      {item.productImage ? <SafeProductImage src={item.productImage} alt={item.productName} /> : <Inventory2Outlined />}
    </span>
  );

  const renderProductSummary = (order) => {
    const visibleItems = order.cartItems.slice(0, 1);
    const remainingItems = order.cartItems.length - visibleItems.length;
    return (
      <div className="order-products-summary">
        {visibleItems.map((item, index) => (
          <div className="order-product-line" key={(item.productId || "product") + "-" + index}>
            {renderProductThumb(item)}
            <div>
              <strong>{item.productName}</strong>
              <span>{t("quantity", "Số lượng")}: {item.quantity}</span>
            </div>
          </div>
        ))}
        {remainingItems > 0 && <span className="order-more-products">+{remainingItems} {t("other_products", "sản phẩm khác")}</span>}
      </div>
    );
  };

  return (
    <AccountLayout
      title={t("orders_list", "Danh sách đơn hàng")}
      description={t("orders_description", "Theo dõi trạng thái xử lý, giao hàng và thanh toán của các đơn đã đặt.")}
    >
      <section className="orders-panel">
        <div className="orders-tabs" role="tablist" aria-label={t("order_status", "Trạng thái đơn hàng")}>
          {tabs.map((tab) => (
            <button type="button" role="tab" aria-selected={selectedState === tab.value} className={"orders-tab" + (selectedState === tab.value ? " is-active" : "")} key={tab.value || "all"} onClick={() => selectState(tab.value)}>
              <span>{tab.label}</span>
              <strong>{tabCounts[tab.value] || 0}</strong>
            </button>
          ))}
        </div>

        {loading && <div className="orders-feedback"><CircularProgress size={34} /><p>{t("loading_orders", "Đang tải đơn hàng...")}</p></div>}
        {!loading && authRequired && (
          <div className="orders-feedback orders-empty-state">
            <span className="orders-empty-icon"><ReceiptLongRounded /></span>
            <h2>{t("login_to_view_orders", "Đăng nhập để xem đơn hàng")}</h2>
            <p>{t("login_to_view_orders_table", "Bạn cần đăng nhập để theo dõi danh sách đơn hàng của mình.")}</p>
            <Link to={"/login?redirect=" + encodeURIComponent("/myorder")}>{t("login_now", "Đăng nhập ngay")}</Link>
          </div>
        )}
        {!loading && error && !authRequired && (
          <div className="orders-feedback orders-empty-state">
            <span className="orders-empty-icon is-error"><ReceiptLongRounded /></span>
            <h2>{t("unable_to_load_orders", "Không thể tải đơn hàng")}</h2>
            <p>{error}</p>
            <button type="button" onClick={fetchOrders}>{t("try_again", "Thử lại")}</button>
          </div>
        )}
        {!loading && !error && !authRequired && filteredOrders.length === 0 && (
          <div className="orders-feedback orders-empty-state">
            <span className="orders-empty-icon"><ReceiptLongRounded /></span>
            <h2>{t("no_orders_yet", "Chưa có đơn hàng")}</h2>
            <p>{t("empty_orders_hint", "Không có đơn hàng phù hợp với trạng thái bạn đang chọn.")}</p>
            <Link to="/product">{t("continue_shopping", "Tiếp tục mua sắm")}</Link>
          </div>
        )}

        {!loading && !error && !authRequired && paginatedOrders.length > 0 && (
          <>
            <div className="orders-desktop-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>{t("order_code", "Mã đơn")}</th>
                    <th>{t("order_date", "Ngày đặt")}</th>
                    <th>{t("product_name", "Sản phẩm")}</th>
                    <th>{t("total_money", "Tổng tiền")}</th>
                    <th>{t("payment", "Thanh toán")}</th>
                    <th>{t("status", "Trạng thái")}</th>
                    <th>{t("actions", "Thao tác")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((order) => {
                    const status = getStatus(order);
                    return (
                      <tr key={order._id}>
                        <td>
                          <div className="order-code-cell">
                            <strong title={getOrderCode(order)}>{getOrderCode(order)}</strong>
                            <button type="button" onClick={() => copyOrderCode(order)} aria-label={t("copy_order_code", "Sao chép mã đơn")}><ContentCopyRounded /></button>
                          </div>
                        </td>
                        <td><span className="order-date-cell">{moment(order.createdAt).format("DD/MM/YYYY")}<small>{moment(order.createdAt).format("HH:mm")}</small></span></td>
                        <td>{renderProductSummary(order)}</td>
                        <td><strong className="order-total-cell">{formatMoney(order.total, locale)}</strong></td>
                        <td><span className={"order-pill payment-" + (order.payment ? "paid" : "unpaid")}>{order.payment ? t("paid", "Đã thanh toán") : t("unpaid", "Chưa thanh toán")}</span></td>
                        <td><span className={"order-pill status-" + status.tone}>{status.label}</span></td>
                        <td><button type="button" className="order-detail-button" onClick={() => openOrderDetails(order)}>{t("view_details", "Xem chi tiết")}<ArrowForwardIosRounded /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="orders-mobile-list">
              {paginatedOrders.map((order) => {
                const status = getStatus(order);
                return (
                  <article className="order-mobile-card" key={order._id}>
                    <div className="order-mobile-card-header">
                      <div>
                        <span>{t("order_code", "Mã đơn")}</span>
                        <strong>{getOrderCode(order)}</strong>
                      </div>
                      <button type="button" onClick={() => copyOrderCode(order)} aria-label={t("copy_order_code", "Sao chép mã đơn")}><ContentCopyRounded /></button>
                    </div>
                    <div className="order-mobile-meta">
                      <span>{moment(order.createdAt).format("DD/MM/YYYY · HH:mm")}</span>
                      <span className={"order-pill status-" + status.tone}>{status.label}</span>
                    </div>
                    {renderProductSummary(order)}
                    <div className="order-mobile-summary">
                      <div><span>{t("total_money", "Tổng tiền")}</span><strong>{formatMoney(order.total, locale)}</strong></div>
                      <span className={"order-pill payment-" + (order.payment ? "paid" : "unpaid")}>{order.payment ? t("paid", "Đã thanh toán") : t("unpaid", "Chưa thanh toán")}</span>
                    </div>
                    <button type="button" className="order-mobile-detail-button" onClick={() => openOrderDetails(order)}>{t("view_details", "Xem chi tiết")}<ArrowForwardIosRounded /></button>
                  </article>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="orders-pagination"><Pagination count={totalPages} page={page} onChange={(event, value) => setPage(value)} color="primary" shape="rounded" /></div>
            )}
          </>
        )}
      </section>

      <Dialog open={openDialog} onClose={closeOrderDetails} fullWidth maxWidth="md" className="order-detail-dialog">
        <DialogTitle>
          <div>
            <span>{t("order_details", "Chi tiết đơn hàng")}</span>
            <small>{getOrderCode(selectedOrder)}</small>
          </div>
          {selectedOrder && <span className={"order-pill status-" + getStatus(selectedOrder).tone}>{getStatus(selectedOrder).label}</span>}
        </DialogTitle>
        <DialogContent>
          {selectedOrder && (
            <div className="order-dialog-content">
              <div className="order-dialog-summary">
                <div><span>{t("order_date", "Ngày đặt")}</span><strong>{moment(selectedOrder.createdAt).format("DD/MM/YYYY HH:mm")}</strong></div>
                <div><span>{t("total_money", "Tổng tiền")}</span><strong>{formatMoney(selectedOrder.total, locale)}</strong></div>
                <div><span>{t("payment", "Thanh toán")}</span><strong>{selectedOrder.payment ? t("paid", "Đã thanh toán") : t("unpaid", "Chưa thanh toán")}</strong></div>
              </div>
              <h3>{t("product_list", "Danh sách sản phẩm")}</h3>
              <div className="order-dialog-products">
                {selectedOrder.cartItems.map((item, index) => {
                  const attributes = [item.productColor, item.productShape, item.productFrame, item.productButtonCount].filter(Boolean).join(" · ");
                  return (
                    <div className="order-dialog-product" key={(item.productId || "product") + "-dialog-" + index}>
                      {renderProductThumb(item)}
                      <div className="order-dialog-product-info">
                        <strong>{item.productName}</strong>
                        {attributes && <span>{attributes}</span>}
                      </div>
                      <span className="order-dialog-quantity">x{item.quantity}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          {canCancelOrder(selectedOrder) && <Button color="error" variant="outlined" onClick={() => setOpenCancelDialog(true)}>{t("cancel_order", "Hủy đơn hàng")}</Button>}
          <Button variant="contained" onClick={closeOrderDetails}>{t("close", "Đóng")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openCancelDialog} onClose={() => !isCancelling && setOpenCancelDialog(false)} className="order-cancel-dialog">
        <DialogTitle>{t("confirm_cancel_order", "Xác nhận hủy đơn hàng")}</DialogTitle>
        <DialogContent><p>{t("confirm_cancel_order_msg", "Bạn có chắc chắn muốn hủy đơn hàng này?").replace("{id}", getOrderCode(selectedOrder))}</p></DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCancelDialog(false)} disabled={isCancelling}>{t("no", "Không")}</Button>
          <Button color="error" variant="contained" onClick={cancelOrder} disabled={isCancelling}>{isCancelling ? t("processing", "Đang xử lý...") : t("cancel_order", "Hủy đơn hàng")}</Button>
        </DialogActions>
      </Dialog>
    </AccountLayout>
  );
};

export default MyOrder;
