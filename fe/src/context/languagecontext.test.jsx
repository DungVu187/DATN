import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider, useLanguage } from "./languagecontext.jsx";

const LanguageConsumer = () => {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div>
      <output data-testid="language">{language}</output>
      <output data-testid="cart-label">{t("cart")}</output>
      <output data-testid="database-value">{t("Máy trộn bê tông TT-01")}</output>
      <button type="button" onClick={() => setLanguage("zh")}>zh</button>
      <button type="button" onClick={() => setLanguage("en")}>en</button>
    </div>
  );
};

describe("LanguageProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("switches between Vietnamese, Simplified Chinese, and English", () => {
    render(
      <LanguageProvider>
        <LanguageConsumer />
      </LanguageProvider>
    );

    expect(screen.getByTestId("language")).toHaveTextContent("vi");
    expect(screen.getByTestId("cart-label")).toHaveTextContent("Giỏ hàng");

    fireEvent.click(screen.getByRole("button", { name: "zh" }));
    expect(screen.getByTestId("language")).toHaveTextContent("zh");
    expect(screen.getByTestId("cart-label")).toHaveTextContent("购物车");

    fireEvent.click(screen.getByRole("button", { name: "en" }));
    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(screen.getByTestId("cart-label")).toHaveTextContent("Cart");
    expect(localStorage.getItem("language")).toBe("en");
    expect(screen.getByTestId("database-value")).toHaveTextContent("Máy trộn bê tông TT-01");
  });

  test("restores the saved language on reload", () => {
    localStorage.setItem("language", "zh");

    render(
      <LanguageProvider>
        <LanguageConsumer />
      </LanguageProvider>
    );

    expect(screen.getByTestId("language")).toHaveTextContent("zh");
    expect(screen.getByTestId("cart-label")).toHaveTextContent("购物车");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
