# Claude.md: Wedding Invitation SaaS - Design System Integration Guide

This document provides comprehensive rules and patterns for integrating Figma designs using the Model Context Protocol (MCP) in the wedding invitation generator SaaS application.

## 1. Design System Structure

### Token Definitions
Design tokens are defined as CSS custom properties (CSS variables) in `apps/web/app/globals.css`. The tokens use a `var()` pattern and are organized by category:

```css
:root {
  --paper: #faf7f2;
  --paper-raised: #ffffff;
  --ink: #2b241f;
  --ink-soft: #6b5f55;
  --line: #e2d8c9;
  --accent: #7a4b2a;
  --accent-soft: #f1e4d6;
  --ok: #2f5d45;
  --ok-soft: #e3efe7;
  --warn: #8a4b16;
  --warn-soft: #fbeadb;
  --danger: #9b2c2c;
  --danger-soft: #fbe6e6;
  --focus: #1f5f8b;
  --radius: 14px;
  --shadow: 0 1px 2px rgba(43, 36, 31, 0.06), 0 10px 30px rgba(43, 36, 31, 0.06);
  --serif: Georgia, 'Times New Roman', serif;
  --sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
```

**Token Categories:**
- Colors (paper, ink, accent, ok, warn, danger, focus)
- Typography (serif, sans fonts)
- Spacing and layout (radius, shadow)
- Layout properties

**Usage Pattern:** Components reference tokens via `var()` in CSS or inline styles using JavaScript template literals.

**Design IDs:** 33 designs defined in `apps/web/lib/designs.js` with IDs like `01-editorial-mocha`, `02-vellum-linen`, etc. Each design has an `id` and `name`.

### Component Library

**Location:** `apps/web/components/`
- `DesignBrowser.jsx` - Grid/list view of 33 design previews
- `Paywall.jsx` - Payment collection with design preview
- `site-header.js` - Site header component

**Architecture:**
- **DesignBrowser** displays 33 designs in a grid (`h-48` height preview cards)
- Clicking a design opens the full HTML design in a new tab: `window.open(\`/designs/${design.id}.html\`, "_blank")`
- **Paywall** shows selected design name/ID before payment
- **NewInvitationForm** includes a `<select>` dropdown with all 33 designs from `DESIGNS` array

**Component Pattern:**
```jsx
// Design option in form
<select id="new-design" name="design" defaultValue={DESIGNS[0].id}>
  {DESIGNS.map((design) => (
    <option key={design.id} value={design.id}>
      {design.name}
    </option>
  ))}
</select>
```

### Frameworks & Libraries

| Framework | Version | Usage |
|-----------|---------|-------|
| **React** | 19.3.1 | UI library, all components are React functional components |
| **Next.js** | 16.4.6 | Full-stack framework, App Router pattern |
| **TypeScript** | Not used ( `"type": "module"` in package.json) | JavaScript/JSX only |

**Styling:**
- **CSS Variables** in `globals.css` - design tokens
- **Custom CSS** - not Tailwind CSS
- **Grid-based layouts** using CSS `grid` and `flexbox`
- **Responsive** via media queries at 860px breakpoint

### Asset Management

**Design Files:** 33 HTML files stored in `apps/web/public/designs/`
- Format: `01-editorial-mocha.html`, `02-vellum-linen.html`, etc.
- Each file is ~25KB with full HTML design preview
- Served statically via Next.js

**Reference:** Designs referenced via `/designs/{id}.html` pattern.

**No CDN configurations** - all assets are locally served.

**Optimization:** Design HTML files are minimal (25-28KB each) with inline CSS and system fonts.

### Icon System

**Location:** SVG icons used in components
- **DesignBrowser:** SVG arrows for grid/list toggle
- **Paywall:** SVG icons for payment steps
- **Global CSS:** Icon styles defined in component files

**Import Pattern:**
```jsx
// Example from DesignBrowser
<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253a4 4 0 1 0 0-7.503 4 4 0 0 0 0 7.503Zm.753-3h1.5a2.5 2.5 0 0 1 0 5h-1.5a2.5 2.5 0 0 1 0-5Z"/>
</svg>
```

**Naming Convention:** No formal icon naming convention - SVG paths are inline in component files.

### Styling Approach

**CSS Methodology:** Custom CSS with CSS custom properties (tokens)

**Global Styles:** `apps/web/app/globals.css` - resets, base styles, component styles

