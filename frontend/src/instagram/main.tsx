import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import InstagramApp from "./InstagramApp";
import "../styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <InstagramApp />
    </MotionConfig>
  </StrictMode>,
);
