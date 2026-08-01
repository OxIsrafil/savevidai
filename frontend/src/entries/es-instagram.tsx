// Browser entry for /es/instagramvideodownloader (Instagram page). Same mount as src/main.tsx:
// the only difference is the string table handed to the app, which carries the locale copy and
// the "/es" href prefix every internal link is built from.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import InstagramApp from "../instagram/InstagramApp";
import { esInstagram } from "../locales/es";
import "../styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <InstagramApp strings={esInstagram} />
    </MotionConfig>
  </StrictMode>,
);
