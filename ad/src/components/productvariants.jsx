
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardMedia,
  Typography,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Button,
  Autocomplete,
} from "@mui/material";
import toast from "react-hot-toast";
import { NumericFormat } from "react-number-format";
import { formatVariantPrice } from "../utils/productpricing";
const apiUrl = import.meta.env.VITE_API_URL;

const ProductVariants = ({ variants }) => {
  const { productId } = useParams();
  const [open, setOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(null);
  const [colors, setColors] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [frames, setFrames] = useState([]);
  const [buttonCount, setButtonCount] = useState([]);
  const [quantity, setQuantity] = useState("");

  const handleUpdateQuantity = async () => {
    try {
      const response = await fetch(
        `${apiUrl}/products/${productId}/${selectedVariantIndex}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quantity }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update quantity");
      }
      alert("cập nhật số lượng thành công");
      setQuantity("");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to update quantity");
    }
  };

  const handleClickOpen = (variant, index) => {
    setSelectedVariant({ ...variant });
    setSelectedVariantIndex(index);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedVariant(null);
    setSelectedVariantIndex(null);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [chipResponse] = await Promise.all([
          fetch(`${apiUrl}/chips/getValues`),
        ]);
        if (chipResponse.ok) {
          const chipData = await chipResponse.json();
          setColors(chipData.Color);
          setShapes(chipData.Shapes);
          setFrames(chipData.Frames);
          setButtonCount(chipData.ButtonCount);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      }
    };
    fetchData();
  }, []);

  const handleSave = async () => {
    try {
      const response = await fetch(
        `${apiUrl}/products/${productId}/${selectedVariantIndex}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: 'include',
          body: JSON.stringify(selectedVariant),
        }
      );
      if (response.ok) {
        alert("Cập nhật thành công");
        window.location.reload();
      } else {
        alert("Cập nhật thất bại");
      }
    } catch (error) {
      console.error("Error saving variant:", error);
      alert("Error saving variant.");
    }
  };

  const handleDelete = async () => {
    const confirmDelete = window.confirm("Bạn có chắc muốn xóa mục này");
    if (!confirmDelete) {
      return;
    }
    try {
      const response = await fetch(
        `${apiUrl}/products/${productId}/${selectedVariantIndex}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: 'include',
          body: JSON.stringify(selectedVariant),
        }
      );
      if (response.ok) {
        toast.success("Xóa thành công");
        handleClose();
      } else {
        toast.error("Xóa thất bại");
      }
    } catch (error) {
      console.error("Error deleting variant:", error);
      toast.error("Error deleting variant.");
    }
  };

  const handleChange = (event, newValue, field) => {
    setSelectedVariant({
      ...selectedVariant,
      [field]: newValue || event.target.value,
    });
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        justifyContent: "center",
        mt: 2,
      }}
    >
      {variants.map((variant, index) => {
        const variantString = [variant.color, variant.shape, variant.buttonCount, variant.frame]
  .filter(Boolean)
  .join(" + ");
        return (
          <Card
            key={index}
            sx={{
              maxWidth: 250,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              border: "1px solid #ccc",
              boxShadow: 2,
              cursor: "pointer",
              width: "200px",
            }}
            onClick={() => handleClickOpen(variant, index)}
          >
            {variant.imgUrl && (
              <CardMedia
                component="img"
                height="140"
                image={variant.imgUrl}
                alt={`Image of variant ${index}`}
              />
            )}
            <CardContent>
              <Typography variant="body1" gutterBottom>
                {variantString}
              </Typography>
              <Typography variant="subtitle1" color="text.secondary">
                Giá: {formatVariantPrice(variant)}
              </Typography>
            </CardContent>
          </Card>
        );
      })}
      <Dialog open={open} onClose={handleClose} disableScrollLock>
        <DialogTitle>Variant Details</DialogTitle>
        <DialogContent>
          {selectedVariant && (
            <>
              {selectedVariant.imgUrl && (
                <CardMedia
                  component="img"
                  height="100px"
                  image={selectedVariant.imgUrl}
                  alt="Variant image"
                  sx={{ marginBottom: 2 }}
                />
              )}
              <Autocomplete
                value={selectedVariant.color || ""}
                options={colors}
                onChange={(e, newValue) => handleChange(e, newValue, "color")}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Màu sắc"
                    margin="normal"
                    size="small"
                    fullWidth
                  />
                )}
              />
              <Autocomplete
                value={selectedVariant.shape || ""}
                options={shapes}
                onChange={(e, newValue) => handleChange(e, newValue, "shape")}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Dáng"
                    margin="normal"
                    size="small"
                    fullWidth
                  />
                )}
              />
              <Autocomplete
                value={selectedVariant.buttonCount || ""}
                options={buttonCount}
                onChange={(e, newValue) =>
                  handleChange(e, newValue, "buttonCount")
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Số nút"
                    margin="normal"
                    size="small"
                    fullWidth
                  />
                )}
              />
              <Autocomplete
                value={selectedVariant.frame || ""}
                options={frames}
                onChange={(e, newValue) => handleChange(e, newValue, "frame")}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Viền"
                    margin="normal"
                    size="small"
                    fullWidth
                  />
                )}
              />
              <NumericFormat
                label="Giá"
                value={selectedVariant.price}
                customInput={TextField}
                thousandSeparator="."
                decimalSeparator=","
                onValueChange={(values) => {
                  setSelectedVariant((prev) => ({
                    ...prev,
                    price: values.value, // Lưu giá trị không có dấu chấm
                  }));
                }}
                fullWidth
                margin="normal"
                variant="outlined"
                size="small"
              />
              <TextField
                label="Số lượng đang bán"
                value={selectedVariant.quantityForSale || ""}
                onChange={(e) =>
                  handleChange(e, e.target.value, "quantityForSale")
                }
                fullWidth
                margin="normal"
                variant="outlined"
                size="small"
              />
              <TextField
                label="Số lượng còn trong kho"
                value={selectedVariant.quantityInStorage || ""}
                onChange={(e) =>
                  handleChange(e, e.target.value, "quantityInStorage")
                }
                fullWidth
                margin="normal"
                variant="outlined"
                size="small"
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <TextField
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  label="Nhập số lượng"
                  size="small"
                  sx={{ marginRight: "10px" }}
                />
                <Button
                  onClick={handleUpdateQuantity}
                  color="primary"
                  variant="contained"
                >
                  Nhập
                </Button>
              </div>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSave} color="success" variant="contained">
            Lưu
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Xóa
          </Button>
          <Button onClick={handleClose} color="primary" variant="contained">
            Hủy
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProductVariants;
