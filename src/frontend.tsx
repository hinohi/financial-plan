/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PlanProvider } from "@/state/plan-store";
import { App } from "./App";

const elem = document.getElementById("root");
if (!elem) throw new Error("root element not found");
const app = (
  <StrictMode>
    <PlanProvider>
      <App />
    </PlanProvider>
  </StrictMode>
);

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  const hotData = import.meta.hot.data;
  if (!hotData.root) {
    hotData.root = createRoot(elem);
  }
  hotData.root.render(app);
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(app);
}
