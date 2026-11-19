/**
 * WedCore — Wedding Studio generator engine
 * Provides: WedCore.build(), WedCore.jwtRole(), WedCore.configJs(), WedCore.slugify(), WedCore.makeSlug()
 */

(function (global) {
  'use strict';

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Decode a JWT payload without verifying the signature */
  function jwtRole(token) {
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const pad = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(pad)
          .split('')
          .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('')
      );
      return JSON.parse(json).role || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Format a Date as a localised day+date string.
   * Returns e.g. "Saturday, 13 March 2027" (en) or "Sabtu, 13 Maret 2027" (id)
   */
  function fmtDate(date, lang) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    return date.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  /**
   * Format a time string "HH:MM" as "HH:MM" (we keep it simple — the design
   * templates already have the right separator and surrounding text).
   */
  function fmtTime(hhmm) {
    return (hhmm || '').trim();
  }

  // ── slug helpers ──────────────────────────────────────────────────────────

  /** Slugify a string: lowercase, strip diacritics, keep a-z0-9-, trim to maxLen. */
  function slugifyString(s, maxLen = 24) {
    if (!s) return '';
    s = String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[^a-z0-9-]/g, '-');
    s = s.replace(/-+/g, '-');
    s = s.replace(/^-|-$/g, '');
    if (s.length <= maxLen) return s;
    s = s.slice(0, maxLen).replace(/-$/g, '');
    return s;
  }

  /** Build the couple's slug: {brideSlug}-{groomSlug}-{6char-base32}.
   *  Guard against reserved words and empty names (falls back to wedding-{random}). */
  function makeSlug(names, usedSlugs = new Set()) {
    const parts = (names || []).map(n => n ? slugifyString(n.trim()) : '').filter(Boolean);
    const a = parts[0] || '';
    const b = parts[1] || '';

    // Both empty -> fallback
    if (!a && !b) {
      return 'wedding-' + b32(6);
    }

    let brideSlug = a || 'partner';
    let groomSlug = b || 'partner';

    const reserved = new Set(['admin', 'assets', 'api', 'sites']);

    // Guard against reserved words in either name part -> fallback to wedding-random
    if (reserved.has(brideSlug) || reserved.has(groomSlug)) {
      return 'wedding-' + b32(6);
    }

    const slug = brideSlug + '-' + groomSlug + '-' + b32(6);

    if (usedSlugs.has(slug)) {
      return makeSlug(names, usedSlugs);
    }

    return slug;
  }

  /** Generate n characters of base32 from crypto.getRandomValues (node/browser). */
  function b32(n) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      // Need ceil(n * 5 / 8) bytes to get n base32 chars (5 bits per char)
      const bytes = new Uint8Array(Math.ceil(n * 5 / 8));
      crypto.getRandomValues(bytes);
      let out = '';
      let bits = 0, val = 0, bitsLeft = 0;
      for (let i = 0; out.length < n; i++) {
        if (i >= bytes.length) break;
        val = (val << 8) | bytes[i];
        bitsLeft += 8;
        while (bitsLeft >= 5 && out.length < n) {
          bitsLeft -= 5;
          out += alphabet[(val >> bitsLeft) & 31];
        }
      }
      // Pad with random chars if we ran out of bytes
      while (out.length < n) {
        out += alphabet[crypto.getRandomValues(new Uint8Array(1))[0] % alphabet.length];
      }
      return out.slice(0, n);
    }
    return 'abcdef'.repeat(Math.ceil(n / 6)).slice(0, n);
  }

  // ── Supabase wiring block (injected verbatim into generated sites) ──────

  const WIRING_JS = `// ---- Supabase wiring ----
Object.assign(T.en,{send:'Confirm',ws:'Send wish',ok:'Thank you, see you there!',no2:'Thank you for letting us know.',pl:'Please use your personal link to RSVP.',err:'Something went wrong. Please try again.',wsent:'Wish sent. Thank you!',setup:'Setup not finished: add your Supabase URL and anon key in config.js'});
Object.assign(T.id,{send:'Konfirmasi',ws:'Kirim ucapan',ok:'Terima kasih, sampai jumpa!',no2:'Terima kasih sudah memberi kabar.',pl:'Gunakan tautan pribadi Anda untuk konfirmasi kehadiran.',err:'Terjadi kesalahan. Silakan coba lagi.',wsent:'Ucapan terkirim. Terima kasih!',setup:'Pengaturan belum selesai: isi URL dan anon key Supabase di config.js'});
const A=window.APP_CONFIG||{},ok=A.SUPABASE_URL&&!/YOUR-/.test(A.SUPABASE_URL)&&window.supabase;
const SLUG=A.SLUG||'';
let sb,G=null,pax=1,busy=0,mk='';
const say=k=>{mk=k;$('#msg').textContent=k?T[L][k]:''};
const dis=()=>['yes','no','send','wish','wt'].forEach(i=>$('#'+i).disabled=true);
const _al=applyLang;applyLang=function(){_al();$('#wt').placeholder=L==='id'?'Tulis ucapan Anda (maks 500)':'Write your wish (max 500)';if(mk)say(mk)};
async function run(b,fn,args,done){if(busy||!G)return false;busy=1;b.disabled=true;let r=false;
  try{const{error}=await sb.rpc(fn,args);if(error)throw error;say(done);r=true}catch(e){say('err')}busy=0;b.disabled=false;return r}
$('#yes').onclick=()=>{$('#pax').hidden=false};
$('#pm').onclick=()=>{pax=Math.max(1,pax-1);$('#pn').textContent=pax};
$('#pp').onclick=()=>{pax=Math.min(20,pax+1);$('#pn').textContent=pax};
$('#send').onclick=e=>run(e.currentTarget,'submit_rsvp',{p_slug:SLUG,p_code:code,p_rsvp:'attending',p_pax:pax},'ok');
$('#no').onclick=e=>run(e.currentTarget,'submit_rsvp',{p_slug:SLUG,p_code:code,p_rsvp:'declined',p_pax:0},'no2');
$('#wt').oninput=()=>{$('#wc').textContent=$('#wt').value.length+'/500'};
$('#wish').onclick=async e=>{const m=$('#wt').value.trim();if(!m)return;if(await run(e.currentTarget,'submit_wish',{p_slug:SLUG,p_code:code,p_message:m},'wsent'))wall()};
async function wall(){if(!sb||!SLUG)return;try{const{data}=await sb.rpc('list_wishes',{p_slug:SLUG});
  const w=$('#wl');w.textContent='';(data||[]).forEach(x=>{const q=document.createElement('blockquote');q.className='wq';const p=document.createElement('p');p.textContent=x.message;const c=document.createElement('cite');c.textContent=x.name;q.append(p,c);w.appendChild(q)});
  $('#wishes').hidden=!(data&&data.length)}catch(e){}}
async function init(){
  if(!ok){dis();say('setup');return}
  sb=supabase.createClient(A.SUPABASE_URL,A.SUPABASE_ANON_KEY);
  if(code){try{const{data,error}=await sb.rpc('open_invitation',{p_slug:SLUG,p_code:code});if(error)throw error;G=data}catch(e){}}
  if(G){if(G.lang==='en'||G.lang==='id')L=G.lang;GN=(G.name||'').replace(/[<>]/g,'');if(G.pax>0){pax=G.pax;$('#pn').textContent=pax}
    if(G.rsvp==='attending')$('#pax').hidden=false;if(G.wish){$('#wt').value=G.wish;$('#wc').textContent=G.wish.length+'/500'}}
  else{dis();say('pl')}
  applyLang();wall();setInterval(()=>{if(!document.hidden)wall()},3e4)
}

// ---- photo slots: cover / groom / bride / hero ----
(function(){
  var map={cover:CFG.cover,man:CFG.man,woman:CFG.woman,hero:CFG.hero};
  Object.keys(map).forEach(function(k){
    var src=map[k]; if(!src) return;
    document.querySelectorAll('[data-photo="'+k+'"]').forEach(function(el){
      el.classList.add('has-photo');
      el.style.backgroundImage="url('"+src+"')";
      el.style.backgroundSize='cover';
      el.style.backgroundPosition='center';
    });
    if(k==='hero'){
      document.querySelectorAll('#hero .arch, .arch').forEach(function(el){
        el.classList.add('has-photo');
        el.style.backgroundImage="url('"+src+"')";
        el.style.backgroundSize='cover';
        el.style.backgroundPosition='center';
      });
    }
    if(k==='cover'){
      var c=document.getElementById('cover'); if(!c) return;
      var b=c.querySelector('.cover-bg');
      if(!b){b=document.createElement('div');b.className='cover-bg';b.setAttribute('aria-hidden','true');c.insertBefore(b,c.firstChild)}
      b.style.backgroundImage="url('"+src+"')";
      c.classList.add('has-photo');
    }
  });
})();`;

  // ── Extra CSS injected into every generated page (after </style> in <head>):
  const EXTRA_CSS = `<style>[hidden]{display:none!important}#wt{width:100%;max-width:30rem;font:inherit;padding:.8rem;border:1px solid currentColor;border-radius:12px;background:transparent;color:inherit}#wc{display:block;opacity:.6}#msg{margin-top:1rem}#lang{display:none!important}.cover-bg{position:absolute;inset:0;z-index:-1;background-position:center;background-size:cover;background-repeat:no-repeat;pointer-events:none}.cover-bg::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.32),rgba(0,0,0,.55))}[data-photo].has-photo,.arch.has-photo{background-size:cover;background-position:center;background-repeat:no-repeat}[data-photo].has-photo::after,.arch.has-photo::after{content:none!important}.vid-link{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden;text-decoration:none;color:#fff}.vid-link img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.vid-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:4.5rem;height:4.5rem;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-size:1.7rem;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.35)}.vid-cap{position:absolute;left:50%;bottom:.9rem;transform:translateX(-50%);white-space:nowrap;background:rgba(0,0,0,.6);padding:.35rem .9rem;border-radius:999px;font-size:.8rem}</style>`;

  // ── <meta> tags injected just before EXTRA_CSS ──
  function metaTags(names, dateISO, slug, host) {
    const title = names.join(' \u0026 ');
    const d = new Date(dateISO);
    const desc = isNaN(d) ? '' : fmtDate(d, 'en');
    const canonical = host ? `https://${esc(host)}/${slug}/` : `./`;
    return (
      `<meta name="robots" content="noindex">` +
      `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.youtube.com https://s.ytimg.com https://www.youtube-nocookie.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src https://*.supabase.co https://www.youtube.com https://s.ytimg.com https://www.youtube-nocookie.com">` +
      `<link rel="canonical" href="${canonical}">` +
      `<meta property="og:title" content="${esc(title)}">` +
      `<meta property="og:description" content="${esc(desc)}">` +
      `<meta property="og:url" content="${canonical}">`
    );
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Escape a value so it is safe inside a single- or double-quoted JS string. */
  function jsString(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ')
      .replace(/</g, '\\x3c');
  }

  /**
   * Replace the sample names used by every design template:
   * Amara = the bride (names[0]), Dewa = the groom (names[1]).
   * Script bodies get JS-safe escaping; markup gets HTML escaping.
   */
  function substituteNames(html, names) {
    const bride = (names[0] || '').trim();
    const groom = (names[1] || '').trim();
    const pairs = [['Amara', bride], ['Dewa', groom]].filter(p => p[1]);
    if (!pairs.length) return html;
    return html
      .split(/(<script\b[^>]*>[\s\S]*?<\/script>)/gi)
      .map(part => {
        const inScript = /^<script\b/i.test(part);
        return pairs.reduce((acc, [from, to]) =>
          acc.split(from).join(inScript ? jsString(to) : esc(to)), part);
      })
      .join('');
  }

  // ── build ────────────────────────────────────────────────────────────────

  /**
   * Extract the video id from a YouTube / YouTube Music URL.
   * Returns '' for anything else (including direct .mp3 links).
   */
  function youtubeId(url) {
    const s = String(url || '');
    if (!/(?:youtube\.com|youtu\.be)/i.test(s)) return '';
    const m = s.match(/(?:youtu\.be\/|embed\/|shorts\/|live\/|[?&]v=)([A-Za-z0-9_-]{6,20})/);
    return m ? m[1] : '';
  }

  /**
   * WedCore.build(designHtml, ev, assets, wiringJs, slug)
   *
   * @param {string} designHtml  Raw HTML of a designs/NN-*.html file
   * @param {Object} ev          Event object from index.html make()
   * @param {Object} assets      Asset paths from index.html make()
   * @param {string} wiringJs    Contents of templates/wiring.js
   * @param {string} slug        Unique slug for this wedding
   * @returns {{ html: string, miss: string[] }}
   *   html  — ready-to-deploy HTML string
   *   miss  — list of warnings for the user
   */
  function build(designHtml, ev, assets, wiringJs, slug) {
    const miss = [];
    const names = (ev.names || ['Partner 1', 'Partner 2']).map(n => String(n).trim());
    let html = substituteNames(designHtml, names);

    // ── 1. Inject <meta> + extra CSS just before </head> ──────────────────
    const headClose = '</head>';
    const headIdx = html.lastIndexOf(headClose);
    if (headIdx === -1) {
      miss.push('Could not find </head> in template');
    } else {
      const injection = '\n' + metaTags(names, ev.dateISO, slug, ev.host) + '\n' + EXTRA_CSS + '\n';
      html = html.slice(0, headIdx) + injection + html.slice(headIdx);
    }

    // ── 2. Inject <script src="config.js"> + supabase CDN before </body> ──
    html = html.replace(
      /(<script>)/,
      '<script src="config.js"></script>' +
      '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>\n$1'
    );

    // ── 3. Inject CFG overrides (real event data) after `const CFG={…};` ──
    const cfgPatch = buildCfgPatch(ev, assets, slug);
    html = html.replace(
      /(const CFG=\{[\s\S]*?\};)/,
      '$1\n' + cfgPatch
    );

    // ── 3b. Apply uploaded photos to DOM slots immediately after CFG is set,
    //        so cover / groom / bride / hero photos render even if a later
    //        template script throws before reaching the inline photo wiring.
    const photoWiring = `
(function(){
  var map={cover:CFG.cover,man:CFG.man,woman:CFG.woman,hero:CFG.hero};
  Object.keys(map).forEach(function(k){
    var src=map[k]; if(!src) return;
    document.querySelectorAll('[data-photo="'+k+'"]').forEach(function(el){
      el.classList.add('has-photo');
      el.style.backgroundImage="url('"+src+"')";
      el.style.backgroundSize='cover';
      el.style.backgroundPosition='center';
    });
    if(k==='hero'){
      document.querySelectorAll('#hero .arch, .arch').forEach(function(el){
        el.classList.add('has-photo');
        el.style.backgroundImage="url('"+src+"')";
        el.style.backgroundSize='cover';
        el.style.backgroundPosition='center';
      });
    }
    if(k==='cover'){
      var c=document.getElementById('cover'); if(!c) return;
      var b=c.querySelector('.cover-bg');
      if(!b){b=document.createElement('div');b.className='cover-bg';b.setAttribute('aria-hidden','true');c.insertBefore(b,c.firstChild)}
      b.style.backgroundImage="url('"+src+"')";
      c.classList.add('has-photo');
    }
  });
})();`;
    html = html.replace(
      /(Object\.assign\(CFG,\{[\s\S]*?\}\);)/,
      '$1\n' + photoWiring
    );

    // ── 4. Force Bahasa Indonesia: the invitation is Indonesian-only.
    //       The original line picks a language from the browser/hash; pin it
    //       to 'id' and declare `code = ''` here in the same stroke. ──────
    html = html.replace(
      /let L=[^;]*,GN='';/,
      "let code='',L='id',GN='';"
    );

    // ── 5. Inject T.en/T.id overrides (localised event strings) ──────────
    const tPatch = buildTPatch(ev);
    html = html.replace(
      /(const T=\{[\s\S]*?\};)/,
      '$1\n' + tPatch
    );

    // ── 6. Replace the WhatsApp-only parse() + music oscillator with the
    //       code-based parse() + real Audio() music player ─────────────────
    html = html.replace(
      /function parse\(\)\{[\s\S]*?\}\s*(?=const M=|[$])/,
      "function parse(){code=(new URLSearchParams(location.search).get('c')||'').trim();applyLang()}\n"
    );

    // ── 6b. Video: uploaded file plays inline as <video>; a YouTube /
    //       YouTube Music link embeds as an inline iframe; otherwise the
    //       design's placeholder span shows. The trailing "Watch the full
    //       video" link section is left untouched. ───────────────────────────
    const vidRe = /const vd=\$\('#vid'\);\s*if\(CFG\.video\.src\)\{[\s\S]*?\}\s*else vd\.innerHTML='<span class="pl" data-t="vph">[^']*<\/span>';/;
    const vidBlock = `const vd=$('#vid');
const __yt=(function(u){u=String(u||'');if(!/(?:youtube\\.com|youtu\\.be)/i.test(u))return'';const m=u.match(/(?:youtu\\.be\\/|embed\\/|shorts\\/|live\\/|[?&]v=)([A-Za-z0-9_-]{6,20})/);return m?m[1]:''})(CFG.video&&CFG.video.link);
if(CFG.video.src){const v=document.createElement('video');v.controls=true;v.playsInline=true;v.preload='metadata';if(CFG.video.poster)v.poster=CFG.video.poster;v.src=CFG.video.src;vd.appendChild(v)}
else if(__yt){const idTxt=(navigator.language||'id').toLowerCase().startsWith('id')?'Tonton video lengkap':'Watch the full video';const a=document.createElement('a');a.href=CFG.video.link;a.target='_blank';a.rel='noopener';a.className='vid-link';a.setAttribute('aria-label',idTxt);a.innerHTML='<img src="https://i.ytimg.com/vi/'+__yt+'/maxresdefault.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.src=&quot;https://i.ytimg.com/vi/'+__yt+'/hqdefault.jpg&quot;"/><span class="vid-play" aria-hidden="true">▶</span><span class="vid-cap">'+idTxt+'</span>';vd.appendChild(a)}
else vd.innerHTML='<span class="pl" data-t="vph">Your video goes here</span>';`;
    if (vidRe.test(html)) {
      html = html.replace(vidRe, vidBlock);
    } else {
      miss.push('Could not find the video wiring block in template');
    }

    // Replace oscillator music block — three cases:
    //   1. music.url is a YouTube / YouTube Music link → hidden IFrame Player
    //      (looped, autoplays on the guest's "Open invitation" tap);
    //   2. music.url is any other (http/https) link → plain looped <audio>;
    //   3. no music → the button is hidden; play()/stop() exist as no-ops
    //      because the template always calls play() from the open button.
    // Templates carry the oscillator either under a `// Music` comment or
    // bare (`let ac,gain…`); both end with the same onclick terminator.
    const musicSrc = ev.music && ev.music.url ? ev.music.url : '';
    const ytId = musicSrc ? youtubeId(musicSrc) : '';
    const musicBlock = ytId
      ? `const ytId=${JSON.stringify(ytId)};let yt=null;const ytDiv=document.createElement('div');ytDiv.id='ytmusic';ytDiv.setAttribute('aria-hidden','true');ytDiv.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';document.body.appendChild(ytDiv);\nfunction mkYt(){yt=new YT.Player('ytmusic',{height:'1',width:'1',videoId:ytId,playerVars:{autoplay:1,controls:0,loop:1,playlist:ytId,rel:0,modestbranding:1,playsinline:1},events:{onReady:e=>{e.target.playVideo()},onError:()=>{$('#music').hidden=true},onStateChange:e=>{$('#music').classList.toggle('on',e.data===1)}}})}\nfunction play(){if(yt){yt.playVideo();return}if(window.YT&&YT.Player){mkYt();return}if(document.getElementById('yt-api'))return;const t=document.createElement('script');t.id='yt-api';t.src='https://www.youtube.com/iframe_api';document.head.appendChild(t);window.onYouTubeIframeAPIReady=mkYt}\nfunction stop(){if(yt){yt.pauseVideo()}$('#music').classList.remove('on')}\n$('#music').onclick=()=>(yt&&yt.getPlayerState&&yt.getPlayerState()===1)?stop():play();`
      : musicSrc
        ? `const au=new Audio(${JSON.stringify(musicSrc)});au.loop=true;au.onerror=()=>{$('#music').hidden=true};\nfunction play(){au.play().then(()=>$('#music').classList.add('on')).catch(()=>{})}\nfunction stop(){au.pause();$('#music').classList.remove('on')}\n$('#music').onclick=()=>au.paused?play():stop();`
        : `$('#music').hidden=true;function play(){}function stop(){}`;
    const musicRes = [
      /\/\/ Music\b[^\n]*\n[\s\S]*?\$\('#music'\)\.onclick=\(\)=>playing\?stop\(\):play\(\);/,
      /\blet ac\b[\s\S]*?\$\('#music'\)\.onclick=\(\)=>playing\?stop\(\):play\(\);/,
    ];
    let musicReplaced = false;
    for (const re of musicRes) {
      if (re.test(html)) {
        html = html.replace(re, musicBlock);
        musicReplaced = true;
        break;
      }
    }
    if (!musicReplaced) miss.push('Could not find the music oscillator block in template');

    // ── 7. Replace ONLY the WhatsApp RSVP handlers with the Supabase wiring.
    //       Gallery, gift-list and wish rendering live after this block and
    //       must survive untouched. ─────────────────────────────────────────
    const waHandlerRe = /let pax=1;const nm[\s\S]*?\$\('#wish'\)\.onclick=\(\)=>go\(M\[L\]\.w\(nm\(\)\)\);/;
    if (waHandlerRe.test(html)) {
      html = html.replace(waHandlerRe, WIRING_JS);
    } else {
      miss.push('Could not find the WhatsApp RSVP handlers in template');
    }

    // ── 8. Boot Supabase after the template's own parse() has run ────────
    if (/parse\(\);\s*\n<\/script>/.test(html)) {
      html = html.replace(/parse\(\);\s*\n<\/script>/, 'parse();init();\n</script>');
    } else {
      miss.push('Could not find the final parse() call in template');
    }

    // ── 9. Patch the RSVP closing section: replace the bare wish button with
    //       the textarea+counter+status block the wiring JS expects ─────────
    //       Designs wrap it differently — <p style="margin…">…</p>, <div
    //       class="wish-block">…</div>, or <p style="margin-top:…">…</p>all use
    //       `.btn.alt#wish`. Match tolerantly.
    const wishRe = /<(?:p|div)\b[^>]*>\s*<button class="btn alt" id="wish"[^>]*>[^<]*<\/button>\s*<\/(?:p|div)>/;
    if (wishRe.test(html)) {
      html = html.replace(
        wishRe,
        '<div style="margin:1.6rem auto 0"><textarea id="wt" maxlength="500" rows="4" aria-label="Wish"></textarea><small id="wc">0/500</small><p style="margin-top:.8rem"><button class="btn alt" id="wish" data-t="ws">Send wish</button></p><p id="msg" role="status"></p></div>'
      );
    } else {
      miss.push('Could not find the wish button wrapper in template');
    }

    // ── 10. Patch the send button text — keep only "Confirm" (Supabase, not WA) ─
    html = html.replace(
      /(<button[^>]+id="send"[^>]*>)Confirm on WhatsApp(<\/button>)/,
      '$1Confirm$2'
    );

    return { html, miss };
  }

  // ── helpers for step 3/5 ─────────────────────────────────────────────────

  function buildCfgPatch(ev, assets, slug) {
    const date = new Date(ev.dateISO);
    const patch = {
      date: `new Date(${JSON.stringify(ev.dateISO)})`,
      gifts: ev.gifts || [],
      // Uploaded wishes/accounts reach us through the pipeline; never ship the
      // template's sample wishes or placeholder phone number.
      wishes: [],
      phone: '',
      slug: slug || ''
    };
    if (assets.cover) patch.cover = assets.cover;
    if (assets.man)   patch.man   = assets.man;
    if (assets.woman) patch.woman = assets.woman;
    if (assets.hero)  patch.hero  = assets.hero;
    if (ev.supabase && ev.supabase.url) {
      // phone is already in template, leave as-is; nothing to inject
    }
    if (ev.video && ev.video.link) patch.video = { link: ev.video.link };
    if (assets.video && assets.video.src) {
      patch.video = Object.assign(patch.video || {}, { src: assets.video.src });
    }

    // Build story photos CFG entry from uploaded story files
    if (assets.story && assets.story.length) {
      patch.photos = assets.story.map((src, i) => ({
        src,
        cap: (ev.captions && ev.captions.en && ev.captions.en[i]) || '',
        g: 'linear-gradient(160deg,#9a6a52,#4a3028)'
      }));
    }

    // Build album CFG entry from uploaded album files
    if (assets.album && assets.album.length) {
      patch.album = assets.album.map(src => ({
        src,
        g: 'linear-gradient(160deg,#9a6a52,#4a3028)',
        r: '3/4'
      }));
    }

    const dateToken = '__DATE__';
    const obj = JSON.stringify(
      Object.assign({}, patch, { date: dateToken }),
      null, 0
    ).replace(JSON.stringify(dateToken), `new Date(${JSON.stringify(ev.dateISO)})`);

    return `Object.assign(CFG,${obj});`;
  }

  function buildTPatch(ev) {
    const date = new Date(ev.dateISO);
    const sch  = ev.schedule || {};
    const ven  = ev.venue    || {};
    const drs  = ev.dress    || {};
    const txt  = ev.text     || {};
    const cpl  = ev.couple   || {};

    const dateEn = fmtDate(date, 'en');
    const dateId = fmtDate(date, 'id');

    const schedEn = `${fmtTime(sch.ceremony || '')} · ${fmtTime(sch.reception || '')}`;
    const schedId = schedEn.replace('·', '·');

    const wEn = dateEn + (schedEn ? `<small>Ceremony ${sch.ceremony||''} · Reception ${sch.reception||''}</small>` : '');
    const wId = dateId + (schedId ? `<small>Upacara ${sch.ceremony||''} · Resepsi ${sch.reception||''}</small>`  : '');

    const vEn = ven.name ? esc(ven.name) + (ven.address ? `<small>${esc(ven.address)}</small>` : '') : '';
    const vId = vEn; // venue is bilingual — same text

    const dEn = drs.en || '';
    const dId = drs.id || drs.en || '';

    // Build an Object that patches ONLY the keys the user actually filled in,
    // leaving the design's own strings everywhere else.
    const pick = (pairs) => {
      const out = {};
      for (const [target, value] of pairs) {
        if (value) out[target] = value;
      }
      return out;
    };

    const manEn = (cpl.man && cpl.man.en) || {};
    const manId = (cpl.man && cpl.man.id) || {};
    const womanEn = (cpl.woman && cpl.woman.en) || {};
    const womanId = (cpl.woman && cpl.woman.id) || {};
    const heroEn = (txt.hero && txt.hero.en) || {};
    const heroId = (txt.hero && txt.hero.id) || {};
    const introEn = (txt.intro && txt.intro.en) || {};
    const introId = (txt.intro && txt.intro.id) || {};
    const giftEn = (txt.giftMessage && txt.giftMessage.en) || '';
    const giftId = (txt.giftMessage && txt.giftMessage.id) || '';

    const enPatch = pick([
      ['date', dateEn],
      ['w', wEn],
      ['v', vEn],
      ['d', esc(dEn)],
      ['h', esc(heroEn.h)],
      ['hp', esc(heroEn.hp)],
      ['introH', esc(introEn.h)],
      ['introP', esc(introEn.p)],
      ['manP', esc(manEn.p)],
      ['manF', esc(manEn.parents)],
      ['womanP', esc(womanEn.p)],
      ['womanF', esc(womanEn.parents)],
      ['gfp', esc(giftEn)],
      ['caps', Array.isArray(ev.captions && ev.captions.en) && ev.captions.en.length ? ev.captions.en.map(esc) : undefined],
      ['story', Array.isArray(ev.story && ev.story.en) && ev.story.en.length ? ev.story.en.map(esc) : undefined],
    ]);
    const idPatch = pick([
      ['date', dateId],
      ['w', wId],
      ['v', vId],
      ['d', esc(dId)],
      ['h', esc(heroId.h)],
      ['hp', esc(heroId.hp)],
      ['introH', esc(introId.h)],
      ['introP', esc(introId.p)],
      ['manP', esc(manId.p)],
      ['manF', esc(manId.parents)],
      ['womanP', esc(womanId.p)],
      ['womanF', esc(womanId.parents)],
      ['gfp', esc(giftId)],
      ['caps', Array.isArray(ev.captions && ev.captions.id) && ev.captions.id.length ? ev.captions.id.map(esc) : undefined],
      ['story', Array.isArray(ev.story && ev.story.id) && ev.story.id.length ? ev.story.id.map(esc) : undefined],
    ]);

    return (
      `Object.assign(T.en,${JSON.stringify(enPatch)});` +
      `Object.assign(T.id,${JSON.stringify(idPatch)});`
    );
  }

  // ── configJs ─────────────────────────────────────────────────────────────

  /**
   * WedCore.configJs({ url, anonKey, slug })
   * Also accepts configJs(supabaseConfig, { slug }) so older call sites keep
   * working — the slug is never silently dropped.
   * Returns the content of config.js for the generated site.
   */
  function configJs(supabase, opts) {
    const src = supabase || {};
    const extra = opts || {};
    const url = src.url || src.SUPABASE_URL;
    const anonKey = src.anonKey || src.SUPABASE_ANON_KEY;
    const slug = extra.slug || src.slug || src.SLUG;
    const safeUrl = (url  || 'https://YOUR-PROJECT.supabase.co').trim();
    const safeKey = (anonKey || 'YOUR-ANON-KEY').trim();
    const safeSlug = (slug || '').trim();
    return (
      `// Wedding Studio — Supabase config\n` +
      `// Keep this file private; never commit a service_role key here.\n` +
      `window.APP_CONFIG = {\n` +
      `  SUPABASE_URL:      ${JSON.stringify(safeUrl)},\n` +
      `  SUPABASE_ANON_KEY: ${JSON.stringify(safeKey)},\n` +
      `  SLUG:              ${JSON.stringify(safeSlug)}\n` +
      `};\n`
    );
  }

  // ── headers ───────────────────────────────────────────────────────────────

  /**
   * WedCore.headers(slug)
   * Netlify/Cloudflare header rules for an exported site.
   *
   * Both the root-scoped and slug-scoped rules are emitted: an export unzipped
   * as its own project needs the root rules, while one uploaded into a shared
   * host at /{slug}/ needs the slug rules at the publish root.
   */
  function headers(slug) {
    const s = (slug || '').trim();
    const root = '/admin/*\n  X-Robots-Tag: noindex\n/config.js\n  Cache-Control: no-store\n';
    if (!s) return root;
    return root + `/${s}/admin/*\n  X-Robots-Tag: noindex\n/${s}/config.js\n  Cache-Control: no-store\n`;
  }

  // ── exports ───────────────────────────────────────────────────────────────

  global.WedCore = { build, jwtRole, configJs, headers, slugify: slugifyString, makeSlug };

  // Node.js / CommonJS support
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { build, configJs, headers, jwtRole, slugify: slugifyString, makeSlug };
  }

}(typeof window !== 'undefined' ? window : global));