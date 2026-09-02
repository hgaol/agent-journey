# Authenticate the loopback interface without user accounts

AgentJourney has no user accounts, but its loopback interface uses a generated per-installation secret, strict Host and Origin validation, a same-site HTTP-only browser session established by the launcher, CSRF protection for mutations, authenticated streaming connections, and no wildcard CORS. Users can rotate the local secret. This adds local authorization state, but prevents arbitrary websites and DNS-rebinding attacks from treating localhost as trusted access to sensitive unencrypted Journeys.
