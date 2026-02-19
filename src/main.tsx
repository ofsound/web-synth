import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Workstation from "./Workstation";
import { AudioContextProvider } from "./context/AudioContextProvider";
import { MidiBusProvider } from "./midi/MidiBusProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioContextProvider>
      <MidiBusProvider>
        <Workstation />
      </MidiBusProvider>
    </AudioContextProvider>
  </StrictMode>,
);
