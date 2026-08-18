
import { useState } from "react";
import { CssVarsProvider, extendTheme } from "@mui/joy/styles";
import CssBaseline from "@mui/joy/CssBaseline";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import FormControl from "@mui/joy/FormControl";
import FormLabel from "@mui/joy/FormLabel";
import Input from "@mui/joy/Input";
import Typography from "@mui/joy/Typography";
import Stack from "@mui/joy/Stack";
import Link from "@mui/joy/Link";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import ArrowBack from "@mui/icons-material/ArrowBack";
import toast from "react-hot-toast";
import logo from "../assets/nova-logo-light.svg";
import { getAuthFailure } from "../api/httpClient";
import {
  loginAdmin,
  requestAdminPasswordReset,
  resetAdminPassword,
} from "../api/adminAuthApi";

const dashboardUrl = import.meta.env.VITE_DASHBOARD || "/admin/product";

const customTheme = extendTheme({
  colorSchemes: {
    light: {
      palette: {
        background: {
          surface: "#fff",
        },
      },
    },
  },
});

export default function SignInPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Quên mật khẩu state
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1 = nhập SĐT/Email, 2 = nhập OTP & mật khẩu mới
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const validatePhone = (phone) => {
    return /^[0-9]{10,11}$/.test(phone);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (isLoading) return;

    if (!validatePhone(phone)) {
      setError("Số điện thoại phải là chuỗi số từ 10 đến 11 chữ số.");
      toast.error("Vui lòng nhập số điện thoại hợp lệ!");
      return;
    }

    if (!password) {
      setError("Mật khẩu không được để trống.");
      toast.error("Vui lòng nhập mật khẩu!");
      return;
    }

    setIsLoading(true);
    try {
      const response = await loginAdmin({ phone, password });

      const data = await response.json();

      if (response.ok) {
        toast.success("Đăng nhập thành công!");
        setTimeout(() => {
          window.location.href = `${dashboardUrl}`;
        }, 1000);
      } else {
        const authFailure = getAuthFailure(response);
        if (authFailure === "unauthorized") {
          setError("Thông tin đăng nhập không đúng.");
          toast.error("Số điện thoại hoặc mật khẩu không đúng!");
        } else if (authFailure === "forbidden") {
          setError("Bạn không có quyền truy cập vào trang admin.");
          toast.error("Bạn không có quyền admin!");
        } else {
          setError(data.message || "Đăng nhập thất bại!");
          toast.error(data.message || "Đăng nhập thất bại!");
        }
      }
    } catch {
      setError("Không thể kết nối đến server. Vui lòng thử lại sau.");
      toast.error("Đã xảy ra lỗi. Vui lòng thử lại sau!");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  // Gửi OTP quên mật khẩu
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!forgotIdentifier) {
      toast.error("Vui lòng nhập số điện thoại hoặc email");
      return;
    }

    setForgotLoading(true);
    try {
      const response = await requestAdminPasswordReset(forgotIdentifier);

      const data = await response.json();
      if (response.ok) {
        toast.success(data.message || "Mã OTP đã được gửi");
        setForgotStep(2);
      } else {
        toast.error(data.message);
      }
    } catch {
      toast.error("Đã xảy ra lỗi. Vui lòng thử lại sau!");
    } finally {
      setForgotLoading(false);
    }
  };

  // Đặt lại mật khẩu bằng OTP
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toast.error("Mật khẩu không khớp");
      return;
    }
    if (!otp || otp.length < 6) {
      toast.error("Vui lòng nhập mã OTP gồm 6 chữ số");
      return;
    }

    setForgotLoading(true);
    try {
      const response = await resetAdminPassword({
        identifier: forgotIdentifier,
        otp,
        newPassword,
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(data.message || "Đặt lại mật khẩu thành công");
        // Reset state và quay về form đăng nhập
        setIsForgotPassword(false);
        setForgotStep(1);
        setForgotIdentifier("");
        setOtp("");
        setNewPassword("");
        setConfirmNewPassword("");
      } else {
        toast.error(data.message);
      }
    } catch {
      toast.error("Đã xảy ra lỗi. Vui lòng thử lại sau!");
    } finally {
      setForgotLoading(false);
    }
  };

  // Render form quên mật khẩu bước 1: nhập SĐT/Email
  const renderForgotStep1 = () => (
    <form onSubmit={handleRequestOtp}>
      <Stack spacing={2}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            variant="plain"
            size="sm"
            onClick={() => {
              setIsForgotPassword(false);
              setForgotStep(1);
            }}
            sx={{ minWidth: "auto", p: 0.5 }}
          >
            <ArrowBack />
          </Button>
          <Typography component="h1" level="h3">
            Quên mật khẩu
          </Typography>
        </Box>
        <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
          Nhập số điện thoại hoặc email của bạn để nhận mã OTP khôi phục mật khẩu.
        </Typography>
        <FormControl required>
          <FormLabel>Số điện thoại hoặc Email</FormLabel>
          <Input
            type="text"
            value={forgotIdentifier}
            onChange={(e) => setForgotIdentifier(e.target.value)}
            placeholder="Nhập số điện thoại hoặc email"
          />
        </FormControl>
        <Typography level="body-xs" sx={{ color: "danger.500", fontStyle: "italic" }}>
          Lưu ý: Mã OTP sẽ gửi về email đăng ký của tài khoản. OTP có hiệu lực trong vòng 5 phút!
        </Typography>
        <Button
          type="submit"
          fullWidth
          disabled={forgotLoading}
          loading={forgotLoading}
          sx={{ transition: "all 0.3s ease" }}
        >
          {forgotLoading ? "Đang gửi..." : "Gửi mã OTP"}
        </Button>
      </Stack>
    </form>
  );

  // Render form quên mật khẩu bước 2: nhập OTP + mật khẩu mới
  const renderForgotStep2 = () => (
    <form onSubmit={handleResetPassword}>
      <Stack spacing={2}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            variant="plain"
            size="sm"
            onClick={() => setForgotStep(1)}
            sx={{ minWidth: "auto", p: 0.5 }}
          >
            <ArrowBack />
          </Button>
          <Typography component="h1" level="h3">
            Đặt lại mật khẩu
          </Typography>
        </Box>
        <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
          Mã OTP đã được gửi đến email liên kết của tài khoản: <strong>{forgotIdentifier}</strong>
        </Typography>
        <FormControl required>
          <FormLabel>Mã OTP</FormLabel>
          <Input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Nhập mã OTP 6 số"
            slotProps={{ input: { maxLength: 6 } }}
          />
        </FormControl>
        <FormControl required>
          <FormLabel>Mật khẩu mới</FormLabel>
          <Input
            type={showNewPassword ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Nhập mật khẩu mới"
            endDecorator={
              <Button
                variant="plain"
                onClick={() => setShowNewPassword(!showNewPassword)}
                sx={{ minWidth: "auto", p: 1 }}
              >
                {showNewPassword ? <VisibilityOff /> : <Visibility />}
              </Button>
            }
          />
        </FormControl>
        <FormControl required>
          <FormLabel>Nhập lại mật khẩu mới</FormLabel>
          <Input
            type={showConfirmNewPassword ? "text" : "password"}
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            placeholder="Nhập lại mật khẩu mới"
            endDecorator={
              <Button
                variant="plain"
                onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                sx={{ minWidth: "auto", p: 1 }}
              >
                {showConfirmNewPassword ? <VisibilityOff /> : <Visibility />}
              </Button>
            }
          />
        </FormControl>
        <Button
          type="submit"
          fullWidth
          disabled={forgotLoading}
          loading={forgotLoading}
          sx={{ transition: "all 0.3s ease" }}
        >
          {forgotLoading ? "Đang xử lý..." : "Xác nhận"}
        </Button>
      </Stack>
    </form>
  );

  return (
    <CssVarsProvider theme={customTheme}>
      <CssBaseline />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          width: "100%",
          px: 2,
          transition: "background-color 0.3s ease",
        }}
      >
        <Box
          sx={{
            width: 400,
            maxWidth: "100%",
            p: 3,
            borderRadius: "sm",
            boxShadow: "lg",
            backgroundColor: "background.surface",
            transition: "all 0.3s ease",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <img
              src={logo}
              alt="Logo công ty"
              style={{
                height: "58px",
                width: "auto",
                display: "block",
              }}
            />
          </Box>

          {isForgotPassword ? (
            forgotStep === 1 ? renderForgotStep1() : renderForgotStep2()
          ) : (
            <>
              <Typography component="h1" level="h3" gutterBottom>
                Đăng nhập Admin
              </Typography>
              {error && <Typography color="danger">{error}</Typography>}

              <form onSubmit={handleLogin} autoComplete="on">
                {/* Input ẩn để Chrome nhận diện username/password */}
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  style={{ display: "none" }}
                />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  style={{ display: "none" }}
                />

                <Stack spacing={2}>
                  <FormControl required>
                    <FormLabel>Số điện thoại</FormLabel>
                    <Input
                      type="text"
                      name="username"
                      autoComplete="username"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      placeholder="Nhập số điện thoại"
                    />
                  </FormControl>
                  <FormControl required>
                    <FormLabel>Mật khẩu</FormLabel>
                    <Input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu"
                      endDecorator={
                        <Button
                          variant="plain"
                          onClick={togglePasswordVisibility}
                          sx={{ minWidth: "auto", p: 1 }}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </Button>
                      }
                    />
                  </FormControl>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Link
                      onClick={() => {
                        setIsForgotPassword(true);
                        setForgotStep(1);
                        setForgotIdentifier(phone); // auto fill nếu đã nhập SĐT
                      }}
                    >
                      Quên mật khẩu?
                    </Link>
                  </Box>
                  <Button
                    type="submit"
                    fullWidth
                    disabled={isLoading}
                    loading={isLoading}
                    sx={{ transition: "all 0.3s ease" }}
                  >
                    {isLoading ? "Đang xử lý..." : "Đăng nhập"}
                  </Button>
                </Stack>
              </form>
            </>
          )}
        </Box>
        <Typography level="body-xs" sx={{ textAlign: "center", mt: 2 }}>
          © NOVA {new Date().getFullYear()}
        </Typography>
      </Box>
    </CssVarsProvider>
  );
}
