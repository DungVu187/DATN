import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import toast from "react-hot-toast";
import HomeCategoryIcon from "./homecategoryicon";
import {
  CATEGORY_ICON_OPTIONS,
  getCategoryIcon,
  normalizeTypeName,
} from "../utils/homecategoryicons";
import {
  getPublicStorefrontProductTypes,
  resolveStorefrontAssetUrl,
  updateStorefrontHomeCategories,
  uploadStorefrontSectionImage,
} from "../api/storefrontManagementApi";

const contentLanguages = [
  { key: "vi", label: "Tiếng Việt" },
  { key: "zh", label: "中文简体" },
  { key: "en", label: "English" },
];

const createCategoryId = () =>
  `home-category-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createEmptyCategory = () => ({
  id: createCategoryId(),
  label: "",
  labelTranslations: { vi: "", zh: "", en: "" },
  type: "",
  link: "",
  icon: "ri-tb-box-multiple",
  image: "",
  showSidebar: true,
  showQuick: true,
});

const createCategoriesFromTypes = (types) =>
  types.slice(0, 9).map((type, index) => ({
    id: type._id || createCategoryId(),
    label: type.Type || "",
    labelTranslations: {
      vi: type.Type || "",
      zh: type.Type || "",
      en: type.Type || "",
    },
    type: type.Type || "",
    link: "",
    icon: type.icon || getCategoryIcon(type.Type),
    image: "",
    showSidebar: true,
    showQuick: index < 8,
  }));

const normalizeConfig = (value, types) => {
  const storedItems = Array.isArray(value?.items) ? value.items : [];
  const shouldUseStoredItems = storedItems.length > 0 || value?.configured === true;
  const items = shouldUseStoredItems
    ? storedItems.map((item) => ({
        id: item.id || createCategoryId(),
        label: item.label || item.type || "",
        labelTranslations: {
          vi: item.labelTranslations?.vi || item.label || item.type || "",
          zh: item.labelTranslations?.zh || item.label || item.type || "",
          en: item.labelTranslations?.en || item.label || item.type || "",
        },
        type: item.type || "",
        link: item.link || "",
        icon: item.icon || types.find(
          (type) => normalizeTypeName(type.Type) === normalizeTypeName(item.type),
        )?.icon || getCategoryIcon(item.type),
        image: item.image || "",
        showSidebar: item.showSidebar !== false,
        showQuick: item.showQuick !== false,
      }))
    : createCategoriesFromTypes(types);

  return {
    configured: value?.configured === true,
    sidebarTitle: value?.sidebarTitle || "Danh mục sản phẩm",
    sidebarTitleTranslations: {
      vi: value?.sidebarTitleTranslations?.vi || value?.sidebarTitle || "Danh mục sản phẩm",
      zh: value?.sidebarTitleTranslations?.zh || value?.sidebarTitle || "Danh mục sản phẩm",
      en: value?.sidebarTitleTranslations?.en || value?.sidebarTitle || "Danh mục sản phẩm",
    },
    showSidebar: value?.showSidebar !== false,
    showQuickCategories: value?.showQuickCategories !== false,
    items,
  };
};

const HomeCategoryManager = ({ value, onSaved }) => {
  const [types, setTypes] = useState([]);
  const [config, setConfig] = useState(() => normalizeConfig(value, []));
  const [saving, setSaving] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState(null);
  const [contentLanguage, setContentLanguage] = useState("vi");

  const typeOptions = useMemo(
    () => types.map((type) => type.Type).filter(Boolean),
    [types],
  );

  useEffect(() => {
    let active = true;

    const fetchTypes = async () => {
      try {
        const response = await getPublicStorefrontProductTypes();
        const result = await response.json();
        if (active) setTypes(Array.isArray(result) ? result : []);
      } catch (error) {
        console.error("Error fetching product types:", error);
        if (active) toast.error("Không thể tải danh sách loại sản phẩm");
      }
    };

    fetchTypes();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setConfig(normalizeConfig(value, types));
  }, [value, types]);

  const updateConfig = (field, nextValue) => {
    setConfig((current) => ({ ...current, [field]: nextValue }));
  };

  const updateSidebarTitle = (nextValue) => {
    setConfig((current) => ({
      ...current,
      sidebarTitle: contentLanguage === "vi" ? nextValue : current.sidebarTitle,
      sidebarTitleTranslations: {
        ...current.sidebarTitleTranslations,
        [contentLanguage]: nextValue,
      },
    }));
  };

  const updateItem = (index, field, nextValue) => {
    setConfig((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: nextValue } : item,
      ),
    }));
  };

  const updateItemLabel = (index, nextValue) => {
    setConfig((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index
          ? {
              ...item,
              label: contentLanguage === "vi" ? nextValue : item.label,
              labelTranslations: {
                ...item.labelTranslations,
                [contentLanguage]: nextValue,
              },
            }
          : item
      )),
    }));
  };

  const updateItemType = (index, nextType) => {
    const matchedType = types.find(
      (type) => normalizeTypeName(type.Type) === normalizeTypeName(nextType),
    );
    setConfig((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              type: nextType,
              icon: matchedType?.icon || getCategoryIcon(nextType),
            }
          : item,
      ),
    }));
  };

  const moveItem = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= config.items.length) return;

    setConfig((current) => {
      const items = [...current.items];
      [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
      return { ...current, items };
    });
  };

  const removeItem = (index) => {
    setConfig((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const addItem = () => {
    if (config.items.length >= 30) {
      toast.error("Chỉ được cấu hình tối đa 30 danh mục");
      return;
    }
    setConfig((current) => ({
      ...current,
      configured: true,
      items: [...current.items, createEmptyCategory()],
    }));
  };

  const resetFromTypes = () => {
    if (typeOptions.length === 0) {
      toast.error("Chưa có loại sản phẩm để nạp");
      return;
    }
    if (!window.confirm("Nạp lại danh sách sẽ thay thế các mục đang chỉnh sửa. Bạn có muốn tiếp tục?")) {
      return;
    }
    setConfig((current) => ({
      ...current,
      configured: true,
      items: createCategoriesFromTypes(types),
    }));
  };

  const uploadCategoryImage = async (index, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn đúng định dạng ảnh");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ảnh danh mục không được vượt quá 5MB");
      return;
    }

    setUploadingIndex(index);
    try {
      const response = await uploadStorefrontSectionImage(file);
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Không thể tải ảnh lên");
      }
      updateItem(index, "image", result.imgUrl);
      toast.success("Tải ảnh danh mục thành công");
    } catch (error) {
      console.error("Error uploading home category image:", error);
      toast.error(error.message || "Không thể tải ảnh danh mục");
    } finally {
      setUploadingIndex(null);
    }
  };

  const saveConfig = async () => {
    const invalidItem = config.items.find((item) => (
      contentLanguages.some((language) => !item.labelTranslations?.[language.key]?.trim())
      || (!item.type.trim() && !item.link.trim())
    ));
    if (invalidItem) {
      toast.error("Mỗi danh mục cần có tên và loại sản phẩm hoặc liên kết tùy chỉnh");
      return;
    }

    setSaving(true);
    try {
      const response = await updateStorefrontHomeCategories(config);
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Không thể lưu danh mục trang chủ");
      }
      setConfig(normalizeConfig(result.data.homeCategoryConfig, types));
      onSaved?.(result.data);
      toast.success("Đã lưu danh mục trang chủ");
    } catch (error) {
      console.error("Error saving home categories:", error);
      toast.error(error.message || "Không thể lưu danh mục trang chủ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper className="home-category-manager" variant="outlined">
      <Box className="home-category-manager__heading">
        <Box>
          <Typography variant="h6" fontWeight={700}>Danh mục trang chủ</Typography>
          <Typography variant="body2" color="text.secondary">
            Chỉnh thứ tự, nội dung, icon, ảnh và vị trí xuất hiện của các danh mục trên trang khách hàng.
          </Typography>
        </Box>
        <FormControlLabel
          control={(
            <Switch
              checked={config.configured}
              onChange={(event) => updateConfig("configured", event.target.checked)}
            />
          )}
          label="Dùng cấu hình thủ công"
        />
      </Box>

      {!config.configured && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Trang khách đang lấy tự động các loại sản phẩm đầu tiên. Bật cấu hình thủ công và lưu để áp dụng danh sách bên dưới.
        </Alert>
      )}

      <Box sx={{ display: "flex", gap: 1, mt: 2, mb: 2 }}>
        {contentLanguages.map((language) => (
          <Button
            key={language.key}
            size="small"
            variant={contentLanguage === language.key ? "contained" : "outlined"}
            onClick={() => setContentLanguage(language.key)}
          >
            {language.label}
          </Button>
        ))}
      </Box>

      <Box className="home-category-manager__settings">
        <TextField
          label={`Tiêu đề menu bên trái · ${contentLanguages.find((item) => item.key === contentLanguage)?.label}`}
          value={config.sidebarTitleTranslations[contentLanguage]}
          onChange={(event) => updateSidebarTitle(event.target.value)}
          size="small"
          fullWidth
          inputProps={{ maxLength: 80 }}
        />
        <FormControlLabel
          control={(
            <Switch
              checked={config.showSidebar}
              onChange={(event) => updateConfig("showSidebar", event.target.checked)}
            />
          )}
          label="Hiện menu bên trái"
        />
        <FormControlLabel
          control={(
            <Switch
              checked={config.showQuickCategories}
              onChange={(event) => updateConfig("showQuickCategories", event.target.checked)}
            />
          )}
          label="Hiện danh mục ngang"
        />
      </Box>

      <Divider sx={{ my: 2.5 }} />

      <Stack spacing={2}>
        {config.items.map((item, index) => (
          <Paper key={item.id} className="home-category-manager__item" variant="outlined">
            <Box className="home-category-manager__item-heading">
              <Typography fontWeight={700}>Vị trí {index + 1}</Typography>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Đưa lên">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Đưa xuống">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => moveItem(index, 1)}
                      disabled={index === config.items.length - 1}
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Xóa khỏi danh sách">
                  <IconButton size="small" color="error" onClick={() => removeItem(index)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            <Box className="home-category-manager__item-grid">
              <Box className="home-category-manager__image-column">
                <Box className="home-category-manager__image-preview">
                  {item.image ? (
                    <img src={resolveStorefrontAssetUrl(item.image)} alt={item.label || `Danh mục ${index + 1}`} />
                  ) : (
                    <Typography variant="caption" color="text.secondary">Chưa có ảnh riêng</Typography>
                  )}
                </Box>
                <Button
                  component="label"
                  size="small"
                  variant="outlined"
                  startIcon={<UploadFileIcon />}
                  disabled={uploadingIndex === index}
                  fullWidth
                >
                  {uploadingIndex === index ? "Đang tải..." : "Chọn ảnh"}
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={(event) => uploadCategoryImage(index, event)}
                  />
                </Button>
                {item.image && (
                  <Button
                    size="small"
                    color="error"
                    onClick={() => updateItem(index, "image", "")}
                  >
                    Bỏ ảnh
                  </Button>
                )}
              </Box>

              <Box className="home-category-manager__fields">
                <TextField
                  label={`Tên hiển thị · ${contentLanguages.find((language) => language.key === contentLanguage)?.label}`}
                  value={item.labelTranslations[contentLanguage]}
                  onChange={(event) => updateItemLabel(index, event.target.value)}
                  size="small"
                  fullWidth
                  required
                  inputProps={{ maxLength: 80 }}
                />
                <Autocomplete
                  freeSolo
                  options={typeOptions}
                  value={item.type}
                  onChange={(_, nextValue) => updateItemType(index, nextValue || "")}
                  onInputChange={(_, nextValue) => updateItemType(index, nextValue || "")}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Loại sản phẩm"
                      size="small"
                      helperText="Dùng để lọc sản phẩm khi khách bấm vào danh mục"
                    />
                  )}
                />
                <TextField
                  label="Liên kết tùy chỉnh"
                  value={item.link}
                  onChange={(event) => updateItem(index, "link", event.target.value)}
                  size="small"
                  fullWidth
                  placeholder="Để trống để tự mở theo loại sản phẩm"
                  inputProps={{ maxLength: 500 }}
                />
                <FormControl size="small" fullWidth>
                  <InputLabel id={`home-category-icon-${item.id}`}>Icon menu trái</InputLabel>
                  <Select
                    labelId={`home-category-icon-${item.id}`}
                    value={item.icon}
                    label="Icon menu trái"
                    onChange={(event) => updateItem(index, "icon", event.target.value)}
                    disabled={Boolean(item.type.trim())}
                    renderValue={(selected) => {
                      const selectedOption = CATEGORY_ICON_OPTIONS.find((option) => option.value === selected);
                      return (
                        <Box className="home-category-manager__icon-option">
                          <HomeCategoryIcon icon={selected} />
                          <span>{selectedOption?.label || "Icon danh mục"}</span>
                        </Box>
                      );
                    }}
                  >
                    {CATEGORY_ICON_OPTIONS.map((icon) => (
                      <MenuItem key={icon.value} value={icon.value}>
                        <Box className="home-category-manager__icon-option">
                          <HomeCategoryIcon icon={icon.value} />
                          <span>{icon.label}</span>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    {item.type.trim() ? "Tự động theo loại sản phẩm" : "Có thể chọn tay khi chỉ dùng liên kết"}
                  </FormHelperText>
                </FormControl>
                <Box className="home-category-manager__visibility">
                  <FormControlLabel
                    control={(
                      <Switch
                        size="small"
                        checked={item.showSidebar}
                        onChange={(event) => updateItem(index, "showSidebar", event.target.checked)}
                      />
                    )}
                    label="Menu trái"
                  />
                  <FormControlLabel
                    control={(
                      <Switch
                        size="small"
                        checked={item.showQuick}
                        onChange={(event) => updateItem(index, "showQuick", event.target.checked)}
                      />
                    )}
                    label="Danh mục ngang"
                  />
                </Box>
              </Box>
            </Box>
          </Paper>
        ))}
      </Stack>

      {config.items.length === 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Chưa có danh mục nào. Hãy thêm mới hoặc nạp từ danh sách loại sản phẩm.
        </Alert>
      )}

      <Box className="home-category-manager__actions">
        <Button variant="outlined" onClick={resetFromTypes}>Nạp từ loại sản phẩm</Button>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={addItem}>Thêm danh mục</Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={saveConfig}
          disabled={saving || uploadingIndex !== null}
        >
          {saving ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
      </Box>
    </Paper>
  );
};

export default HomeCategoryManager;
