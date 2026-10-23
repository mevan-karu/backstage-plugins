---
'backend': patch
---

Pin the backend runtime image to `node:22-bookworm-slim` with Node 22.23.4. Earlier 1.2 images
shipped Node 22.23.3, whose bundled root store still trusted emSign ECC Root CA - G3, the eMudhra
root removed after the eMudhra intermediate CA key compromise.
