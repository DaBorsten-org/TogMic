import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";
import "@/i18n";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Blockiere das Kontextmenü global
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});
