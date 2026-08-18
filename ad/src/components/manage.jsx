import { useState, useEffect, useRef } from "react";
import { styled } from "@mui/material/styles";
import {
  Button,
  Box,
  Typography,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Switch,
  FormControlLabel,
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { Navigation, Pagination, Thumbs } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/thumbs";
import toast from "react-hot-toast";
import HomeCategoryManager from "./homecategorymanager";
import {
  deleteStorefrontImage,
  getStorefrontManagement,
  updateStorefrontFooterContent,
  updateStorefrontIntroduction,
  updateStorefrontPartnerSettings,
  uploadStorefrontImages,
  uploadStorefrontSectionImage,
} from "../api/storefrontManagementApi";
import "./style/manage.css";

const DEFAULT_FOOTER_CONTENT = {
  logo: "",
  description: "Nova - Website bán hàng thiết bị công nghiệp, tự động hóa và linh kiện kỹ thuật.",
  address: "Số 25 ngõ 77, phố Bùi Xương Trạch, phường Khương Đình, quận Thanh Xuân, Hà Nội",
  phone: "0901513825",
  email: "dungvutb1807@gmail.com",
};

const isImageAsset = (value) => typeof value === "string" && (
  /^data:image\//i.test(value)
  || /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value)
);

const IOSSwitch = styled((props) => (
  <Switch focusVisibleClassName=".Mui-focusVisible" disableRipple {...props} />
))(({ theme }) => ({
  width: 42,
  height: 26,
  padding: 0,
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: 2,
    transitionDuration: '300ms',
    '&.Mui-checked': {
      transform: 'translateX(16px)',
      color: '#fff',
      '& + .MuiSwitch-track': {
        backgroundColor: '#22c55e', // iOS green
        opacity: 1,
        border: 0,
      },
      '&.Mui-disabled + .MuiSwitch-track': {
        opacity: 0.5,
      },
    },
    '&.Mui-focusVisible .MuiSwitch-thumb': {
      color: '#33cf4d',
      border: '6px solid #fff',
    },
    '&.Mui-disabled .MuiSwitch-thumb': {
      color: theme.palette.grey[100],
    },
    '&.Mui-disabled + .MuiSwitch-track': {
      opacity: 0.7,
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 22,
    height: 22,
  },
  '& .MuiSwitch-track': {
    borderRadius: 26 / 2,
    backgroundColor: '#E9E9EA',
    opacity: 1,
    transition: theme.transitions.create(['background-color', 'border'], {
      duration: 500,
    }),
  },
}));

const ImageCarouselSection = ({
  title,
  emptyText,
  images,
  type,
  thumbsSwiper,
  setThumbsSwiper,
  inputRef,
  onFileSelect,
  onTriggerFileInput,
  onImageClick,
  loading,
  buttonText,
  loadingText,
  mainHeight,
  mainObjectFit,
  slideAltPrefix,
}) => (
  <Box sx={{ mb: 4, width: "900px" }}>
    <Typography variant="h6">{title}</Typography>
    <Box sx={{ border: "1px solid #ccc", padding: 2 }}>
      {images.length > 0 ? (
        <>
          <Swiper
            key={images.join("-")}
            modules={[Navigation, Pagination, Thumbs]}
            navigation
            pagination={{ clickable: true }}
            thumbs={{
              swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null,
            }}
            spaceBetween={10}
            slidesPerView={1}
            style={{ height: mainHeight }}
          >
            {images.map((imgUrl, index) => (
              <SwiperSlide key={index}>
                <Box
                  sx={{ cursor: "pointer" }}
                  onClick={() => onImageClick(imgUrl, type)}
                >
                  <img
                    src={imgUrl}
                    alt={`${slideAltPrefix} ${index}`}
                    style={{ width: "100%", height: mainHeight, objectFit: mainObjectFit }}
                  />
                </Box>
              </SwiperSlide>
            ))}
          </Swiper>
          <Swiper
            onSwiper={setThumbsSwiper}
            modules={[Thumbs]}
            spaceBetween={10}
            slidesPerView={4}
            freeMode
            watchSlidesProgress
            style={{ marginTop: 10 }}
          >
            {images.map((imgUrl, index) => (
              <SwiperSlide key={index}>
                <Box sx={{ cursor: "pointer" }}>
                  <img
                    src={imgUrl}
                    alt={`Thumb ${index}`}
                    style={{ width: "100%", height: 60, objectFit: "cover" }}
                  />
                </Box>
              </SwiperSlide>
            ))}
          </Swiper>
        </>
      ) : (
        <Typography>{emptyText}</Typography>
      )}
    </Box>
    <input
      type="file"
      multiple
      ref={inputRef}
      onChange={onFileSelect(type)}
      accept="image/*"
      style={{ display: "none" }}
    />
    <Button
      variant="contained"
      onClick={onTriggerFileInput(type)}
      disabled={loading}
      sx={{ mt: 2 }}
    >
      {loading ? loadingText : buttonText}
    </Button>
  </Box>
);

