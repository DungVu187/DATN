const nodemailer = require('nodemailer');

// Khởi tạo transporter dùng Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * Gửi email thông báo đơn hàng mới đến admin
 * @param {Object} orderInfo - Thông tin đơn hàng
 * @param {string} orderInfo.orderId
 * @param {string} orderInfo.userPhone
 * @param {string} orderInfo.userName
 * @param {number} orderInfo.total
 * @param {Date}   orderInfo.createdAt
 */
const sendNewOrderNotification = async (orderInfo) => {
  const { orderId, userPhone, userName, total, createdAt } = orderInfo;

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!adminEmail || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('Bỏ qua gửi email: thiếu cấu hình GMAIL_USER / GMAIL_APP_PASSWORD / ADMIN_NOTIFY_EMAIL trong .env');
    return;
  }

  const orderTime = new Date(createdAt).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const totalFormatted = Number(total).toLocaleString('vi-VN') + ' ₫';

  const adminPanelUrl = (process.env.ADDRESS || '') + '/admin/order';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #1565c0; padding: 20px 24px;">
        <h2 style="color: #ffffff; margin: 0;">Đơn hàng mới — Nova</h2>
      </div>
      <div style="padding: 24px; background-color: #ffffff;">
        <p style="font-size: 16px; color: #333;">Có một đơn hàng mới vừa được đặt trên hệ thống. Vui lòng xử lý sớm.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px 14px; font-weight: bold; width: 40%;">Mã đơn hàng</td>
            <td style="padding: 10px 14px;">${orderId}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; font-weight: bold;">Khách hàng</td>
            <td style="padding: 10px 14px;">${userName || 'Chưa có tên'}</td>
          </tr>
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px 14px; font-weight: bold;">Số điện thoại</td>
            <td style="padding: 10px 14px;">${userPhone}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; font-weight: bold;">Tổng tiền</td>
            <td style="padding: 10px 14px; color: #1565c0; font-weight: bold; font-size: 18px;">${totalFormatted}</td>
          </tr>
          <tr style="background-color: #f5f5f5;">
            <td style="padding: 10px 14px; font-weight: bold;">Thời gian đặt</td>
            <td style="padding: 10px 14px;">${orderTime}</td>
          </tr>
        </table>
        <div style="margin-top: 24px; text-align: center;">
          <a href="${adminPanelUrl}"
             style="background-color: #1565c0; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: bold;">
            Xem đơn hàng trong Admin
          </a>
        </div>
      </div>
      <div style="background-color: #f5f5f5; padding: 14px 24px; text-align: center; color: #888; font-size: 12px;">
        Email tự động từ hệ thống Nova — Không cần trả lời email này.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Nova Ecom" <${process.env.GMAIL_USER}>`,
      to: adminEmail,
      subject: `Đơn hàng mới #${orderId} — ${totalFormatted}`,
      html: htmlBody,
    });
  } catch (err) {
    // Không throw — tránh làm hỏng response tạo đơn
    console.error('Gửi email thất bại:', err.message);
  }
};

const sendResetOtpEmail = async (email, otp, userName) => {
  if (!email || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('Bỏ qua gửi email: thiếu cấu hình GMAIL_USER / GMAIL_APP_PASSWORD trong .env hoặc thiếu email nhận');
    return;
  }

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #1976d2; padding: 20px 24px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0;">Khôi phục mật khẩu — Nova</h2>
      </div>
      <div style="padding: 24px; background-color: #ffffff;">
        <p style="font-size: 16px; color: #333;">Xin chào <strong>${userName || 'Khách hàng'}</strong>,</p>
        <p style="font-size: 16px; color: #333;">Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản của bạn. Vui lòng sử dụng mã OTP dưới đây để hoàn tất việc đặt lại mật khẩu:</p>

        <div style="margin: 24px 0; text-align: center;">
          <span style="display: inline-block; background-color: #f1f8e9; color: #33691e; border: 1px dashed #689f38; font-size: 28px; font-weight: bold; letter-spacing: 4px; padding: 12px 30px; border-radius: 6px;">
            ${otp}
          </span>
        </div>

        <p style="font-size: 14px; color: #e53935; font-weight: bold;">Lưu ý: Mã OTP này có hiệu lực trong vòng 5 phút.</p>
        <p style="font-size: 14px; color: #666; margin-top: 16px;">Nếu bạn không yêu cầu khôi phục mật khẩu, vui lòng bỏ qua email này.</p>
      </div>
      <div style="background-color: #f5f5f5; padding: 14px 24px; text-align: center; color: #888; font-size: 12px;">
        Email tự động từ hệ thống Nova — Không cần trả lời email này.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Nova Ecom" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Mã OTP khôi phục mật khẩu của bạn — Nova`,
      html: htmlBody,
    });
    console.log(`Đã gửi email mã OTP đến ${email}`);
  } catch (err) {
    console.error('Gửi email OTP thất bại:', err.message);
    throw new Error('Gửi email OTP thất bại: ' + err.message);
  }
};

module.exports = { sendNewOrderNotification, sendResetOtpEmail };
