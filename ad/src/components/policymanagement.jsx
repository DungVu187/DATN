import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import toast from "react-hot-toast";
import {
  getStorefrontPolicies,
  updateStorefrontPolicies,
} from "../api/storefrontManagementApi";
import "./style/policymanagement.css";

const languages = [
  { key: "vi", label: "Tiếng Việt" },
  { key: "zh", label: "中文简体" },
  { key: "en", label: "English" },
];

const policyMeta = {
  purchase: { label: "Mua hàng", icon: ShoppingBagOutlinedIcon },
  warranty: { label: "Bảo hành & đổi trả", icon: VerifiedUserOutlinedIcon },
  shipping: { label: "Vận chuyển", icon: LocalShippingOutlinedIcon },
  privacy: { label: "Bảo mật", icon: LockOutlinedIcon },
};

const normalizeContent = (content = {}) => ({
  title: content.title || "",
  summary: content.summary || "",
  sections: (content.sections || []).map((section) => ({
    title: section.title || "",
    content: section.content || "",
  })),
});

const toEditablePolicies = (items = []) => items.map((policy) => {
  const vietnamese = normalizeContent(policy.translations?.vi || policy);
  return {
    key: policy.key,
    translations: {
      vi: vietnamese,
      zh: normalizeContent(policy.translations?.zh || vietnamese),
      en: normalizeContent(policy.translations?.en || vietnamese),
    },
    updatedAt: policy.updatedAt,
  };
});

const toPayload = (items) => items.map(({ key, translations }) => ({
  key,
  title: translations.vi.title,
  summary: translations.vi.summary,
  sections: translations.vi.sections,
  translations,
}));

