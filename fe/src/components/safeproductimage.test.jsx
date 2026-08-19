import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SafeProductImage from "./safeproductimage";
import { CUSTOMER_TEXT } from "../constants/customerText.js";

describe("SafeProductImage", () => {
  it("renders a native image with the requested source, label, and class", () => {
    render(
      <SafeProductImage
        src="/product.webp"
        alt="Product"
        className="product-image"
      />
    );

    const image = screen.getByRole("img", { name: "Product" });
    expect(image.tagName).toBe("IMG");
    expect(image).toHaveAttribute("src", "/product.webp");
    expect(image).toHaveAttribute("alt", "Product");
    expect(image).toHaveClass("product-image");
  });

  it("uses lazy loading and async decoding by default", () => {
    render(<SafeProductImage src="/product.webp" alt="Product" />);

    const image = screen.getByRole("img", { name: "Product" });
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("allows eager loading and high fetch priority", () => {
    render(
      <SafeProductImage
        src="/main-product.webp"
        alt="Main product"
        loading="eager"
        fetchPriority="high"
      />
    );

    const image = screen.getByRole("img", { name: "Main product" });
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("fetchpriority", "high");
  });

  it("does not render an image with an empty source", () => {
    render(
      <SafeProductImage src="" alt="Product without image" className="product-image" />
    );

    const placeholder = screen.getByRole("img", { name: "Product without image" });
    expect(placeholder.tagName).toBe("SPAN");
    expect(placeholder).toHaveClass("product-image");
  });

  it("uses the stored product-image translation for a missing alt", () => {
    render(<SafeProductImage />);

    expect(
      screen.getByRole("img", {
        name: CUSTOMER_TEXT.product_image_alt,
      })
    ).toBeInTheDocument();
  });

  it("replaces an image with an accessible placeholder after a load error", () => {
    render(
      <SafeProductImage src="/missing.webp" alt="Missing product" />
    );

    fireEvent.error(screen.getByRole("img", { name: "Missing product" }));

    const placeholder = screen.getByRole("img", { name: "Missing product" });
    expect(placeholder.tagName).toBe("SPAN");
  });

  it("resets the error state when the source changes", () => {
    const { rerender } = render(
      <SafeProductImage src="/missing.webp" alt="Product" />
    );
    fireEvent.error(screen.getByRole("img", { name: "Product" }));

    rerender(<SafeProductImage src="/replacement.webp" alt="Product" />);

    const replacement = screen.getByRole("img", { name: "Product" });
    expect(replacement.tagName).toBe("IMG");
    expect(replacement).toHaveAttribute("src", "/replacement.webp");
  });
});
