import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function setVh() {
  const vh = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", setVh);
  window.visualViewport.addEventListener("scroll", setVh);
}
window.addEventListener("resize", setVh);
setVh();

createRoot(document.getElementById("root")!).render(<App />);
