import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";

export default function App() {
  return (
    <div className="bg-surface text-text flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense
          fallback={
            <div className="text-text-muted flex h-full items-center justify-center">
              Loading…
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
