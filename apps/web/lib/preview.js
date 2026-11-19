// Server-side invitation generator.
//
// Runs the WedCore `build()` pipeline against a draft and returns a complete
// HTML page. This is what `/preview/new` (public, query params),
// `/preview/[id]` (owner-only, saved draft) and `/[slug]` (published guest
// view) all render. The raw Wed-Inv files in public/designs/ are sample
// output and stay available for static comparison; this module personalizes
// them with real content.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import core from './core.js';
import { normalizeContent } from './draft.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// apps/web/lib -> repo root is three levels up
const repoRoot = path.resolve(here, '..', '..', '..');

/** Raw Wed-Inv template for a design id. Source of truth: <repo>/designs/. */
export function readDesignHtml(designId) {
  return fs.readFileSync(path.join(repoRoot, 'designs', `${designId}.html`), 'utf8');
}

/** Placeholder wiring — WedCore embeds its own copy inside lib/core.js. */
export function readWiring() {
  return fs.readFileSync(path.join(repoRoot, 'templates', 'wiring.js'), 'utf8');
}

function assetsFromContent(content) {
  const assets = {
    cover: content.photos.cover || undefined,
    man: content.photos.man || undefined,
    woman: content.photos.woman || undefined,
    hero: content.photos.hero || undefined,
    story: content.photos.story,
    album: content.photos.album,
  };
  if (content.video.src) assets.video = { src: content.video.src };
  // YouTube / YouTube Music links are not playable as <video src>. They are
  // handed to the runtime as CFG.video.link only (ev.video.link); the
  // invitation page embeds them inline as an iframe.
  return assets;
}

/**
 * Build a complete invitation HTML page.
 *
 * @param {object} input
 * @param {string} input.design  design id, e.g. '01-editorial-mocha'
 * @param {object} input.content stored draft content (jsonb)
 * @param {string} [input.slug]  slug baked into the page (affects the URL, not contents)
 * @returns {{ html:string, miss: string[] }}
 */
export function buildInvitationHtml({ design, content, slug = '' }) {
  const normalized = normalizeContent(content);
  // Never leak the template's sample couple into a user's preview.
  const names = normalized.names.map((n, i) => n.trim() || (i === 0 ? 'Partner 1' : 'Partner 2'));

  const ev = {
    names,
    dateISO: normalized.dateISO,
    venue: normalized.venue,
    schedule: normalized.schedule,
    dress: normalized.dress,
    story: normalized.story,
    captions: normalized.captions,
    gifts: normalized.gifts,
    video: normalized.video,
    host: normalized.host,
    music: normalized.music,
    locale: normalized.locale,
    text: normalized.text,
    couple: normalized.couple,
  };

  // Guests never see the admin surfaces; this page is the invitation itself.
  const { html, miss } = core.build(
    readDesignHtml(design),
    ev,
    assetsFromContent(normalized),
    readWiring(),
    slug
  );

  // build() emits `<script src="config.js">` — a relative path that resolves to
  // nothing on this route. Swap it for an inline APP_CONFIG (same content
  // configJs() would write to the exported site's config.js).
  const configScript =
    '<script>' +
    `window.APP_CONFIG = {` +
    `\n  SUPABASE_URL: ${JSON.stringify(process.env.SUPABASE_URL || '')},` +
    `\n  SUPABASE_ANON_KEY: ${JSON.stringify(process.env.SUPABASE_ANON_KEY || '')},` +
    `\n  SLUG: ${JSON.stringify(slug)}` +
    '\n};</script>';
  const withConfig = html.replace('<script src="config.js"></script>', () => configScript);

  return { html: withConfig, miss };
}
