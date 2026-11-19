// The 45 designs shipped in <repo>/designs. The id is the filename stem, which
// is what `build()` loads and what the database design constraint accepts.

export const DESIGNS = [
  { id: '01-editorial-mocha', name: 'Editorial Mocha' },
  { id: '02-vellum-linen', name: 'Vellum Linen' },
  { id: '03-garden-illustrated', name: 'Garden Illustrated' },
  { id: '04-quiet-luxe', name: 'Quiet Luxe' },
  { id: '05-minimal-mono', name: 'Minimal Mono' },
  { id: '06-midnight-celestial', name: 'Midnight Celestial' },
  { id: '07-terracotta-boho', name: 'Terracotta Boho' },
  { id: '08-blush-romantic', name: 'Blush Romantic' },
  { id: '09-emerald-deco', name: 'Emerald Deco' },
  { id: '10-batik-nusantara', name: 'Batik Nusantara' },
  { id: '11-crimson-opulent', name: 'Crimson Opulent' },
  { id: '12-snow-monochrome', name: 'Snow Monochrome' },
  { id: '13-ocean-breeze', name: 'Ocean Breeze' },
  { id: '14-amber-heritage', name: 'Amber Heritage' },
  { id: '15-forest-mist', name: 'Forest Mist' },
  { id: '16-rose-linen', name: 'Rose Linen' },
  { id: '17-navy-gold', name: 'Navy & Gold' },
  { id: '18-palm-breeze', name: 'Palm Breeze' },
  { id: '19-charcoal-ink', name: 'Charcoal Ink' },
  { id: '20-coral-modern', name: 'Coral Modern' },
  { id: '21-indigo-silk', name: 'Indigo Silk' },
  { id: '22-moss-rust', name: 'Moss & Rust' },
  { id: '23-apricot-soft', name: 'Apricot Soft' },
  { id: '24-slate-periwinkle', name: 'Slate Periwinkle' },
  { id: '25-mustard-gold', name: 'Mustard & Gold' },
  { id: '26-bubbling-green', name: 'Bubbling Green' },
  { id: '27-lilac-romantic', name: 'Lilac Romantic' },
  { id: '28-ivory-berg', name: 'Ivory Berg' },
  { id: '29-teal-depth', name: 'Teal Depth' },
  { id: '30-vintage-coral', name: 'Vintage Coral' },
  { id: '31-javanese-manuscript', name: 'Javanese Manuscript' },
  { id: '32-sacred-geometry', name: 'Sacred Geometry' },
  { id: '33-cinematic-reel', name: 'Cinematic Reel' },
  { id: '34-polaroid-scrapbook', name: 'Polaroid Scrapbook' },
  { id: '35-admit-one', name: 'Admit One' },
  { id: '36-magazine-cover', name: 'Magazine Cover' },
  { id: '37-cinematic', name: 'Cinematic' },
  { id: '38-playful-blobs', name: 'Playful Blobs' },
  { id: '39-letterpress-card', name: 'Letterpress Card' },
  { id: '40-broadsheet', name: 'Broadsheet' },
  { id: '41-neon-night', name: 'Neon Night' },
  { id: '42-arch-window', name: 'Arch Window' },
  { id: '43-bauhaus-blocks', name: 'Bauhaus Blocks' },
  { id: '44-aurora-glass', name: 'Aurora Glass' },
  { id: '45-zen-ink', name: 'Zen Ink' },
];

export const DEFAULT_DESIGN = '01-editorial-mocha';

const BY_ID = new Map(DESIGNS.map((d) => [d.id, d]));

export function isDesignId(id) {
  return BY_ID.has(id);
}

export function designName(id) {
  return BY_ID.get(id)?.name || id;
}