const PolicyManagement = () => {
  const [policies, setPolicies] = useState([]);
  const [selectedKey, setSelectedKey] = useState("purchase");
  const [selectedLanguage, setSelectedLanguage] = useState("vi");
  const [savedValue, setSavedValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        const response = await getStorefrontPolicies();
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Không thể tải chính sách");
        }

        const editablePolicies = toEditablePolicies(result.data);
        setPolicies(editablePolicies);
        setSavedValue(JSON.stringify(toPayload(editablePolicies)));
        if (!editablePolicies.some((policy) => policy.key === selectedKey)) {
          setSelectedKey(editablePolicies[0]?.key || "purchase");
        }
      } catch (error) {
        console.error("Error fetching policies:", error);
        toast.error(error.message || "Đã xảy ra lỗi khi tải chính sách");
      } finally {
        setLoading(false);
      }
    };

    fetchPolicies();
  }, []);

  const selectedPolicy = policies.find((policy) => policy.key === selectedKey);
  const selectedContent = selectedPolicy?.translations?.[selectedLanguage];
  const currentValue = useMemo(() => JSON.stringify(toPayload(policies)), [policies]);
  const hasChanges = Boolean(savedValue && currentValue !== savedValue);

  const updatePolicy = (field, value) => {
    setPolicies((current) => current.map((policy) => (
      policy.key === selectedKey
        ? {
            ...policy,
            translations: {
              ...policy.translations,
              [selectedLanguage]: {
                ...policy.translations[selectedLanguage],
                [field]: value,
              },
            },
          }
        : policy
    )));
  };

  const updateSection = (sectionIndex, field, value) => {
    setPolicies((current) => current.map((policy) => {
      if (policy.key !== selectedKey) return policy;
      const content = policy.translations[selectedLanguage];
      return {
        ...policy,
        translations: {
          ...policy.translations,
          [selectedLanguage]: {
            ...content,
            sections: content.sections.map((section, index) => (
              index === sectionIndex ? { ...section, [field]: value } : section
            )),
          },
        },
      };
    }));
  };

  const addSection = () => {
    if (!selectedContent || selectedContent.sections.length >= 20) return;
    setPolicies((current) => current.map((policy) => {
      if (policy.key !== selectedKey) return policy;
      const content = policy.translations[selectedLanguage];
      return {
        ...policy,
        translations: {
          ...policy.translations,
          [selectedLanguage]: {
            ...content,
            sections: [...content.sections, { title: "", content: "" }],
          },
        },
      };
    }));
  };

  const removeSection = (sectionIndex) => {
    if (!selectedContent || selectedContent.sections.length === 1) {
      toast.error("Mỗi bản ngôn ngữ cần ít nhất một nội dung");
      return;
    }
    setPolicies((current) => current.map((policy) => {
      if (policy.key !== selectedKey) return policy;
      const content = policy.translations[selectedLanguage];
      return {
        ...policy,
        translations: {
          ...policy.translations,
          [selectedLanguage]: {
            ...content,
            sections: content.sections.filter((_, index) => index !== sectionIndex),
          },
        },
      };
    }));
  };

  const validatePolicies = () => {
    for (const policy of policies) {
      for (const language of languages) {
        const content = policy.translations[language.key];
        if (!content.title.trim()) {
          return `Vui lòng nhập tiêu đề ${language.label} cho ${policyMeta[policy.key]?.label}`;
        }
        if (!content.sections.length) {
          return `Chính sách ${policyMeta[policy.key]?.label} (${language.label}) cần ít nhất một nội dung`;
        }
        if (content.sections.some((section) => !section.title.trim() || !section.content.trim())) {
          return `Vui lòng nhập đủ tiêu đề và nội dung ${language.label} trong ${policyMeta[policy.key]?.label}`;
        }
      }
    }
    return "";
  };

  const savePolicies = async () => {
    const validationMessage = validatePolicies();
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setSaving(true);
    try {
      const response = await updateStorefrontPolicies(toPayload(policies));
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Không thể lưu chính sách");
      }

      const editablePolicies = toEditablePolicies(result.data);
      setPolicies(editablePolicies);
      setSavedValue(JSON.stringify(toPayload(editablePolicies)));
      toast.success("Đã cập nhật chính sách ba ngôn ngữ phía khách hàng");
    } catch (error) {
      console.error("Error saving policies:", error);
      toast.error(error.message || "Đã xảy ra lỗi khi lưu chính sách");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Box className="policy-admin-loading"><CircularProgress size={36} /></Box>;
  }

  return (
    <Box className="policy-admin-page">
      <header className="policy-admin-header">
        <Box>
          <span className="policy-admin-eyebrow"><PolicyOutlinedIcon /> Quản lý trang chủ</span>
          <Typography component="h1">Chính sách khách hàng</Typography>
          <Typography component="p">
            Chỉnh sửa riêng nội dung Tiếng Việt, Trung giản thể và Tiếng Anh hiển thị phía khách hàng.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />}
          onClick={savePolicies}
          disabled={saving || !hasChanges}
        >
          {saving ? "Đang lưu" : "Lưu thay đổi"}
        </Button>
      </header>

      <div className="policy-admin-layout">
        <Paper className="policy-admin-nav" variant="outlined">
          <Typography component="h2">Danh mục chính sách</Typography>
          <div className="policy-admin-nav-list">
            {policies.map((policy) => {
              const meta = policyMeta[policy.key] || {};
              const Icon = meta.icon || PolicyOutlinedIcon;
              const vietnameseContent = policy.translations.vi;
              return (
                <button
                  type="button"
                  key={policy.key}
                  className={policy.key === selectedKey ? "is-active" : ""}
                  onClick={() => setSelectedKey(policy.key)}
                >
                  <span><Icon /></span>
                  <span>
                    <strong>{meta.label || vietnameseContent.title}</strong>
                    <small>{vietnameseContent.sections.length} nội dung</small>
                  </span>
                </button>
              );
            })}
          </div>
        </Paper>

        {selectedPolicy && selectedContent && (
          <Paper className="policy-admin-editor" variant="outlined">
            <div className="policy-admin-editor-heading">
              <Box>
                <Typography component="h2">{policyMeta[selectedPolicy.key]?.label}</Typography>
                <Typography component="p">Mã cố định: {selectedPolicy.key}</Typography>
              </Box>
              <span>{selectedContent.sections.length}/20 mục</span>
            </div>

            <div className="policy-admin-language-tabs" role="tablist" aria-label="Ngôn ngữ chính sách">
              {languages.map((language) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedLanguage === language.key}
                  className={selectedLanguage === language.key ? "is-active" : ""}
                  key={language.key}
                  onClick={() => setSelectedLanguage(language.key)}
                >
                  {language.label}
                </button>
              ))}
            </div>

            <div className="policy-admin-fields">
              <TextField
                label={`Tiêu đề hiển thị · ${languages.find((item) => item.key === selectedLanguage)?.label}`}
                value={selectedContent.title}
                onChange={(event) => updatePolicy("title", event.target.value)}
                fullWidth
                inputProps={{ maxLength: 150 }}
              />
              <TextField
                label="Mô tả ngắn"
                value={selectedContent.summary}
                onChange={(event) => updatePolicy("summary", event.target.value)}
                multiline
                minRows={2}
                fullWidth
                inputProps={{ maxLength: 500 }}
              />
            </div>

            <div className="policy-admin-section-heading">
              <Box>
                <Typography component="h3">Nội dung chi tiết</Typography>
                <Typography component="p">Mỗi mục sẽ hiển thị thành một hàng mở rộng phía khách hàng.</Typography>
              </Box>
              <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addSection}>
                Thêm nội dung
              </Button>
            </div>

            <div className="policy-admin-sections">
              {selectedContent.sections.map((section, sectionIndex) => (
                <Paper className="policy-admin-section" variant="outlined" key={`${selectedKey}-${selectedLanguage}-${sectionIndex}`}>
                  <div className="policy-admin-section-index">
                    <span>Nội dung {String(sectionIndex + 1).padStart(2, "0")}</span>
                    <IconButton
                      aria-label={`Xóa nội dung ${sectionIndex + 1}`}
                      color="error"
                      onClick={() => removeSection(sectionIndex)}
                      disabled={selectedContent.sections.length === 1}
                    >
                      <DeleteOutlineRoundedIcon />
                    </IconButton>
                  </div>
                  <TextField
                    label="Tiêu đề mục"
                    value={section.title}
                    onChange={(event) => updateSection(sectionIndex, "title", event.target.value)}
                    fullWidth
                    inputProps={{ maxLength: 150 }}
                  />
                  <TextField
                    label="Nội dung"
                    value={section.content}
                    onChange={(event) => updateSection(sectionIndex, "content", event.target.value)}
                    multiline
                    minRows={4}
                    fullWidth
                    inputProps={{ maxLength: 5000 }}
                  />
                </Paper>
              ))}
            </div>
          </Paper>
        )}
      </div>
    </Box>
  );
};

export default PolicyManagement;
