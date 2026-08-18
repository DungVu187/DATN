import { useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import LinkIcon from "@mui/icons-material/Link";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import toast from "react-hot-toast";
import { uploadProductDocument } from "../api/productManagementApi";
import "./style/producttechdocs.css";
const MAX_PDF_SIZE = 20 * 1024 * 1024;
export const MAX_PRODUCT_DOCUMENTS = 5;

const isValidHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const ProductTechDocs = ({ value = [], onChange, disabled = false }) => {
  const [urlInput, setUrlInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const documents = Array.isArray(value) ? value : [];
  const hasReachedDocumentLimit = documents.length >= MAX_PRODUCT_DOCUMENTS;

  const showDocumentLimitError = () => {
    toast.error(`Chỉ được thêm tối đa ${MAX_PRODUCT_DOCUMENTS} tài liệu kỹ thuật`);
  };

  const handleAddLink = () => {
    if (hasReachedDocumentLimit) {
      showDocumentLimitError();
      return;
    }

    const url = urlInput.trim();
    if (!isValidHttpUrl(url)) {
      toast.error("Vui lòng nhập đường dẫn http hoặc https hợp lệ");
      return;
    }

    onChange([...documents, { label: "", url, sourceType: "link" }]);
    setUrlInput("");
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (hasReachedDocumentLimit) {
      showDocumentLimitError();
      return;
    }

    const isPdf = file.type === "application/pdf" && file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.error("Chỉ cho phép upload file PDF");
      return;
    }
    if (file.size > MAX_PDF_SIZE) {
      toast.error("Dung lượng file tối đa 20MB");
      return;
    }

    setIsUploading(true);

    try {
      const data = await uploadProductDocument(file);

      onChange([
        ...documents,
        { label: data.fileName || file.name, url: data.url, sourceType: "file" },
      ]);
    } catch (error) {
      toast.error(error.message || "Không thể upload file PDF");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = (index) => {
    onChange(documents.filter((_, documentIndex) => documentIndex !== index));
  };

  return (
    <Box className="product-tech-docs">
      <Typography component="h3" className="product-tech-docs__title">
        Tài liệu kỹ thuật
      </Typography>

      <Box className="product-tech-docs__controls">
        <TextField
          label="Đường dẫn tài liệu"
          type="url"
          size="small"
          fullWidth
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAddLink();
            }
          }}
          disabled={disabled || hasReachedDocumentLimit || isUploading}
        />
        <Button
          type="button"
          variant="outlined"
          startIcon={<LinkIcon />}
          onClick={handleAddLink}
          disabled={disabled || hasReachedDocumentLimit || isUploading || !urlInput.trim()}
        >
          Thêm link
        </Button>
        <Button
          type="button"
          variant="contained"
          startIcon={<UploadFileIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || hasReachedDocumentLimit || isUploading}
        >
          {isUploading ? "Đang upload" : "Upload PDF"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={handleUpload}
          disabled={disabled || hasReachedDocumentLimit || isUploading}
        />
      </Box>

      <Box className="product-tech-docs__list" aria-live="polite">
        {documents.length === 0 ? (
          <Typography className="product-tech-docs__empty">
            Chưa có tài liệu kỹ thuật.
          </Typography>
        ) : (
          documents.map((document, index) => {
            const isFile = document.sourceType === "file";
            const displayName = document.label?.trim() || document.url;

            return (
              <Box className="product-tech-docs__row" key={document._id || `${document.url}-${index}`}>
                <Box className="product-tech-docs__identity">
                  {isFile ? <InsertDriveFileOutlinedIcon /> : <LinkIcon />}
                  <a href={document.url} target="_blank" rel="noreferrer" title={displayName}>
                    {displayName}
                  </a>
                </Box>
                <Chip size="small" label={isFile ? "PDF" : "Link"} variant="outlined" />
                <IconButton
                  type="button"
                  size="small"
                  aria-label={`Xóa ${displayName}`}
                  onClick={() => handleRemove(index)}
                  disabled={disabled}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
};

export default ProductTechDocs;
