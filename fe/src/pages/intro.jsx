import React, { useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useLanguage } from "../context/languagecontext.jsx";
import { getLocalizedText } from "../utils/localizedcontent";
import { getStorefrontContent } from "../api/storefrontCatalogApi";

const Intro = () => {
  const { t, language } = useLanguage();
  const [manageData, setManageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchIntroduction = async () => {
      try {
        const response = await getStorefrontContent({
          headers: { "Content-Type": "application/json" },
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error("Unable to load introduction");
        setManageData(result.data);
      } catch (fetchError) {
        console.error("Error fetching introduction:", fetchError);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchIntroduction();
  }, []);

  const introduction = useMemo(() => getLocalizedText(
    manageData?.introductionTranslations,
    language,
    manageData?.introduction || ""
  ), [language, manageData]);

  const formatIntroduction = (text) => {
    if (!text) return <Typography>{t("introduction_empty")}</Typography>;
    const paragraphs = text.split("\n").filter((line) => line.trim() !== "");

    return paragraphs.map((paragraph, index) => {
      const isHeading = /^\d+\.\s/.test(paragraph.trim());
      return (
        <Typography
          key={`${index}-${paragraph.slice(0, 20)}`}
          variant="body1"
          sx={{
            fontWeight: isHeading ? "bold" : "normal",
            textIndent: isHeading ? 0 : "2rem",
            marginBottom: "1rem",
            lineHeight: 1.8,
          }}
        >
          {paragraph}
        </Typography>
      );
    });
  };

  return (
    <main
      style={{
        width: "100%",
        backgroundColor: "rgb(235, 246, 254)",
        minHeight: "500px",
        display: "flex",
      }}
    >
      <Box
        sx={{
          maxWidth: "1200px",
          width: { xs: "calc(100% - 24px)", md: "80%" },
          padding: { xs: 2.5, md: 4 },
          backgroundColor: "white",
          margin: "2rem auto",
          borderRadius: "10px",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.08)",
        }}
      >
        <Typography variant="h4" gutterBottom align="center" sx={{ fontWeight: 700, mb: 3 }}>
          {t("introduction")}
        </Typography>
        {loading ? (
          <Typography align="center">{t("loading_introduction")}</Typography>
        ) : error ? (
          <Typography align="center" color="error">{t("introduction_load_error")}</Typography>
        ) : (
          <Box>{formatIntroduction(introduction)}</Box>
        )}
      </Box>
    </main>
  );
};

export default Intro;
