import { useContext } from "react";
import OrderContext from "./ordercontext-core";

export const useOrderContext = () => useContext(OrderContext);