**Responsive Design:**
- Media queries at `860px` breakpoint
- `clamp()` function for fluid typography/sizing
- `grid-template-columns: 1fr` stacks on mobile

**Key Patterns:**
- `var(--token-name)` for all design tokens
- `border-radius: var(--radius)` (14px)
- `color: var(--ink)` for text color

**Component Styling:** Inline styles used for dynamic values (design ID based colors), CSS custom properties for static values.

### Project Structure

```
apps/wedding-generator/
├── apps/web/              # Next.js 16 web application
│   ├── app/               # Next.js 16 App Router
│   │   ├── layout.js      # Root layout
│   │   ├── page.js        # Dashboard page (force-dynamic)
│   │   ├── dashboard/     # Wedding studio feature
│   │   │   ├── page.js    # Main dashboard
│   │   │   ├── new-invitation-form.js  # Form with design selector
│   │   │   ├── DesignBrowser.jsx     # Design grid component
│   │   │   └── delete-draft-button.js
│   │   ├── app/           # API routes
│   │   │   ├── api/payments/doku/route.js  # DOKU payment gateway
│   │   │   ├── api/slug/route.js         # Slug generation
│   │   │   └── auth/               # Auth callbacks
│   │   ├── globals.css    # Design tokens and global styles
│   │   └── components/    # Reusable components
│   ├── components/        # Standalone components
│   │   ├── DesignBrowser.jsx   # Design grid (33 designs)
│   │   ├── Paywall.jsx         # Payment collection
│   │   └── site-header.js      # Header
│   ├── lib/               # Utility libraries
│   │   ├── designs.js          # 33 designs array
│   │   ├── core.js             # Core engine (slug generation)
│   │   └── draft.js            # Draft content normalization
│   ├── public/            # Static assets
│   │   └── designs/            # 33 design HTML files
│   ├── test/              # 132 unit tests
│   ├── next.config.mjs      # Next.js config with turbopack.root
│   └── package.json         # Dependencies (next 16.4.6, react 19.3.1)
│├── database/             # SQL migrations
││   └── 0002_saas.sql      # Phase 1 migration
│├── designs/              # 33 design HTML source files
│├── test/                 # Test scripts
││   └── app.test.js         # 132 passing tests
│├── SAAS_PLAN.md          # SaaS plan documentation
│├── REDESIGN_PROGRESS.md  # redesign progress
│├── REDESIGN_README.md    # redesign readme
│├── .agent-brief.md       # Agent brief
│├── .gitignore            # Git ignore rules
│├── serve.cjs             # Development server
│├── serve_test.cjs        # Test server
│└── README.md             # Project readme
```

### Feature Organization Pattern

**Feature-Based Structure:**
- `dashboard/` - Complete wedding studio feature
  - Design selection (DesignBrowser + NewInvitationForm)
  - Payment processing (Paywall + DOKU)
  - Draft management

**Page Organization:**
- `app/page.js` - Main dashboard (force-dynamic)
- `app/admin/[slug]/page.js` - Admin console per wedding
- `app/auth/callback/` - OAuth authentication
- `app/build/[id]/` - Draft building endpoint

**Data Flow:**
1. User selects design in DesignBrowser → design ID stored in state
2. NewInvitationForm collects names + design selection
3. `createDraft()` server action creates wedding record in Supabase
4. Paywall collects DOKU payment + design confirmation
5. Published invitation uses chosen design theme

### Model Context Protocol (MCP) Integration Guidelines

**For Figma Design Integration:**

1. **Design Token Mapping:**
   - Map Figma CSS variables to the existing `globals.css` tokens
   - Follow the existing `var(--token-name)` pattern
   - Add new tokens at the root level if needed

2. **Component Integration:**
   - Place new components in `apps/web/components/`
   - Export as default React function components
   - Use `@/components/ComponentName` import alias (resolved by Next.js module path)

3. **Design File References:**
   - 33 design HTML files in `public/designs/`
   - Reference via `/designs/{id}.html` pattern
   - Do not use `next/Image` with `.html` sources (use placeholder divs instead)

4. **API Integration:**
   - DOKU payment: `apps/web/api/payments/doku/route.js`
   - Slug generation: `apps/web/lib/core.js` / `makeSlug()`
   - Supabase integration: `@/lib/supabase/server`

5. **Design System Onboarding:**
   - Run design-system onboarding once (sets up CSS custom properties)
   - Add new tokens to `:root` in `globals.css`
   - Reference tokens via `var(--token-name)`
   - Add new components to `components/` directory
   - Export components for use in pages

