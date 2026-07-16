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
| `layout` | `split-left` (default), `split-right`, `centered`, `fullscreen` |
| `appName`, `tagline`, `title` | brand text; `title` sets the browser tab |
| `logo`, `favicon`, `background` | file names inside this folder |
| `features[]` | bullet list on the brand panel |
| `footer` | supports `{year}` |
| `text{}` | `signInTitle`, `signInSubtitle`, `resetTitle`, `resetSubtitle` |
| `colors{}` | any become CSS vars `--brand-<key>` (primary, panel-bg, page-bg, card-bg, title, …) |
| `customCss` | file name of a free-form stylesheet loaded LAST — restyle anything |
| `version` | bump to cache-bust `customCss` after edits |

## Deep customization
- **Colors / fonts / spacing** → `colors` in `brand.json`, or a `customCss` file.
- **Page structure** → set `layout` to one of the four built-ins.
- **A truly novel structure** → add a component under
  `src/login/layouts/` and register it in `src/Login.js` (one-time dev task);
  every client can then opt in via `layout`.