const TextUpdateSection = ({
  title,
  buttonLoadingText,
  buttonText,
  label,
  value,
  onChange,
  onUpdate,
  loading,
}) => (
  <Box sx={{ mb: 4, display: "grid" }}>
    <Typography variant="h6">{title}</Typography>
    <Button
      variant="contained"
      onClick={onUpdate}
      disabled={loading}
      sx={{ mb: 2, width: "150px" }}
    >
      {loading ? buttonLoadingText : buttonText}
    </Button>
    <TextField
      multiline
      minRows={5}
      label={label}
      value={value}
      onChange={onChange}
      style={{ minWidth: "500px", borderRadius: "4px", borderColor: "#ccc" }}
    />
  </Box>
);

const Manage = () => {
  const [manageData, setManageData] = useState({
    overViewImg: [],
    partners: [],
    displayPartners: true,
    footerContent: DEFAULT_FOOTER_CONTENT,
    topPurchaseUrl: "",
    highestRatingUrl: "",
    introduction: "",
    introductionTranslations: { vi: "", zh: "", en: "" },
    homeCategoryConfig: {
      configured: false,
      sidebarTitle: "Danh mục sản phẩm",
      showSidebar: true,
      showQuickCategories: true,
      items: [],
    },
  });
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [bannerThumbsSwiper, setBannerThumbsSwiper] = useState(null);
  const [introductionInputs, setIntroductionInputs] = useState({ vi: "", zh: "", en: "" });
  const [introductionLanguage, setIntroductionLanguage] = useState("vi");
  const [footerInputs, setFooterInputs] = useState(DEFAULT_FOOTER_CONTENT);

  const bannerInputRef = useRef(null);
  const topPurchaseInputRef = useRef(null);
  const highestRatingInputRef = useRef(null);
  const partnersInputRef = useRef(null);
  const footerLogoInputRef = useRef(null);

  useEffect(() => {
    fetchManageData();
  }, []);

  const fetchManageData = async () => {
    try {
      const response = await getStorefrontManagement();
      const result = await response.json();
      if (result.success) {
        setManageData(result.data);
        setIntroductionInputs({
          vi: result.data.introductionTranslations?.vi || result.data.introduction || "",
          zh: result.data.introductionTranslations?.zh || result.data.introduction || "",
          en: result.data.introductionTranslations?.en || result.data.introduction || "",
        });
        setFooterInputs({
          ...DEFAULT_FOOTER_CONTENT,
          ...(result.data.footerContent || {}),
        });
      } else {
        toast.error(result.message || "Lỗi khi lấy dữ liệu");
      }
    } catch (error) {
      console.error("Error fetching manage data:", error);
      toast.error("Đã xảy ra lỗi khi lấy dữ liệu");
    }
  };

  const handleToggleDisplayPartners = async (checked) => {
    try {
      const response = await updateStorefrontPartnerSettings({
        displayPartners: checked,
      });
      const result = await response.json();
      if (result.success) {
        setManageData((prev) => ({
          ...prev,
          displayPartners: result.data.displayPartners,
        }));
        toast.success(checked ? "Đã bật hiển thị đối tác" : "Đã tắt hiển thị đối tác");
      } else {
        toast.error(result.message || "Không thể cập nhật trạng thái hiển thị");
      }
    } catch (error) {
      console.error(error);
      toast.error("Lỗi khi cập nhật trạng thái hiển thị");
    }
  };

  const handleUpload = async (type, files) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    try {
      const response = await uploadStorefrontImages(type, files);
      const result = await response.json();
      if (result.success) {
        if (type === "banner") {
          setManageData((prev) => ({
            ...prev,
            overViewImg: result.data.overViewImg,
          }));
        } else if (type === "topPurchase") {
          setManageData((prev) => ({
            ...prev,
            topPurchaseUrl: result.data.topPurchaseUrl,
          }));
        } else if (type === "highestRating") {
          setManageData((prev) => ({
            ...prev,
            highestRatingUrl: result.data.highestRatingUrl,
          }));
        } else if (type === "partners") {
          setManageData((prev) => ({
            ...prev,
            partners: result.data.partners,
          }));
        }
        toast.success("Upload thành công");
      } else {
        toast.error(result.message || "Upload thất bại");
      }
    } catch (error) {
      console.error(`Error uploading ${type} image:`, error);
      toast.error("Đã xảy ra lỗi khi upload");
    } finally {
      setLoading(false);
    }
  };

  const triggerFileInput = (type) => () => {
    if (type === "banner") {
      bannerInputRef.current.click();
    } else if (type === "topPurchase") {
      topPurchaseInputRef.current.click();
    } else if (type === "highestRating") {
      highestRatingInputRef.current.click();
    } else if (type === "partners") {
      partnersInputRef.current.click();
    }
  };

  const handleFileSelect = (type) => (event) => {
    const files = event.target.files;
    if (files.length > 0) {
      handleUpload(type, files);
      event.target.value = "";
    }
  };

  const handleImageClick = (imgUrl, type) => {
    setSelectedImage({ url: imgUrl, type });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedImage(null);
  };

  const handleDeleteImage = async (imgUrl, type) => {
    setLoading(true);
    try {
      const response = await deleteStorefrontImage(imgUrl);
      const result = await response.json();
      if (result.success) {
        if (type === "banner") {
          setManageData((prev) => ({
            ...prev,
            overViewImg: result.data.overViewImg,
          }));
          handleCloseDialog();
        } else if (type === "partners") {
          setManageData((prev) => ({
            ...prev,
            partners: result.data.partners,
          }));
          handleCloseDialog();
        } else if (type === "topPurchase") {
          setManageData((prev) => ({ ...prev, topPurchaseUrl: "" }));
        } else if (type === "highestRating") {
          setManageData((prev) => ({ ...prev, highestRatingUrl: "" }));
        }
        toast.success("Xóa ảnh thành công");
      } else {
        toast.error(result.message || "Xóa ảnh thất bại");
      }
    } catch (error) {
      console.error("Error deleting image:", error);
      toast.error("Đã xảy ra lỗi khi xóa ảnh");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateIntroduction = async () => {
    setLoading(true);
    try {
      const response = await updateStorefrontIntroduction(
        introductionInputs.vi,
        introductionInputs,
      );
      const result = await response.json();
      if (result.success) {
        setManageData((prev) => ({
          ...prev,
          introduction: result.data.introduction,
          introductionTranslations: result.data.introductionTranslations,
        }));
        toast.success("Cập nhật thành công");
      } else {
        toast.error(result.message || "Cập nhật thất bại");
      }
    } catch (error) {
      console.error("Error updating introduction:", error);
      toast.error("Đã xảy ra lỗi khi cập nhật");
    } finally {
      setLoading(false);
    }
  };

  const handleFooterLogoSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setLoading(true);
    try {
      const response = await uploadStorefrontSectionImage(file);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Không thể tải logo lên");
      }
      setFooterInputs((current) => ({ ...current, logo: result.imgUrl }));
      toast.success("Đã chọn logo footer");
    } catch (error) {
      console.error("Error uploading footer logo:", error);
      toast.error(error.message || "Lỗi khi tải logo footer");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateFooter = async () => {
    setLoading(true);
    try {
      const response = await updateStorefrontFooterContent(footerInputs);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Không thể cập nhật footer");
      }
      setManageData(result.data);
      setFooterInputs({
        ...DEFAULT_FOOTER_CONTENT,
        ...(result.data.footerContent || {}),
      });
      toast.success("Cập nhật nội dung footer thành công");
    } catch (error) {
      console.error("Error updating footer:", error);
      toast.error(error.message || "Lỗi khi cập nhật footer");
    } finally {
      setLoading(false);
    }
  };

  const partnerImages = (manageData.partners || []).filter(isImageAsset);

  return (
    <Box sx={{ padding: 3 }}>
      <div className="sticky-header">
        <Typography variant="h4" gutterBottom>
          Quản lý nội dung
        </Typography>
      </div>

      <ImageCarouselSection
        title="Ảnh bìa"
        emptyText="Chưa có ảnh bìa"
        images={manageData.overViewImg}
        type="banner"
        thumbsSwiper={bannerThumbsSwiper}
        setThumbsSwiper={setBannerThumbsSwiper}
        inputRef={bannerInputRef}
        onFileSelect={handleFileSelect}
        onTriggerFileInput={triggerFileInput}
        onImageClick={handleImageClick}
        loading={loading}
        buttonText="Thêm ảnh bìa"
        loadingText="Đang tải..."
        mainHeight="300px"
        mainObjectFit="fill"
        slideAltPrefix="Banner"
      />

      <HomeCategoryManager
        value={manageData.homeCategoryConfig}
        onSaved={(updatedManage) => setManageData(updatedManage)}
      />

      <Box sx={{ mb: 4, width: "min(100%, 900px)" }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6">Ảnh thương hiệu nổi bật</Typography>
          <FormControlLabel
            control={
              <IOSSwitch
                checked={manageData.displayPartners !== false}
                onChange={(e) => handleToggleDisplayPartners(e.target.checked)}
              />
            }
            label={
              <Typography
                sx={{
                  fontWeight: 600,
                  color: "#475569",
                  fontSize: 14,
                  ml: 1
                }}
              >
                Hiển thị trên trang chủ
              </Typography>
            }
            sx={{ ml: 'auto' }}
          />
        </Box>
        <Typography sx={{ color: "#64748b", mb: 2 }}>
          Mỗi thương hiệu dùng một ảnh logo cố định trong một khung riêng ở cuối trang chủ.
        </Typography>
        <input
          type="file"
          multiple
          ref={partnersInputRef}
          onChange={handleFileSelect("partners")}
          accept="image/*"
          style={{ display: "none" }}
        />
        <Button
          variant="contained"
          onClick={triggerFileInput("partners")}
          disabled={loading}
          sx={{ mb: 2 }}
        >
          Chọn ảnh thương hiệu
        </Button>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 2,
          }}
        >
          {partnerImages.length > 0 ? partnerImages.map((partner, index) => (
            <Box
              key={`${partner}-${index}`}
              sx={{
                position: "relative",
                minHeight: 120,
                p: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #dbe4ee",
                borderRadius: 2,
                backgroundColor: "#fff",
              }}
            >
              <img
                src={partner}
                alt={`Thương hiệu ${index + 1}`}
                style={{ width: "100%", height: 76, objectFit: "contain" }}
              />
              <IconButton
                color="error"
                onClick={() => handleImageClick(partner, "partners")}
                disabled={loading}
                size="small"
                sx={{ position: "absolute", top: 4, right: 4, backgroundColor: "rgba(255,255,255,0.9)" }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          )) : (
            <Box sx={{ gridColumn: "1 / -1", p: 3, border: "1px dashed #cbd5e1", borderRadius: 2, color: "#64748b", textAlign: "center" }}>
              Chưa có ảnh thương hiệu
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ mb: 4, width: "min(100%, 900px)", p: 3, border: "1px solid #dbe4ee", borderRadius: 3, backgroundColor: "#fff" }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Nội dung footer</Typography>
        <Typography sx={{ color: "#64748b", mb: 3 }}>
          Chỉnh logo và các thông tin liên hệ ở cột đầu tiên của footer trang khách.
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "190px 1fr" }, gap: 3 }}>
          <Box>
            <Box sx={{ height: 120, p: 2, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #cbd5e1", borderRadius: 2, backgroundColor: "#f8fafc" }}>
              {footerInputs.logo ? (
                <img src={footerInputs.logo} alt="Logo footer" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <Typography sx={{ color: "#94a3b8", textAlign: "center" }}>Chưa chọn logo riêng</Typography>
              )}
            </Box>
            <input
              type="file"
              ref={footerLogoInputRef}
              onChange={handleFooterLogoSelect}
              accept="image/*"
              style={{ display: "none" }}
            />
            <Button
              variant="outlined"
              fullWidth
              onClick={() => footerLogoInputRef.current?.click()}
              disabled={loading}
              sx={{ mt: 1.5 }}
            >
              Chọn logo
            </Button>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <TextField
              label="Mô tả"
              value={footerInputs.description}
              onChange={(event) => setFooterInputs((current) => ({ ...current, description: event.target.value }))}
              multiline
              minRows={3}
              sx={{ gridColumn: "1 / -1" }}
            />
            <TextField
              label="Địa chỉ"
              value={footerInputs.address}
              onChange={(event) => setFooterInputs((current) => ({ ...current, address: event.target.value }))}
              multiline
              minRows={2}
              sx={{ gridColumn: "1 / -1" }}
            />
            <TextField
              label="Số điện thoại"
              value={footerInputs.phone}
              onChange={(event) => setFooterInputs((current) => ({ ...current, phone: event.target.value }))}
            />
            <TextField
              label="Email"
              type="email"
              value={footerInputs.email}
              onChange={(event) => setFooterInputs((current) => ({ ...current, email: event.target.value }))}
            />
          </Box>
        </Box>
        <Box display="flex" justifyContent="flex-end" sx={{ mt: 3 }}>
          <Button variant="contained" onClick={handleUpdateFooter} disabled={loading}>
            Lưu nội dung footer
          </Button>
        </Box>
      </Box>

      <Box sx={{ mb: 4, width: "900px" }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Giới thiệu ba ngôn ngữ</Typography>
        <Typography sx={{ color: "#64748b", mb: 2 }}>
          Nội dung này hiển thị tại trang Giới thiệu phía khách hàng theo ngôn ngữ đang chọn.
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          {[
            { key: "vi", label: "Tiếng Việt" },
            { key: "zh", label: "中文简体" },
            { key: "en", label: "English" },
          ].map((language) => (
            <Button
              key={language.key}
              variant={introductionLanguage === language.key ? "contained" : "outlined"}
              onClick={() => setIntroductionLanguage(language.key)}
            >
              {language.label}
            </Button>
          ))}
        </Box>
        <TextUpdateSection
          title=""
          buttonLoadingText="Đang cập nhật..."
          buttonText="Cập nhật cả ba ngôn ngữ"
          label="Nhập nội dung giới thiệu"
          value={introductionInputs[introductionLanguage]}
          onChange={(event) => setIntroductionInputs((current) => ({
            ...current,
            [introductionLanguage]: event.target.value,
          }))}
          onUpdate={handleUpdateIntroduction}
          loading={loading}
        />
      </Box>

      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        disableScrollLock
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">Xác nhận xóa ảnh</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Bạn có chắc chắn muốn xóa ảnh này khỏi danh sách không?
          </DialogContentText>
          {selectedImage && (
            <img
              src={selectedImage.url}
              alt="Selected"
              style={{ width: "100%", maxHeight: 200, objectFit: "cover", marginTop: 10 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={loading}>
            Hủy
          </Button>
          <Button
            onClick={() => handleDeleteImage(selectedImage.url, selectedImage.type)}
            color="error"
            disabled={loading}
            autoFocus
          >
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Manage;
