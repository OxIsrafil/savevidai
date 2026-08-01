// Browser entry for /hi/ (twitter/X home page). Same mount as src/main.tsx: the only difference
// is the string table handed to the app, which carries the locale copy and the "/hi" href prefix
// every internal link is built from.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "../App";
import { hiTwitter } from "../locales/hi";
import "../styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App strings={hiTwitter} />
    </MotionConfig>
  </StrictMode>,
);
