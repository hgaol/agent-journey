import { lazy, Suspense } from "react";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { useArchiveEvents } from "./hooks/useArchiveEvents.js";

const LibraryPage = lazy(async () => ({ default: (await import("./views/LibraryPage.js")).LibraryPage }));
const JourneyPage = lazy(async () => ({ default: (await import("./views/JourneyPage.js")).JourneyPage }));
const SourcesPage = lazy(async () => ({ default: (await import("./views/SourcesPage.js")).SourcesPage }));
const SettingsPage = lazy(async () => ({ default: (await import("./views/SettingsPage.js")).SettingsPage }));

function lazyRoute(element: React.ReactNode): React.ReactNode {
  return <Suspense fallback={<main className="page"><div className="loading">Loading local interface…</div></main>}>{element}</Suspense>;
}

interface RouterContext {
  queryClient: QueryClient;
}

function Shell(): React.ReactNode {
  useArchiveEvents();
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="brand-orbit">AJ</span>
          <span>
            <strong>AgentJourney</strong>
            <small>forensic replay platform</small>
          </span>
        </Link>
        <nav>
          <Link to="/" activeProps={{ className: "active" }}>Journeys</Link>
          <Link to="/sources" activeProps={{ className: "active" }}>Sources</Link>
          <Link to="/settings" activeProps={{ className: "active" }}>Settings</Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Shell });
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => lazyRoute(<LibraryPage />)
});
const sourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sources",
  component: () => lazyRoute(<SourcesPage />)
});
const journeyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/journeys/$journeyId",
  component: () => lazyRoute(<JourneyPage />)
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: () => lazyRoute(<SettingsPage />)
});
const routeTree = rootRoute.addChildren([libraryRoute, sourcesRoute, journeyRoute, settingsRoute]);

export const router = createRouter({ routeTree, context: { queryClient: undefined! } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
