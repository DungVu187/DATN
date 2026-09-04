import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowBackRounded,
  CheckCircleRounded,
  ContentCopyRounded,
  ErrorOutlineRounded,
  LockOutlined,
  RefreshRounded,
  TimerOutlined,
} from "@mui/icons-material";
import { Button, CircularProgress } from "@mui/material";
import toast from "react-hot-toast";
import { getCustomerPaymentStatus } from "../api/paymentApi";
import "./styles/sepayPayment.css";

const formatMoney = (value) => new Intl.NumberFormat("vi-VN").format(Number(value) || 0) + " đ";

function SepayPayment() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [paymentState, setPaymentState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const loadStatus = useCallback(async () => {
    try {
      const response = await getCustomerPaymentStatus(orderId);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Không thể tải trạng thái thanh toán.");
      setPaymentState(data);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadStatus();
    const polling = window.setInterval(loadStatus, 3500);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(polling);
      window.clearInterval(clock);
    };
  }, [loadStatus]);

  const expiresAt = paymentState?.paymentExpiresAt ? new Date(paymentState.paymentExpiresAt).getTime() : 0;
  const remainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const countdown = useMemo(() => `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")} : ${String(remainingSeconds % 60).padStart(2, "0")}`, [remainingSeconds]);
  const isExpired = paymentState?.paymentStatus === "EXPIRED" || (remainingSeconds === 0 && paymentState?.paymentStatus === "PENDING");
  const isPaid = paymentState?.paymentStatus === "PAID";
  const isUnderpaid = paymentState?.paymentStatus === "UNDERPAID";

  const copyReference = async () => {
    const transferContent = paymentState?.payment?.transferContent || paymentState?.paymentReference;
    if (!transferContent) return;
    await navigator.clipboard.writeText(transferContent);
    toast.success("Đã sao chép nội dung chuyển khoản.");
  };

  if (loading) return <div className="sepay-loading"><CircularProgress size={34} /><span>Đang tải thông tin thanh toán…</span></div>;

  if (error) {
    return <main className="sepay-page"><div className="sepay-result-card is-error"><ErrorOutlineRounded /><h1>Không thể tải giao dịch</h1><p>{error}</p><Button variant="contained" onClick={loadStatus}>Thử lại</Button></div></main>;
  }

  if (isPaid) {
    return <main className="sepay-page"><div className="sepay-result-card is-success"><CheckCircleRounded /><span className="sepay-kicker">THANH TOÁN HOÀN TẤT</span><h1>Đơn hàng đã được xác nhận</h1><p>SePay đã ghi nhận khoản chuyển khoản của bạn. Nova sẽ bắt đầu xử lý đơn hàng.</p><strong>{paymentState.orderCode}</strong><div><Button variant="contained" onClick={() => navigate("/myorder")}>Xem đơn hàng</Button><Button onClick={() => navigate("/product")}>Tiếp tục mua sắm</Button></div></div></main>;
  }

  return (
    <main className="sepay-page">
      <div className="sepay-shell">
        <button className="sepay-back" type="button" onClick={() => navigate("/myorder")}><ArrowBackRounded /> Quay lại đơn hàng</button>
        <div className="sepay-header"><div><span className="sepay-kicker">SEPAY · THANH TOÁN CHUYỂN KHOẢN</span><h1>Quét mã để hoàn tất</h1><p>Chuyển đúng số tiền và giữ nguyên nội dung để hệ thống tự xác nhận.</p></div><div className="sepay-secure"><LockOutlined /> Kết nối bảo mật</div></div>
        <div className="sepay-payment-grid">
          <section className="sepay-qr-card">
            <div className="sepay-qr-frame">{paymentState?.payment?.qrUrl ? <img src={paymentState.payment.qrUrl} alt="QR thanh toán SePay" /> : <RefreshRounded />}</div>
            <div className="sepay-countdown"><TimerOutlined /><span>Thời gian giữ giao dịch</span><strong>{isExpired ? "Đã hết hạn" : countdown}</strong></div>
            <p className="sepay-qr-help">Mở ứng dụng ngân hàng, chọn quét QR và kiểm tra lại số tiền trước khi xác nhận.</p>
          </section>
          <section className="sepay-detail-card">
            <div className="sepay-detail-heading"><span>CHI TIẾT CHUYỂN KHOẢN</span><strong>{paymentState.orderCode}</strong></div>
            <div className="sepay-amount"><span>Số tiền cần chuyển</span><strong>{formatMoney(paymentState.paymentAmount)}</strong></div>
            <div className="sepay-bank-details"><div><span>Ngân hàng</span><strong>{paymentState.payment?.bankCode || "—"}</strong></div><div><span>Số tài khoản</span><strong>{paymentState.payment?.accountNumber || "—"}</strong></div><div><span>Chủ tài khoản</span><strong>{paymentState.payment?.accountName || "—"}</strong></div><div><span>Nội dung chuyển khoản</span><button type="button" onClick={copyReference}><strong>{paymentState.payment?.transferContent || paymentState.paymentReference}</strong><ContentCopyRounded /></button></div></div>
            <div className={`sepay-status-note${isUnderpaid || isExpired ? " is-warning" : ""}`}><span className="sepay-status-dot" /><span>{isUnderpaid ? "Khoản chuyển khoản chưa đủ số tiền. Vui lòng kiểm tra và chuyển bổ sung." : isExpired ? "Giao dịch đã hết hạn. Vui lòng quay lại giỏ hàng để tạo đơn mới." : "Đang chờ SePay xác nhận giao dịch…"}</span></div>
            <Button className="sepay-refresh" variant="outlined" startIcon={<RefreshRounded />} onClick={loadStatus}>Kiểm tra lại</Button>
          </section>
        </div>
        <div className="sepay-footnote"><strong>Lưu ý:</strong> Không đóng trang cho đến khi giao dịch được xác nhận. Nếu chuyển khoản sai nội dung, hệ thống có thể không tự động ghép được với đơn hàng.</div>
      </div>
    </main>
  );
}

export default SepayPayment;
