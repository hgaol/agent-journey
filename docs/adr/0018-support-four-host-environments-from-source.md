# Support macOS, Linux, native Windows, and WSL from source

AgentJourney treats macOS, Linux, native Windows, and WSL as first-class Host Environments during initial development. Windows and WSL remain distinct environments with separately granted Source Roots; cross-environment paths require explicit consent and are never discovered automatically. This materially enlarges the path, locking, watcher, and test matrix, but prevents Unix-only assumptions from hardening into the archive and plugin interfaces. Installer and release packaging are outside the current scope.