### Key Code Patterns Demonstrated

**1. Design Selection:**
```jsx
// Dashboard - DesignBrowser integration
<DesignBrowser />  // shows 33 design thumbnails
// On click: window.open(`/designs/${design.id}.html`, "_blank")
```

**2. Form with Design Selector:**
```jsx
// NewInvitationForm - design dropdown
<select id="new-design" name="design" defaultValue={DESIGNS[0].id}>
  {DESIGNS.map((design) => (
    <option key={design.id} value={design.id}>
      {design.name}
    </option>
  ))}
</select>
```

**3. Payment Collection:**
```jsx
// Paywall - DOKU integration
const processPayment = async (token, email, payload) => {
  const resp = await fetch('/api/payments/doku', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId: process.env.DOKU_MERCHANT_ID,
      hashKey: process.env.DOKU_HASH_KEY,
      hashIV: process.env.DOKU_HASH_IV,
      token,
      email,
      payload, // includes slug, design, etc.
    }),
  });
};
```

**4. Server Actions:**
```js
// weddings.js - create draft
export async function create_wedding(slug, design, content) {
  // Creates wedding in Supabase
  // Returns uuid
}
```

**5. CSS Token Usage:**
```css
:root {
  --accent: #7a4b2a;
  --radius: 14px;
}

.button {
  background: var(--ok);
  color: #fff;
  border-radius: var(--radius);
}
```

### Integration Checklist for Figma-to-Code

- [ ] Map Figma colors to `globals.css` `:root` tokens
- [ ] Place new components in `apps/web/components/`
- [ ] Reference designs via `/designs/{id}.html` (NOT `next/Image` with html)
- [ ] Add design IDs to the `DESIGNS` array in `lib/designs.js`
- [ ] Add new CSS custom properties if needed
- [ ] Test with `npm run build` and `npm test`
- [ ] Ensure responsive breakpoints work (860px media query)
- [ ] Verify DOKU payment gateway integration
- [ ] Verify Supabase RLS policies work correctly

---

## Quick Reference Commands

```bash
# Build the project
npm run build

# Run all 132 tests
npm test

# Start dev server (default port 3000, or PORT=3001)
npm run dev

# Create new design HTML file
# - Place in apps/web/public/designs/{id}.html
# - Follow existing design HTML template structure

# Add new design to DESIGNS array
# - Edit apps/web/lib/designs.js
# - Add { id: 'XX-new-design', name: 'New Design Name' }

# Add new CSS token
# - Edit apps/web/app/globals.css
# - Add --token-name: #hex-value; to :root
# - Reference via var(--token-name)
```

---

## Design ID Reference (33 Designs)

| ID | Name |
|----|------|
| 01-editorial-mocha | Editorial Mocha |
| 02-vellum-linen | Vellum Linen |
| 03-garden-illustrated | Garden Illustrated |
| 04-quiet-luxe | Quiet Luxe |
| 05-minimal-mono | Minimal Mono |
| 06-midnight-celestial | Midnight Celestial |
| 07-terracotta-boho | Terracotta Boho |
| 08-blush-romantic | Blush Romantic |
| 09-emerald-deco | Emerald Deco |
| 10-batik-nusantara | Batik Nusantara |
| 11-crimson-opulent | Crimson Opulent |
| 12-snow-monochrome | Snow Monochrome |
| 13-ocean-breeze | Ocean Breeze |
| 14-amber-heritage | Amber Heritage |
| 15-forest-mist | Forest Mist |
| 16-rose-linen | Rose Linen |
| 17-navy-gold | Navy & Gold |
| 18-palm-breeze | Palm Breeze |
| 19-charcoal-ink | Charcoal Ink |
| 20-coral-modern | Coral Modern |
| 21-indigo-silk | Indigo Silk |
| 22-moss-rust | Moss & Rust |
| 23-apricot-soft | Apricot Soft |
| 24-slate-periwinkle | Slate Periwinkle |
| 25-mustard-gold | Mustard & Gold |
| 26-bubbling-green | Bubbling Green |
| 27-lilac-romantic | Lilac Romantic |
| 28-ivory-berg | Ivory Berg |
| 29-teal-depth | Teal Depth |
| 30-vintage-coral | Vintage Coral |
| 31-javanese-manuscript | Javanese Manuscript |
| 32-sacred-geometry | Sacred Geometry |
| 33-cinematic-reel | Cinematic Reel |