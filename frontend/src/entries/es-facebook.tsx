// Browser entry for /es/facebookvideodownloader (Facebook page). Same mount as src/main.tsx: the
// only difference is the string table handed to the app, which carries the locale copy and the
// "/es" href prefix every internal link is built from.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import FacebookApp from "../facebook/FacebookApp";
import { esFacebook } from "../locales/es";
import "../styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <FacebookApp strings={esFacebook} />
    </MotionConfig>
  </StrictMode>,
);
