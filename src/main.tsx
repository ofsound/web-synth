import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App";
import Home from "./pages/Home";
import { AudioContextProvider } from "./context/AudioContextProvider";
import { sections } from "./routes";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AudioContextProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}>
            <Route index element={<Home />} />
            {sections.map((section) =>
              section.routes.map((route) => (
                <Route
                  key={route.path}
                  path={`${section.basePath}/${route.path}`}
                  element={<route.element />}
                />
              )),
            )}
          </Route>
        </Routes>
      </BrowserRouter>
    </AudioContextProvider>
  </StrictMode>,
);
