
import { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Pagination,
  FormControl,
  Select,
  MenuItem,
  TextField,
  Button,
  Autocomplete,
} from "@mui/material";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import {
  getStorageHistory,
  getStorageHistoryFilterOptions,
} from "../api/adminAuditApi";

const importNoteTypeOptions = [
  { value: "", label: "Tất cả" },
  { value: "nhap_don", label: "Nhập kho theo đơn" },
  { value: "nhap_thu_cong", label: "Nhập kho thủ công" },
  { value: "nhap_ai", label: "Nhập đơn quét AI" },
  { value: "order_line_manual", label: "Trong đơn - gõ tay" },
  { value: "order_line_complete", label: "Trong đơn - tích hoàn thành SP" },
  { value: "order_bulk_complete", label: "Trong đơn - hoàn thành cả đơn" },
];

const exportNoteTypeOptions = [
  { value: "", label: "Tất cả" },
  { value: "xuat_don", label: "Xuất kho theo đơn" },
  { value: "xuat_thu_cong", label: "Xuất kho thủ công" },
  { value: "xuat_ai", label: "Xuất đơn quét AI" },
  { value: "order_line_manual", label: "Trong đơn - gõ tay" },
  { value: "order_line_complete", label: "Trong đơn - tích hoàn thành SP" },
  { value: "order_bulk_complete", label: "Trong đơn - hoàn thành cả đơn" },
  { value: "ban_online", label: "Đơn hàng bán online" },
];

const removeVietnameseTones = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
};

const getHistoryLabel = (row) => {
  const isImport = row.quantity > 0;

  // Quét AI luôn ưu tiên nhãn quét AI, không dán kèm nhãn khác dù có source gì.
  if (row.isAIScan) {
    return isImport ? "Nhập đơn quét AI" : "Xuất đơn quét AI";
  }

  switch (row.source) {
    case "order_line_manual":
      return isImport ? "Nhập kho (gõ tay trong đơn)" : "Xuất kho (gõ tay trong đơn)";
    case "order_line_complete":
      return isImport ? "Nhập kho (tích hoàn thành SP)" : "Xuất kho (tích hoàn thành SP)";
    case "order_bulk_complete":
      return isImport ? "Nhập kho (hoàn thành cả đơn)" : "Xuất kho (hoàn thành cả đơn)";
    case "product_manual":
      return isImport ? "Nhập kho thủ công" : "Xuất kho thủ công";
    case "online_sale":
      return "Đơn hàng bán online";
    case "online_sale_revert":
      return "Hoàn tác đơn bán online";
    default:
      return row.note
        ? row.note
        : row.orderId
        ? isImport
          ? "Nhập kho theo đơn"
          : "Xuất kho theo đơn"
        : isImport
        ? "Nhập kho thủ công"
        : "Xuất kho thủ công";
  }
};

