import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./design/tokens.css";
import "./design/typography.css";
import "./design/motion.css";
import "./design/layout.css";
import "./design/reports.css";
import "./design/sites.css";
import "./design/money.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
