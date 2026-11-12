# Vendored k6 libraries

The load test (`scripts/load/k6.js`) used to import two helper libraries from `jslib.k6.io` at run time. They are kept here instead, so a load run downloads no code: it runs what is in the repository, at the checksums written below.

The files are byte for byte what the address served on 12 November 2026. Nothing was reformatted; Prettier and ESLint skip them.

| File                          | Served from                                       | Source                                              | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `k6-utils/1.4.0/index.js`     | `https://jslib.k6.io/k6-utils/1.4.0/index.js`     | `github.com/grafana/k6-jslib-utils`, tag `v1.4.0`   | `8899bf0f9455ee81c61b3c99c3fe33c4127cca61268462b86f1f841203d6ef6e` |
| `k6-utils/1.4.0/index.js.map` | `https://jslib.k6.io/k6-utils/1.4.0/index.js.map` | the same repository and tag                         | `f6c494c11a10b4acbb4a1ac09e5efbfc199aef5d18d4b1bfb6742b23d202aad9` |
| `k6-summary/0.1.0/index.js`   | `https://jslib.k6.io/k6-summary/0.1.0/index.js`   | `github.com/grafana/k6-jslib-summary`, tag `v0.1.0` | `5d6c3fe92dc66eee1a54390d3a62cbceb75028ecc3ffa9709720afbc2a2ffe34` |

The source map is here because `k6-utils/1.4.0/index.js` names it in its last line. `k6-summary` is served without one.

## Licence

Both source repositories are published under the Apache License 2.0. The files as served carry no licence header of their own, so the licence is recorded here and its full text is in [`LICENSE`](LICENSE), copied unchanged from the two repositories (the same file in both). Neither repository has a `NOTICE` file. These files are not covered by the licence of the rest of this repository.

## Updating

1. Download the new version from `jslib.k6.io` into a folder named for it, and its source map if the file names one.
2. Replace the row above: address, tag and checksum (`sha256sum <file>`).
3. Change the two import lines in `scripts/load/k6.js`, run the load test by hand (`.github/workflows/load.yml`) and keep its summary in `docs/load/`.
