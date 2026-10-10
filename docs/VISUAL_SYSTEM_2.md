# ORBIT Visual System 2.0 — 0.9.5

The production frontend continues from the 0.9.4 source archive recorded in SOURCE_PROVENANCE_095.json. The core, permissions, local inference, Internet gateway and storage architecture remain unchanged.

## Visual language

Chat occupies the primary workspace. A quiet sidebar contains history and the existing destinations; the composer separates writing, intelligence mode, selected brain and context. Long answers use an 820px reading column. Source cards retain their provenance and open through the existing public-link permission boundary.

All current styles resolve through frontend/src/visual-system.css. Canvas/sidebar/surface/elevated/hover/selected, primary/secondary/muted text, borders, semantic status and focus colors have named tokens. Dark is the default. Light and System use the same components and saved presentation preference; System follows prefers-color-scheme.

Spacing uses 4/8/12/16/20/24/32/40/48px. Controls use 8–10px corners, cards 14px, composer 24px and dialogs 20px. The system font stack is Segoe UI Variable, Segoe UI, system-ui; code uses Cascadia Code/Consolas. No font service or remote image is required. Transitions last 140–200ms and are disabled by reduced-motion or the user's animation preference.

## Icons and identity

Lucide React **1.52.0** supplies one icon family with a 1.75 stroke, normally 18px (14/16/20/22/24px where appropriate). Decorative SVGs are hidden from assistive technology. Icon-only buttons have labels and tooltips. Lucide uses ISC, with MIT-covered Feather-derived icons. Full notices ship in frontend/public/THIRD_PARTY_NOTICES.txt.

The ORBIT logo is an original repository vector in assets/orbit.svg: a restrained rounded tile, ring, inclined orbit and satellite point. `npm run icons` regenerates Tauri's PNG/ICO/ICNS assets. The SVG is also included in the offline frontend. Inspection of icon files does not establish taskbar/Start Menu acceptance on a running native release.

## Content

React Markdown and GFM render lists, links, quotes, tables and fenced code. Code retains whitespace and copies the complete block with transient feedback. Wide code and tables scroll within the answer instead of widening the application.

remark-math **6.0.0** and rehype-katex **7.0.1** use KaTeX **0.19.0** (MIT) with bundled CSS/fonts. Inline/display math includes accessible MathML. Trust is disabled, expansion and size are bounded, and malformed input falls back without crashing the chat. Raw HTML is skipped, remote Markdown images are not fetched, and only HTTPS links are rendered as links. Public opening still uses ORBIT's existing policy checks.

Source cards use actual source fields only. Steam cards do not invent price, discount, rating or artwork. YouTube distinguishes explicit transcript/metadata evidence and displays timestamps only present in the source URL. Places cards show supplied address/context, never invented ratings or availability. Source preview is available by keyboard; Ask about video fills the composer and does not send a request automatically.

## Accessibility and validation

Visible focus rings, semantic controls, named navigation, status announcements, reduced motion and theme persistence are implemented. Browser checks cover 1100×700, 1280×720, 1366×768, 1440×900 and 1920×1080. Browser viewport checks do not prove Windows 125%/150% scaling or native WebView2 acceptance.

`scripts/visual-system-095.mjs` captures controlled visual examples with explicitly substituted model answers. `scripts/visual-security.test.mjs` checks unsafe content and malformed math. Real-model acceptance is recorded separately; neither fixtures nor screenshots establish real AI/native PASS. Before screenshots are retained in validation/before-094, after screenshots in validation/visual-095. Native, signing and delivery limitations belong in the release report.
