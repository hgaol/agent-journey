import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { initializeLocalAuth, localHostUrl } from "./api.js";
import { router } from "./router.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1 }
  }
});

async function start(): Promise<void> {
  const root = createRoot(document.getElementById("root")!);
  try {
    await initializeLocalAuth();
    root.render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} context={{ queryClient }} />
        </QueryClientProvider>
      </React.StrictMode>
    );
  } catch (error) {
    root.render(
      <main className="fatal-screen">
        <div className="brand-orbit">AJ</div>
        <h1>Local authorization required</h1>
        <p>{error instanceof Error ? error.message : "Open AgentJourney from the host URL."}</p>
        <a className="primary-button" href={localHostUrl()}>Open through the AgentJourney host</a>
      </main>
    );
  }
}

void start();
