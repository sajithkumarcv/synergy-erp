# Login Branding

Client-specific login pages are **data, not code**. One app build serves every
client. To change a client's login page you edit files here and (optionally) one
line in `../config.json` — no rebuild, no recompile.

## How it's selected
`public/config.json` → `"BRAND": "synergy"` picks the folder `branding/synergy/`.
At startup the app loads that folder's `brand.json`, applies its colors/text/logo,
and renders the layout it names. Missing keys fall back to `branding/default/`.

## Add a new client (2 minutes)
1. Copy the `default/` folder to `branding/<client>/`.
2. Replace `logo.svg` (and `favicon.ico`, optional `background.jpg`).
3. Edit `brand.json` — app name, tagline, features, footer, text, colors.
4. On the client's server, set `"BRAND": "<client>"` in `config.json`.

## brand.json keys
| key | meaning |
|-----|---------|
| `layout` | `aurora` (premium split + branded loader, **recommended**), `split-left`, `split-right`, `centered`, `fullscreen` |
| `appName`, `tagline`, `title` | brand text; `tagline` is the panel eyebrow (e.g. "India Edition"); `title` sets the browser tab |
| `welcome`, `headline`, `blurb` | aurora panel copy (fallbacks derive from tagline/features) |
| `logo`, `loaderLogo`, `favicon`, `background` | file names inside this folder (`loaderLogo` falls back to `logo`) |
| `features[]` | pill marks on the brand panel |
| `footer` | supports `{year}` |
| `version` | shown in the aurora card footer, e.g. `v4.8.2 · build 2026.07` |
| `text{}` | `signInTitle` (welcome heading), `signInSubtitle`, `resetTitle`, `resetSubtitle` |
| `loader{}` | `flag`: 3–4 hues for the boot-loader rings (use the client's flag colours); `text`: status line |
| `colors{}` | any become CSS vars `--brand-<key>`: `primary`, `primary-hover`, `primary-ring`, `secondary`, `panel-a`, `panel-b`, `panel-glow`, `page-bg`, `card-bg`, `title` |
| `customCss` | file name of a free-form stylesheet loaded LAST — restyle anything |

**Loader & dark mode.** The branded boot loader (in `public/index.html`) themes itself from `loader.flag` + `colors.panel-*` while `brand.json` loads — no rebuild. The aurora login is light/dark aware: brand *hue* comes from `colors`, the neutral ground from theme tokens, and the top-right toggle persists the choice per browser.

## Deep customization
- **Colors / fonts / spacing** → `colors` in `brand.json`, or a `customCss` file.
- **Page structure** → set `layout` to one of the four built-ins.
- **A truly novel structure** → add a component under
  `src/login/layouts/` and register it in `src/Login.js` (one-time dev task);
  every client can then opt in via `layout`.