const History = ({ direction = "import" }) => {
  const historyDirection = direction === "export" ? "export" : "import";
  const noteTypeOptions = historyDirection === "export"
    ? exportNoteTypeOptions
    : importNoteTypeOptions;
  const [histories, setHistories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit, setLimit] = useState(20);

  // bộ lọc
  const [userName, setUserName] = useState("");
  const [orderName, setOrderName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [noteType, setNoteType] = useState("");

  // debounced values cho tìm kiếm chữ
  const [debouncedUserName, setDebouncedUserName] = useState("");
  const [debouncedOrderName, setDebouncedOrderName] = useState("");
  const [filterOptions, setFilterOptions] = useState({
    userNames: [],
    orderNames: [],
  });

  const navigate = useNavigate();

  // Debounce hiệu ứng gõ phím
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedUserName(userName);
    }, 500);
    return () => clearTimeout(handler);
  }, [userName]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedOrderName(orderName);
    }, 500);
    return () => clearTimeout(handler);
  }, [orderName]);

  const fetchHistories = async (currentPage = page, currentUserName = debouncedUserName, currentOrderName = debouncedOrderName) => {
    try {
      setLoading(true);
      const res = await getStorageHistory({
        page: currentPage,
        limit,
        direction: historyDirection,
        ...(currentUserName && { userName: currentUserName }),
        ...(currentOrderName && { orderName: currentOrderName }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(noteType && { noteType }),
      });
      if (!res.ok) throw new Error("Lỗi khi tải dữ liệu lịch sử");
      const data = await res.json();
      setHistories(data.history || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Tự động gọi API khi bất kỳ bộ lọc hoặc trang nào thay đổi
  useEffect(() => {
    fetchHistories(page, debouncedUserName, debouncedOrderName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, startDate, endDate, noteType, debouncedUserName, debouncedOrderName, historyDirection]);

  const fetchFilterOptions = async () => {
    try {
      const res = await getStorageHistoryFilterOptions();
      if (!res.ok) throw new Error("Lỗi khi tải gợi ý lọc lịch sử");
      const data = await res.json();
      setFilterOptions({
        userNames: Array.isArray(data.userNames) ? data.userNames : [],
        orderNames: Array.isArray(data.orderNames) ? data.orderNames : [],
      });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  const handleResetFilters = () => {
    setUserName("");
    setOrderName("");
    setStartDate("");
    setEndDate("");
    setNoteType("");
    setPage(1);
  };

  return (
    <Box p={2} className="admin-list-page history-list-page">
      <div className="sticky-header">
        <Typography variant="h5" gutterBottom>
          {historyDirection === "export" ? "Lịch sử xuất kho" : "Lịch sử nhập kho"}
        </Typography>
      </div>

      {/* Bộ lọc */}
      <Box
        className="admin-list-controls"
        display="flex"
        flexWrap="wrap"
        alignItems="center"
        gap={2}
        mb={2}
      >
        <Autocomplete
          freeSolo
          size="small"
          options={filterOptions.userNames}
          value={userName}
          onInputChange={(event, newInputValue) => {
            setUserName(newInputValue);
            setPage(1);
          }}
          onChange={(event, newValue) => {
            setUserName(newValue || "");
            setPage(1);
          }}
          filterOptions={(options, state) => {
            const inputValue = removeVietnameseTones(state.inputValue);
            return options.filter((option) =>
              removeVietnameseTones(option).includes(inputValue)
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Người dùng"
              placeholder="Nhập tên..."
              variant="outlined"
              sx={{ width: 200 }}
            />
          )}
        />
        <Autocomplete
          freeSolo
          size="small"
          options={filterOptions.orderNames}
          value={orderName}
          onInputChange={(event, newInputValue) => {
            setOrderName(newInputValue);
            setPage(1);
          }}
          onChange={(event, newValue) => {
            setOrderName(newValue || "");
            setPage(1);
          }}
          filterOptions={(options, state) => {
            const inputValue = removeVietnameseTones(state.inputValue);
            return options.filter((option) =>
              removeVietnameseTones(option).includes(inputValue)
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Tên đơn hàng"
              placeholder="Nhập tên đơn hàng..."
              variant="outlined"
              sx={{ width: 200 }}
            />
          )}
        />
        <TextField
          label="Từ ngày"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="Đến ngày"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          select
          label="Ghi chú"
          value={noteType}
          onChange={(e) => {
            setNoteType(e.target.value);
            setPage(1);
          }}
          size="small"
          sx={{ width: "180px", minWidth: "150px" }}
          SelectProps={{ native: true }}
          InputLabelProps={{ shrink: true }}
        >
          {noteTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </TextField>
        <Button variant="outlined" color="secondary" onClick={handleResetFilters}>
          Xóa bộ lọc
        </Button>
        {!loading && histories.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 104, ml: { sm: "auto" } }}>
            <Select
              value={limit}
              onChange={(e) => {
                setLimit(e.target.value);
                setPage(1);
              }}
            >
              <MenuItem value={20}>20 dòng</MenuItem>
              <MenuItem value={50}>50 dòng</MenuItem>
              <MenuItem value={100}>100 dòng</MenuItem>
            </Select>
          </FormControl>
        )}
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress />
        </Box>
      ) : histories.length === 0 ? (
        <Typography>Không có dữ liệu lịch sử</Typography>
      ) : (
        <>
          <TableContainer component={Paper} className="admin-list-table" sx={{ overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell align="center">
                    <b>Người dùng</b>
                  </TableCell>
                  <TableCell align="center">
                    <b>Sản phẩm</b>
                  </TableCell>
                  <TableCell align="center">
                    <b>Đơn hàng</b>
                  </TableCell>
                  <TableCell align="center">
                    <b>Số lượng</b>
                  </TableCell>
                  <TableCell align="center">
                    <b>Ghi chú</b>
                  </TableCell>
                  <TableCell align="center">
                    <b>Thời gian</b>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {histories.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell align="center">{row.userName || ""}</TableCell>
                    <TableCell align="center">
                      {row.productName || ""}
                    </TableCell>
                    <TableCell align="center">
                      {row.orderId ? (
                        row.note && row.note.includes("bán online") ? (
                          <span>{row.orderName || row.orderId}</span>
                        ) : (
                          <span
                            style={{
                              cursor: "pointer",
                              color: "#1976d2",
                              textDecoration: "underline",
                            }}
                            onClick={() => {
                              if (row.quantity > 0) {
                                navigate(`/importorder/${row.orderId}`);
                              } else if (row.quantity < 0) {
                                navigate(`/exportorder/${row.orderId}`);
                              }
                            }}
                          >
                            {row.orderName || `Đơn hàng (#${row.orderId.slice(-6)})`}
                          </span>
                        )
                      ) : (
                        ""
                      )}
                    </TableCell>
                    <TableCell align="center">{row.quantity}</TableCell>
                    <TableCell align="center">
                      {getHistoryLabel(row)}
                    </TableCell>
                    <TableCell align="center">
                      {moment(row.createdAt).format("DD/MM/YYYY HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box display="flex" justifyContent="center" my={2}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(e, value) => setPage(value)}
              color="primary"
            />
          </Box>
        </>
      )}
    </Box>
  );
};

export const HistoryImport = () => <History direction="import" />;

export const HistoryExport = () => <History direction="export" />;

export default History;
