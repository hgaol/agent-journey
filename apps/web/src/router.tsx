import {
  Link,
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { LibraryPage } from "./views/LibraryPage.js";
import { JourneyPage } from "./views/JourneyPage.js";
import { SourcesPage } from "./views/SourcesPage.js";
import { SettingsPage } from "./views/SettingsPage.js";
import { useArchiveEvents } from "./hooks/useArchiveEvents.js";

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
const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: LibraryPage });
const sourcesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sources", component: SourcesPage });
const journeyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/journeys/$journeyId",
  component: JourneyPage
});
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });
const routeTree = rootRoute.addChildren([libraryRoute, sourcesRoute, journeyRoute, settingsRoute]);

export const router = createRouter({ routeTree, context: { queryClient: undefined! } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
