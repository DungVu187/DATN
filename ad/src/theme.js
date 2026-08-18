import { createTheme, alpha } from "@mui/material/styles";

const colors = {
  navy: "#183B56",
  primary: "#1473E6",
  background: "#F4F7FB",
  border: "#E5EAF0",
  text: "#172B4D",
  muted: "#64748B",
  success: "#2E9B45",
  error: "#E53935",
  warning: "#F58220",
};

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: colors.primary, dark: "#0E5FC0" },
    secondary: { main: colors.muted },
    success: { main: colors.success },
    error: { main: colors.error },
    warning: { main: colors.warning },
    info: { main: "#0284C7" },
    background: { default: colors.background, paper: "#FFFFFF" },
    text: { primary: colors.text, secondary: colors.muted },
    divider: colors.border,
  },
  shape: { borderRadius: 7 },
  spacing: 8,
  typography: {
    fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
    fontSize: 13,
    h4: { fontSize: "1.25rem", lineHeight: 1.35, fontWeight: 650, letterSpacing: "-0.02em" },
    h5: { fontSize: "1.125rem", lineHeight: 1.4, fontWeight: 650, letterSpacing: "-0.015em" },
    h6: { fontSize: "1rem", lineHeight: 1.45, fontWeight: 650 },
    button: { fontSize: "0.8125rem", fontWeight: 600, letterSpacing: 0, textTransform: "none" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: colors.background,
          color: colors.text,
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
        "*": { boxSizing: "border-box" },
        "*::selection": { backgroundColor: alpha(colors.primary, 0.18) },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: "none" },
        rounded: { borderRadius: 12 },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          boxShadow: "0 2px 10px rgba(16, 42, 67, 0.045)",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 38,
          borderRadius: 7,
          paddingInline: 14,
          boxShadow: "none",
          transition: "background-color 160ms ease, border-color 160ms ease, transform 120ms ease",
          "&:active": { transform: "translateY(1px)" },
          "&:focus-visible": { outline: `3px solid ${alpha(colors.primary, 0.22)}`, outlineOffset: 2 },
        },
        sizeSmall: { minHeight: 34, paddingInline: 12 },
        contained: {
          boxShadow: "0 1px 2px rgba(16, 42, 67, 0.08)",
          "&:hover": { boxShadow: "0 2px 6px rgba(16, 42, 67, 0.12)" },
        },
        outlined: {
          backgroundColor: "rgba(255, 255, 255, 0.72)",
          borderColor: "#CBD7E3",
          "&:hover": { backgroundColor: alpha(colors.primary, 0.035) },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: 40,
          borderRadius: 7,
          backgroundColor: "#FFFFFF",
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "#D9E2EC" },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#B8C7D6" },
          "&.Mui-focused": { boxShadow: `0 0 0 3px ${alpha(colors.primary, 0.08)}` },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderWidth: 1.25 },
          "&.MuiInputBase-multiline": { minHeight: 72, alignItems: "flex-start" },
        },
        inputSizeSmall: { paddingTop: 9.5, paddingBottom: 9.5 },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { color: colors.muted } } },
    MuiFormControl: { defaultProps: { size: "small" } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          boxShadow: "0 2px 10px rgba(16, 42, 67, 0.045)",
          backgroundColor: "#FFFFFF",
        },
      },
    },
    MuiTableHead: {
      styleOverrides: { root: { backgroundColor: "#F8FAFC" } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${colors.border}`, color: colors.text },
        head: { backgroundColor: "#F8FAFC", color: colors.text, fontWeight: 650, whiteSpace: "nowrap" },
      },
    },
    MuiTableRow: {
      styleOverrides: { root: { "&.MuiTableRow-hover:hover": { backgroundColor: "#F7FBFF" } } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 20px 56px rgba(16, 42, 67, 0.18)",
          maxHeight: "calc(100dvh - 48px)",
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { padding: "16px 20px", fontSize: "1.125rem", fontWeight: 650, borderBottom: `1px solid ${colors.border}` } },
    },
    MuiDialogContent: { styleOverrides: { root: { padding: "16px 20px" } } },
    MuiDialogActions: {
      styleOverrides: { root: { padding: "12px 20px", borderTop: `1px solid ${colors.border}`, backgroundColor: "#FFFFFF" } },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 6, fontWeight: 600 }, sizeSmall: { height: 26 } } },
    MuiCheckbox: { styleOverrides: { root: { padding: 6 } } },
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 7 },
        switchBase: {
          transition: "transform 190ms cubic-bezier(0.4, 0, 0.2, 1), color 160ms ease",
          "&.Mui-checked": {
            "& + .MuiSwitch-track": { opacity: 1 },
          },
        },
        thumb: {
          boxShadow: "0 1px 3px rgba(16, 42, 67, 0.22)",
          transition: "box-shadow 160ms ease",
        },
        track: {
          borderRadius: 12,
          backgroundColor: "#B8C4D1",
          opacity: 1,
          transition: "background-color 190ms ease, opacity 190ms ease",
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: { marginTop: 8, border: `1px solid ${colors.border}`, borderRadius: 10, backgroundColor: "#FFFFFF" },
        toolbar: { minHeight: 48 },
      },
    },
  },
});

export { colors };
export default theme;
