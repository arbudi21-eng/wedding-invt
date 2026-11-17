// Public invitation preview.
//
// GET /preview/new?design=01-editorial-mocha&bride=Amara&groom=Dewa&date=2027-03-13&time=10:00
//
// Generates a complete invitation HTML page from the query string using the
// same WedCore pipeline as the published site. No auth: it only personalizes
// the public template with form values the caller typed in their own
// browser — nothing private is read. Invalid/missing values fall back to the
// design's placeholder content (empty names become Partner 1/Partner 2).
import { NextResponse } from 'next/server';
import { DEFAULT_DESIGN, isDesignId } from '@/lib/designs';
import { buildInvitationHtml } from '@/lib/preview';
import { buildDateISO, normalizeContent } from '@/lib/draft';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function listParam(value) {
  return String(value || '')
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s && /^https?:\/\//i.test(s));
}

export async function GET(request) {
  const url = new URL(request.url);
  const q = (key) => url.searchParams.get(key) || '';

  const designParam = q('design');
  const design = isDesignId(designParam) ? designParam : DEFAULT_DESIGN;

  const gifts = [1, 2, 3]
    .map((n) => ({
      bank: q(`gift${n}Bank`).trim(),
      name: q(`gift${n}Name`).trim(),
      no: q(`gift${n}No`).trim(),
    }))
    .filter((gift) => gift.bank && gift.no);

  const content = normalizeContent({
    version: 1,
    names: [q('bride').trim() || 'Partner 1', q('groom').trim() || 'Partner 2'],
    dateISO: buildDateISO(q('date'), q('time') || '10:00'),
    venue: { name: q('venueName'), address: q('venueAddress'), mapsUrl: q('venueMaps') },
    schedule: { ceremony: q('ceremony'), reception: q('reception') },
    dress: { en: q('dressEn'), id: q('dressId') },
    story: {
      en: q('storyEn').split('\n').map((s) => s.trim()).filter(Boolean),
      id: q('storyId').split('\n').map((s) => s.trim()).filter(Boolean),
    },
    captions: {
      en: q('capsEn').split('\n').map((s) => s.trim()).filter(Boolean),
      id: q('capsId').split('\n').map((s) => s.trim()).filter(Boolean),
    },
    gifts,
    video: { link: q('videoLink'), src: q('videoSrc') },
    host: q('host'),
    locale: q('locale') === 'en' ? 'en' : 'id',
    text: {
      hero: {
        en: { h: q('heroHEn'), hp: q('heroHPEn') },
        id: { h: q('heroHId'), hp: q('heroHPId') },
      },
      intro: {
        en: { h: q('introHEn'), p: q('introPEn') },
        id: { h: q('introHId'), p: q('introPId') },
      },
      giftMessage: { en: q('giftMessageEn'), id: q('giftMessageId') },
    },
    couple: {
      man: {
        en: { p: q('manPEn'), parents: q('manFEn') },
        id: { p: q('manPId'), parents: q('manFId') },
      },
      woman: {
        en: { p: q('womanPEn'), parents: q('womanFEn') },
        id: { p: q('womanPId'), parents: q('womanFId') },
      },
    },
    photos: {
      cover: q('cover'),
      man: q('man'),
      woman: q('woman'),
      hero: q('hero'),
      story: listParam(q('storyPhotos')),
      album: listParam(q('albumPhotos')),
    },
  });

  const html = buildInvitationHtml({ design, content, slug: 'preview' });
  const editable = url.searchParams.get('edit') === '1';

  const EDIT_SCRIPT = `
<script>
(function () {
  'use strict';

  // Only wire editing when embedded inside the studio editor (/build/{id}).
  // When /preview/new is opened stand-alone (e.g. "Buka penuh"), it stays a
  // read-only preview — no dead buttons, no orphaned messages.
  if (window.parent === window) return;

  var css =
    '.ed{outline:2px dashed transparent;outline-offset:2px;border-radius:4px;transition:outline-color .15s}' +
    '.ed:hover{outline-color:rgba(255,255,255,.35)}' +
    '.ed:focus{outline-color:rgba(255,255,255,.55)}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Map from the design's data-t key to the studio form field name.
  var keys = {
    h: 'heroHId',
    hp: 'heroHPId',
    introH: 'introHId',
    introP: 'introPId',
    manP: 'manPId',
    manF: 'manFId',
    womanP: 'womanPId',
    womanF: 'womanFId',
    d: 'dressId',
    gfp: 'giftMessageId',
  };

  var post = function (message) {
    try { parent.postMessage(message, '*'); } catch (_) {}
  };

  document.querySelectorAll('[data-t]').forEach(function (el) {
    var field = keys[el.getAttribute('data-t')];
    if (!field) return;
    el.contentEditable = 'plaintext-only';
    el.classList.add('ed');
    el.addEventListener('input', function () {
      post({ type: 'wed:text', field: field, value: el.innerText.trim() });
    });
  });

  // Story beats: .sp (paragraph) and .cp (caption) are created at runtime,
  // in document order — the same order as the story/captions lists.
  var wireIndexed = function (selector, field) {
    var i = 0;
    document.querySelectorAll(selector).forEach(function (el) {
      var index = i;
      i += 1;
      el.contentEditable = 'plaintext-only';
      el.classList.add('ed');
      el.addEventListener('input', function () {
        post({ type: 'wed:list-item', field: field, index: index, value: el.innerText.trim() });
      });
    });
  };
  wireIndexed('.sp', 'storyId');
  wireIndexed('.cp', 'capsId');

  // ── Photo slots: overlay a "Ganti foto" button on every slot; clicking
  //    picks a file and posts it to the parent (structured clone). ──
  var overlayCss =
    '.ed-photo{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;' +
    'border:1px dashed rgba(255,255,255,.7);background:rgba(0,0,0,.5);backdrop-filter:blur(2px);' +
    'color:#fff;font:inherit;font-size:.78rem;padding:.45rem .85rem;border-radius:999px;cursor:pointer;' +
    'transition:background .15s;text-align:center;white-space:nowrap}' +
    '.ed-photo:hover{background:rgba(0,0,0,.7)}' +
    '.ed-photo[disabled]{opacity:.7;cursor:progress}';
  var style2 = document.createElement('style');
  style2.textContent = overlayCss;
  document.head.appendChild(style2);

  var slots = [];
  document.querySelectorAll('[data-photo="man"]').forEach(function (el) {
    slots.push({ el: el, slot: 'man' });
  });
  document.querySelectorAll('[data-photo="woman"]').forEach(function (el) {
    slots.push({ el: el, slot: 'woman' });
  });
  var cover = document.getElementById('cover');
  if (cover) slots.push({ el: cover, slot: 'cover' });
  document.querySelectorAll('.arch').forEach(function (el) {
    slots.push({ el: el, slot: 'hero' });
  });
  document.querySelectorAll('#track .slide > .card').forEach(function (el, i) {
    slots.push({ el: el, slot: 'story' + i });
  });
  document.querySelectorAll('#mas .frame').forEach(function (el, i) {
    slots.push({ el: el, slot: 'album' + i });
  });

  var postBack = function (m) {
    try { parent.postMessage(m, '*'); } catch (_) {}
  };

  // Reveal the invitation without requiring the "Open invitation" tap:
  // mirror exactly what the real guest button does (remove scroll lock +
  // slide the cover up), so the editor preview shows the real content
  // immediately while the button keeps working for the visitor.
  try {
    document.body.classList.remove('locked');
    var heroCover = document.getElementById('cover');
    if (heroCover) heroCover.classList.add('open');
  } catch (e) {}

  // Let the editor toggle cover vs. invitation without a reload:
  // posts { type:'wed:toggle-cover' } from the parent; we flip it here.
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.type !== 'wed:toggle-cover') return;
    var cover = document.getElementById('cover');
    if (!cover) return;
    cover.classList.toggle('open');
    document.body.classList.toggle('locked', !cover.classList.contains('open'));
  });

  // Compress a photo in place: cap longest edge, re-encode as WebP/JPEG with
  // decreasing quality until it fits under maxBytes (4 MB). GIFs pass through.
  var compressImage = function (file, maxBytes) {
    var MAX_DIM = 2560;
    return new Promise(function (resolve) {
      if (!file || String(file.type || '').indexOf('image/') !== 0 || file.type === 'image/gif' || !window.createImageBitmap) {
        resolve(file);
        return;
      }
      if (file.size <= maxBytes) {
        resolve(file);
        return;
      }
      createImageBitmap(file).then(function (bitmap) {
        try {
          var scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
          var w = Math.max(1, Math.round(bitmap.width * scale));
          var h = Math.max(1, Math.round(bitmap.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
          if (bitmap.close) bitmap.close();
          var type = /png|webp/i.test(file.type) ? 'image/webp' : 'image/jpeg';
          var step = function (q) {
            canvas.toBlob(function (blob) {
              if (!blob) {
                resolve(file);
                return;
              }
              if (blob.size <= maxBytes || q <= 0.25) {
                var base = (file.name || 'foto');
                var dot = base.lastIndexOf('.');
                if (dot > 0) base = base.slice(0, dot);
                var ext = type === 'image/webp' ? 'webp' : 'jpg';
                resolve(new File([blob], base + '.' + ext, { type: type, lastModified: Date.now() }));
              } else {
                step(q - 0.12);
              }
            }, type, q);
          };
          step(0.9);
        } catch (e) {
          resolve(file);
        }
      }, function () {
        resolve(file);
      });
    });
  };

  slots.forEach(function (entry) {
    var el = entry.el;
    var slot = entry.slot;
    el.style.position = 'relative';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ed-photo';
    btn.textContent = 'Ganti foto';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (input.parentNode) input.parentNode.removeChild(input);
        if (!f) return;
        btn.textContent = 'Mengompres…';
        btn.disabled = true;
        compressImage(f, 4 * 1024 * 1024).then(function (compressed) {
          btn.textContent = 'Mengunggah…';
          postBack({ type: 'wed:pick', slot: slot, file: compressed });
        });
      });
      document.body.appendChild(input);
      input.click();
      // If the user cancels the picker, clean up after a pause.
      window.setTimeout(function () {
        if (input.parentNode) input.parentNode.removeChild(input);
      }, 60000);
    });
    el.appendChild(btn);
  });

  // Parent answers with wed:upload-result - show it as a transient toast.
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.type !== 'wed:upload-result') return;
    var toast = document.createElement('div');
    toast.textContent = m.ok ? 'Foto terganti ✓' : (m.error || 'Gagal mengunggah foto');
    toast.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:1.25rem;z-index:99;color:#fff;' +
      'padding:.55rem 1.15rem;border-radius:999px;font:inherit;font-size:.875rem;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.35);background:' + (m.ok ? '#2f5d45' : '#9b2c2c') + ';';
    document.body.appendChild(toast);
    window.setTimeout(function () { toast.remove(); }, 3200);
  });

  // Instant photo application: swap the visual in place, no page reload.
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.type !== 'wed:photo-apply' || !m.slot) return;
    var url = m.url || '';
    var slot = m.slot;

    var clearSlot = function (el, imgSelector) {
      el.classList.remove('has-photo');
      el.style.backgroundImage = '';
      var img = el.querySelector(imgSelector);
      if (img) img.parentNode.removeChild(img);
    };

    if (slot === 'cover') {
      var coverEl = document.getElementById('cover');
      if (!coverEl) return;
      if (!url) {
        var bg = coverEl.querySelector('.cover-bg');
        if (bg) bg.parentNode.removeChild(bg);
        return;
      }
      var bgEl = coverEl.querySelector('.cover-bg');
      if (!bgEl) {
        bgEl = document.createElement('div');
        bgEl.className = 'cover-bg';
        bgEl.setAttribute('aria-hidden', 'true');
        coverEl.insertBefore(bgEl, coverEl.firstChild);
      }
      bgEl.style.backgroundImage = "url('" + url + "')";
      coverEl.classList.add('has-photo');
      return;
    }

    if (slot === 'video') {
      var existingVideo = document.querySelector('#vid video');
      if (existingVideo) {
        if (url) {
          existingVideo.src = url;
          existingVideo.load();
        }
        return;
      }
      if (url) location.reload(); // no player yet — reload once to inject it
      return;
    }

    if (slot === 'man' || slot === 'woman' || slot === 'hero') {
      var photoSel = slot === 'hero' ? '.arch' : '[data-photo="' + slot + '"]';
      document.querySelectorAll(photoSel).forEach(function (el) {
        if (!url) { clearSlot(el, 'img'); return; }
        el.classList.add('has-photo');
        el.style.backgroundImage = "url('" + url + "')";
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      });
      return;
    }

    var index = Number(String(slot).replace(/\D/g, ''));
    if (isNaN(index)) return;
    var selector = slot.indexOf('story') === 0 ? '#track .slide > .card' : '#mas .frame';
    var el = document.querySelectorAll(selector)[index];
    if (!el) return;
    if (!url) { clearSlot(el, 'img'); return; }
    var img = el.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      el.appendChild(img);
    }
    img.src = url;
  });
})();
</script>`;

  if (editable) {
    html.html = html.html.replace(/<\/body>/i, EDIT_SCRIPT + '\n</body>');
  }

  return new NextResponse(html.html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
}
