# Retain content-free Capture Exclusions after deletion

Deleting a Journey defaults to deleting its archived content while retaining a minimal Capture Exclusion keyed by Source Agent and Native Session Identity, preventing an unchanged source from being silently recaptured on the next scan. Users may instead choose delete-only when rediscovery is desired, and can inspect or remove exclusions later. This retains a small identity tombstone after deletion, but makes deletion behavior predictable without preserving conversation content.
