import React, { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

function ScrollRestoration({ children }) {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return <div className="page-transition">{children}</div>;
}

export default ScrollRestoration;
