---
status: superseded by ADR-0046
---

# Render Journey Stages in sandboxed iframes

The original design let each Renderer Plugin execute and own DOM inside an opaque-origin iframe. Testing showed that an iframe can navigate itself and exfiltrate Stage content despite `connect-src 'none'`; Chromium does not recognize the proposed `navigate-to` CSP directive. ADR-0046 therefore retains the iframe only as a trusted render target and moves untrusted renderer execution into QuickJS.
