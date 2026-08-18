import { useState } from "react";
import OrderContext from "./ordercontext-core";

export const OrderProvider = ({ children }) => {
  const [orderChanged, setOrderChanged] = useState(false);

  return (
    <OrderContext.Provider value={{ orderChanged, setOrderChanged }}>
      {children}
    </OrderContext.Provider>
  );
};
