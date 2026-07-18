import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Admin } from "./Admin";
import "../styles/index.css";

createRoot(document.getElementById("admin-root")!).render(
  <StrictMode>
    <Admin />
  </StrictMode>,
);
