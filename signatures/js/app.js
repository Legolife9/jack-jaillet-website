'use strict';
/* ---------- utilities ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));
const store = {
  get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch{ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
};
function href(s){
  s = String(s || '').trim();
  if (!s) return '';
  // phone links must be digits only, e.g. "tel:(617) 675-3156" becomes "tel:6176753156"
  if (/^(tel|sms):/i.test(s)) return s.slice(0, s.indexOf(':') + 1).toLowerCase() + s.slice(s.indexOf(':') + 1).replace(/[^\d+]/g, '');
  if (/^mailto:/i.test(s)) return 'mailto:' + s.slice(7).trim();
  if (/^https?:/i.test(s)) return s;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'mailto:' + s;
  if (/^\+?[\d\s().-]{7,}$/.test(s)) return 'tel:' + s.replace(/[^\d+]/g, '');
  return 'https://' + s;
}
let toastT;
function toast(msg, action){
  const t = $('#toast'), b = t.querySelector('button');
  t.querySelector('span').textContent = msg; t.hidden = false;
  b.hidden = !action; if (action){ b.textContent = action.label; b.onclick = () => { t.hidden = true; action.fn(); }; }
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, action ? 6000 : 2800);
}
const UNDO = { label:'Undo', fn:() => undo() };

/* ---------- icons ---------- */
const FA = () => (window.___FONT_AWESOME___ || {}).styles || {};
const SETS = { fab:'fa6-brands', fas:'fa6-solid', far:'fa6-regular' };
const I = (set, name) => ({ set, name });
function faDef(ref){ const s = FA()[ref.set]; return s && s[ref.name]; }
function iconSvg(ref, color){
  if (!ref || ref.set === 'custom') return '';
  const d = faDef(ref); if (!d) return '';
  const p = Array.isArray(d[4]) ? d[4].join(' ') : d[4];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d[0]} ${d[1]}"><path fill="${color || 'currentColor'}" d="${p}"/></svg>`;
}
const G = (s, n) => iconSvg(I(s, n));
function iconRatio(ref){ const d = ref && ref.set !== 'custom' && faDef(ref); return d ? d[0] / d[1] : 1; }
const rasterCache = {};
function rasterKey(ref, color, size){ return [ref.set, ref.name, color, size].join('|'); }
function ensureRaster(ref, color, size){
  const k = rasterKey(ref, color, size);
  if (rasterCache[k]) return;
  rasterCache[k] = 'pending';
  const svg = iconSvg(ref, color); if (!svg) return;
  const img = new Image();
  img.onload = () => {
    const h = size * 3, w = Math.round(h * iconRatio(ref));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    rasterCache[k] = c.toDataURL('image/png');
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
// mode: preview (inline svg data) | gmail (hosted PNG link) | embed (PNG data URI)
function iconImg(ref, color, size, ctx){
  if (!ref) return '';
  color = color || '#000000';
  if (ref.set === 'custom'){
    let src = ref.data;
    if (ctx.mode !== 'preview' && ref.url) src = ref.url;
    else if (ctx.mode === 'gmail') ctx.embedded.add('icon "' + (ref.name || 'upload') + '"');
    return `<img src="${esc(src)}" height="${size}" alt="" referrerpolicy="no-referrer" style="display:block;height:${size}px;width:auto;border:0">`;
  }
  const w = Math.round(size * iconRatio(ref));
  let src;
  if (ctx.mode === 'gmail'){
    const inner = `api.iconify.design/${SETS[ref.set]}/${ref.name}.svg?color=${encodeURIComponent(color)}&height=${size * 3}`;
    src = 'https://images.weserv.nl/?url=' + encodeURIComponent(inner) + '&output=png';
  } else {
    ensureRaster(ref, color, size);
    const r = rasterCache[rasterKey(ref, color, size)];
    src = ctx.mode === 'embed' && r && r !== 'pending' ? r : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconSvg(ref, color));
  }
  return `<img src="${esc(src)}" width="${w}" height="${size}" alt="" style="display:block;width:${w}px;height:${size}px;border:0;margin:0 auto">`;
}
function iconChip(ref){
  if (!ref) return '<span class="note">None</span>';
  if (ref.set === 'custom') return `<img src="${esc(ref.data)}" alt="">`;
  return iconSvg(ref);
}

/* ---------- image cropping (photos are cropped on canvas so every client sees the same shape) ---------- */
const cropCache = {};
const ASPECTS = [['orig','Original'],['1:1','Square 1:1'],['4:5','Portrait 4:5'],['3:4','Portrait 3:4'],['4:3','Landscape 4:3'],['16:9','Wide 16:9'],['3:1','Banner 3:1']];
const ratioOf = a => { const [w, h] = a.split(':').map(Number); return w / h; };
let previewQueued = false;
function queuePreview(){ if (previewQueued) return; previewQueued = true; requestAnimationFrame(() => { previewQueued = false; renderPreview(); }); }
// the part of a w×h picture a frame shows: cover the frame, zoom in, then slide to the focus point
function cropRect(w, h, ar, c){
  let sw = w, sh = w / ar;
  if (sh > h){ sh = h; sw = h * ar; }
  sw /= c.zoom || 1; sh /= c.zoom || 1;
  return { sx:Math.round((w - sw) * c.x / 100), sy:Math.round((h - sh) * c.y / 100), sw:Math.round(sw), sh:Math.round(sh) };
}
function cropped(src, crop, outW){
  if (!src || !/^data:image\/(png|jpe?g|webp)/.test(src)) return src;
  if (crop.aspect === 'orig' && crop.zoom <= 1) return src;
  const k = src.length + src.slice(-48) + JSON.stringify(crop) + outW;
  const hit = cropCache[k];
  if (hit) return hit === 'pending' ? src : hit;
  cropCache[k] = 'pending';
  const img = new Image();
  img.onload = () => {
    const ar = crop.aspect === 'orig' ? img.width / img.height : ratioOf(crop.aspect);
    let sw = img.width, sh = sw / ar;
    if (sh > img.height){ sh = img.height; sw = sh * ar; }
    sw /= crop.zoom; sh /= crop.zoom;
    const sx = (img.width - sw) * crop.x / 100, sy = (img.height - sh) * crop.y / 100;
    const W = Math.max(1, Math.round(Math.min(outW, sw))), H = Math.max(1, Math.round(W / ar));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    cropCache[k] = /^data:image\/jpe?g/.test(src) ? c.toDataURL('image/jpeg', .9) : c.toDataURL('image/png');
    queuePreview();
  };
  img.src = src;
  return src;
}

/* ---------- model ---------- */
const FONTS = [
  ['Arial, Helvetica, sans-serif','Arial'],['Helvetica, Arial, sans-serif','Helvetica'],['Verdana, Geneva, sans-serif','Verdana'],
  ['Tahoma, Geneva, sans-serif','Tahoma'],["'Trebuchet MS', Helvetica, sans-serif",'Trebuchet MS'],['Georgia, serif','Georgia'],
  ["'Times New Roman', Times, serif",'Times New Roman'],['Garamond, Georgia, serif','Garamond'],["'Courier New', Courier, monospace",'Courier New'],
  ["'Lucida Sans Unicode', 'Lucida Grande', sans-serif",'Lucida Sans'],["'Segoe UI', Tahoma, sans-serif",'Segoe UI'],["Calibri, Candara, Segoe, sans-serif",'Calibri']
];
const STYLE0 = {
  font:FONTS[0][0], size:14, color:'#1f2328', link:'#2453e6', bg:'#ffffff', bgOn:false, width:0, pad:0,
  bw:0, bs:'solid', bc:'#d0d5dd', br:0, sides:{t:true,r:true,b:true,l:true},
  palette:['#2453e6','#1f2328','#5b6470','#e8eefc','#f2f4f7']
};
const FIELDS0 = [
  { key:'name', label:'Name' }, { key:'title', label:'Job title' }, { key:'email', label:'Email' },
  { key:'phone', label:'Phone' }, { key:'photo', label:'Photo', type:'image' }
];
const DEF = {
  text:   { label:'Text', text:'Text', size:14, color:'', weight:400, italic:false, upper:false, spacing:0, lh:1.4, link:'', font:'', tag:'', tagPos:'before', tagColor:'', tagItalic:true },
  image:  { label:'Image', orig:'', url:'', source:'upload', field:'photo', width:96, shape:'square', radius:10, crop:{ aspect:'orig', zoom:1, x:50, y:50 }, borderW:0, borderColor:'#d0d5dd', alt:'', link:'' },
  divider:{ label:'Line', thickness:1, style:'solid', color:'#d0d5dd', width:100 },
  spacer: { label:'Space', height:12 },
  contact:{ label:'Contact details', items:[], layout:'stack', sep:'|', iconColor:'#2453e6', iconSize:13, iconBg:'#e8eefc', iconShape:'none', iconPad:4, size:13, color:'', gap:5, labels:false },
  social: { label:'Icon links', items:[], size:14, color:'#ffffff', bg:'#2453e6', shape:'circle', pad:7, gap:6, tsize:12, tcolor:'' },
  button: { label:'Button', text:'Book a call', link:'', bg:'#2453e6', color:'#ffffff', borderW:0, borderColor:'#2453e6', radius:6, padX:16, padY:9, size:13, weight:600, icon:null, iconPos:'left', iconSize:13, inline:false },
  html:   { label:'Custom HTML', html:'<span style="font-size:12px;color:#667085">Custom HTML goes here</span>' }
};
function mk(type, props){ return Object.assign({ id:uid(), type, align:'left', pt:0, pb:6 }, clone(DEF[type]), props || {}); }
function mkCol(blocks, props){ return Object.assign({ id:uid(), width:0, bgOn:false, bg:'#f2f4f7', pad:0, radius:0, blocks:blocks || [] }, props || {}); }
function mkRow(cols, props){ return Object.assign({ id:uid(), gap:18, valign:'middle', divW:0, divS:'solid', divC:'#d0d5dd', pt:0, pb:0, full:false, cols:cols.map(c => Array.isArray(c) ? mkCol(c) : c) }, props || {}); }
function newState(name, style, rows){ return { v:2, name, style:Object.assign(clone(STYLE0), style || {}), rows, team:{ fields:clone(FIELDS0), people:[], active:null } }; }

// older saves had one block list with a side/main/footer column flag
/* brand color links: a color stored as "@0".."@4" means that slot of the signature's brand palette */
const isTok = v => typeof v === 'string' && /^@[0-4]$/.test(v);
function resolveColors(st){
  const pal = (st.style && st.style.palette) || STYLE0.palette;
  const walk = o => {
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === 'object'){ const r = {}; for (const k in o) r[k] = k === 'palette' || k === 'team' ? o[k] : walk(o[k]); return r; }
    return isTok(o) ? (pal[+o[1]] || '#000000') : o;
  };
  return walk(st);
}
// colors that match the brand palette (or the starter palette it replaced) become links to it
function linkBrandColors(st){
  const pal = (st.style.palette || []).map(x => x.toLowerCase()), def = STYLE0.palette.map(x => x.toLowerCase());
  const walk = o => { for (const k in o){ if (k === 'palette' || k === 'team') continue; const v = o[k];
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)){ const l = v.toLowerCase(); let i = pal.indexOf(l); if (i < 0) i = def.indexOf(l); if (i >= 0) o[k] = '@' + i; }
    else if (v && typeof v === 'object') walk(v); } };
  walk(st.rows); walk(st.style);
}
function migrate(s){
  s = clone(s);
  if (!s.rows){
    const S = s.style || {}, bl = s.blocks || [];
    bl.forEach(b => { if (b.type === 'image' && b.orig == null){ b.orig = b.src || ''; delete b.src; Object.assign(b, { source:'upload', field:'photo', shape:b.radius >= 50 ? 'circle' : b.radius ? 'rounded' : 'square', crop:{ aspect:b.radius >= 50 ? '1:1' : 'orig', zoom:1, x:50, y:50 } }); } });
    const strip = b => { const c = Object.assign({}, b); delete c.col; return c; };
    if (S.layout === 'split'){
      const side = bl.filter(b => b.col === 'side').map(strip), main = bl.filter(b => b.col === 'main').map(strip), foot = bl.filter(b => b.col === 'footer').map(strip);
      s.rows = [mkRow(side.length ? [mkCol(side, { width:S.sideW || 0, bgOn:!!S.sideBgOn, bg:S.sideBg || '#f2f4f7', pad:S.sidePad || 0 }), mkCol(main)] : [mkCol(main)], { gap:S.gap ?? 18, valign:S.valign || 'middle', divW:S.divW || 0, divS:S.divS || 'solid', divC:S.divC || '#d0d5dd' })];
      if (foot.length) s.rows.push(mkRow([foot]));
    } else s.rows = [mkRow([bl.map(strip)])];
    delete s.blocks;
  }
  s.v = 2;
  s.style = Object.assign(clone(STYLE0), s.style || {});
  ['layout','sideW','gap','valign','divW','divS','divC','sideBg','sideBgOn','sidePad'].forEach(k => delete s.style[k]);
  s.team = s.team || { fields:clone(FIELDS0), people:[], active:null };
  if (!s.linked){ linkBrandColors(s); s.linked = 1; }
  return s;
}

/* ---------- placeholder art (example content) ---------- */
function avatarData(initials, bg, fg){
  const c = document.createElement('canvas'); c.width = 300; c.height = 360; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 300, 360);
  g.fillStyle = fg; g.globalAlpha = .18; g.beginPath(); g.arc(150, 150, 70, 0, 7); g.fill(); g.beginPath(); g.ellipse(150, 350, 120, 110, 0, 0, 7); g.fill();
  g.globalAlpha = 1; g.font = '600 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(initials, 150, 156);
  return c.toDataURL('image/jpeg', .9);
}
function logoData(word, color){
  const c = document.createElement('canvas'); c.width = 520; c.height = 120; const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.moveTo(20, 95); g.lineTo(60, 20); g.lineTo(100, 95); g.closePath(); g.fill();
  g.font = '700 54px Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText(word, 120, 62); return c.toDataURL('image/png');
}
function bannerData(t1, t2, bg, fg){
  const c = document.createElement('canvas'); c.width = 1200; c.height = 300; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1200, 300);
  g.fillStyle = fg; g.globalAlpha = .12; for (let i = 0; i < 6; i++){ g.beginPath(); g.arc(1050 - i * 40, 150, 220 - i * 30, 0, 7); g.fill(); }
  g.globalAlpha = 1; g.font = '700 64px Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText(t1, 60, 120);
  g.font = '400 36px Arial, sans-serif'; g.fillText(t2, 60, 200); return c.toDataURL('image/jpeg', .88);
}
// a block letter beside two lines of text, like a university mark
function markData(ch, t1, t2, color){
  const c = document.createElement('canvas'); c.width = 312; c.height = 120; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 120, 120);
  g.fillStyle = '#ffffff'; g.font = '900 96px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 60, 66);
  g.fillStyle = color; g.textAlign = 'left'; g.font = '700 46px Arial, sans-serif'; g.fillText(t1, 136, 40);
  g.font = '400 34px Arial, sans-serif'; g.fillText(t2, 136, 90); return c.toDataURL('image/png');
}
// sample art is drawn once per look and reused
const ARTC = {};
const memo = (k, f) => ARTC[k] || (ARTC[k] = f());
const avatar = (ini, bg, fg) => memo('a' + ini + bg, () => avatarData(ini, bg, fg));
const logo = (w, c) => memo('l' + w + c, () => logoData(w, c));
const banner = (t1, t2, bg, fg) => memo('b' + t1 + bg, () => bannerData(t1, t2, bg, fg));
let samplePeople = []; // filled by presets(); the fictional people withMe() swaps out
const mark = (ch, t1, t2, c) => memo('m' + ch + t1 + t2 + c, () => markData(ch, t1, t2, c));
function presets(){
  // sample people are fictional; 555-01xx numbers are reserved for fiction
  const who = o => Object.assign({ phone:'(503) 555-0148', city:'Portland, OR' }, o);
  const contacts = (w, n = 3) => [
    { icon:I('fas','phone'), text:w.phone, link:'tel:' + w.phone.replace(/[^\d+]/g, '') },
    { icon:I('fas','envelope'), text:w.email, link:'mailto:' + w.email },
    { icon:I('fas','globe'), text:w.web, link:'https://' + w.web },
    { icon:I('fas','location-dot'), text:w.city, link:'' }
  ].slice(0, n);
  const plain = items => items.map(i => Object.assign(i, { icon:null }));
  const SITES = { 'linkedin-in':'linkedin.com', 'x-twitter':'x.com', 'vimeo-v':'vimeo.com', apple:'podcasts.apple.com' };
  const socials = (...names) => (names.length ? names : ['linkedin-in','instagram','x-twitter']).map(n => ({ icon:I('fab', n), link:'https://' + (SITES[n] || n + '.com') }));
  const photo = (w, ini, bg, fg, p) => mk('image', Object.assign({ label:'Headshot', sample:['a', ini, bg, fg].join('|'), width:92, shape:'circle', crop:{ aspect:'1:1', zoom:1, x:50, y:30 }, alt:w.name }, p));
  const T = (label, text, p) => mk('text', Object.assign({ label, text, pb:0 }, p));
  const fine = (text, p) => [mk('divider', { pt:4, pb:8 }), T('Disclaimer', text, Object.assign({ size:10, color:'#98a2b3' }, p))];
  const btn = (text, icon, link, color, p) => mk('button', Object.assign({ text, icon, link, bg:color, borderColor:color, size:12, padY:7, pb:0 }, p));

  const mo = who({ name:'Marisol Okafor', email:'marisol@fernhill.studio', web:'fernhill.studio' });
  const th = who({ name:'Theo Lindqvist', email:'hello@theolindqvist.design', web:'theolindqvist.design', phone:'(206) 555-0193', city:'Seattle, WA' });
  const ab = who({ name:'Dr. Amara Bello', email:'abello@brightwaterclinic.org', web:'brightwaterclinic.org', phone:'(312) 555-0127', city:'Chicago, IL' });
  const df = who({ name:'Daniel Ferreira', email:'daniel@harborvine.realty', web:'harborvine.realty', phone:'(619) 555-0162', city:'San Diego, CA' });
  const kw = who({ name:'Kenji Watanabe', email:'kenji@tidepool.dev', web:'tidepool.dev', phone:'(415) 555-0110', city:'San Francisco, CA' });
  const pn = who({ name:'Priya Natarajan', email:'pnatarajan@westbrook.edu', web:'linkedin.com/in/priyanatarajan' });
  const rh = who({ name:'Rachel Hart', email:'rhart@callowayhart.law', web:'callowayhart.law', phone:'(212) 555-0139', city:'New York, NY' });
  const lb = who({ name:'Luis Becerra', email:'luis@riverbendfoodshare.org', web:'riverbendfoodshare.org', phone:'(512) 555-0186', city:'Austin, TX' });
  const nj = who({ name:'Nadia Jamal', email:'nadia@thelongcommute.fm', web:'thelongcommute.fm' });
  const ow = who({ name:'Oliver Wren', email:'oliver.wren@meridianfreight.com', web:'meridianfreight.com', phone:'(404) 555-0108', city:'Atlanta, GA' });
  const ac = who({ name:'Avery Collins', email:'hello@averycollins.photo', web:'averycollins.photo', phone:'+1 978 555 0144', city:'Fitchburg, MA' });
  const mb = who({ name:'Maya Brennan', email:'mbrennan@umass.edu', web:'linkedin.com/in/mayabrennan', phone:'(413) 555-0172', city:'Amherst, MA' });
  samplePeople = [mo, th, ab, df, kw, pn, rh, lb, nj, ow, mb];

  return [
    /* ---------- Business ---------- */
    { key:'split', cat:'Business', name:'Photo + details', state:newState('Photo + details', {}, [
      mkRow([[photo(mo, 'MO', '#dfe7fd', '#2453e6', { align:'center', pb:0 })],
             [T('Name', mo.name, { size:19, weight:700, pb:2, tag:'she/her', tagPos:'after' }), T('Title', 'Program Coordinator', { size:13, color:'#5b6470' }), T('Company', 'Fernhill Studio', { size:13, weight:700, color:'#2453e6', pb:10 }),
              mk('contact', { items:contacts(mo), pb:10 }), mk('social', { items:socials(), size:12, pb:10 }),
              btn('Book a meeting', I('far','calendar'), 'https://calendly.com', '#2453e6', { padX:14 })]], { divW:2, divC:'#2453e6' }),
      mkRow([fine('This message may contain confidential information intended only for the recipient.')], { pt:14 })
    ])},
    { key:'corporate', cat:'Business', name:'Corporate logo bar', state:newState('Corporate logo bar', { font:FONTS[10][0], palette:['#0b3d91','#1d2433','#5b6470','#e7eefb','#f2f4f7'] }, [
      mkRow([[mk('image', { label:'Logo', sample:'l|MERIDIAN|#0b3d91', width:150, pb:0 })],
             [T('Name', ow.name, { size:17, weight:700, color:'#1d2433', pb:1 }), T('Title', 'Director of Operations', { size:13, color:'#5b6470', pb:8 }),
              mk('contact', { items:contacts(ow, 2), layout:'inline', size:12, iconSize:11, iconColor:'#0b3d91', pb:0 })]], { divW:1, divC:'#c9d3e6', gap:24 }),
      mkRow([mkCol([T('Tagline', 'Freight that shows up on time.   [meridianfreight.com](https://meridianfreight.com)', { size:12, color:'#ffffff', weight:600 })], { bgOn:true, bg:'#0b3d91', pad:10, radius:6 })], { pt:14, full:true })
    ])},
    { key:'three', cat:'Business', name:'Three columns', state:newState('Three columns', {}, [
      mkRow([[mk('image', { label:'Logo', sample:'l|FERNHILL|#1f2328', width:130, pb:0 })],
             [T('Name', mo.name, { size:17, weight:700, pb:2 }), T('Title', 'Program Coordinator', { size:13, color:'#5b6470', pb:8 }), mk('contact', { items:contacts(mo, 2), size:12, iconSize:11, pb:0 })],
             [mk('social', { items:socials(), size:12, pb:10, align:'center' }), btn('Schedule', I('far','calendar'), 'https://calendly.com', '#2453e6', { padX:12, align:'center', radius:20 })]],
        { divW:1, divC:'#d0d5dd', gap:22 })
    ])},
    { key:'executive', cat:'Business', name:'Executive', state:newState('Executive', { font:FONTS[5][0], color:'#1b2a41', bw:2, bc:'#1b2a41', sides:{ t:true, r:false, b:false, l:false }, palette:['#1b2a41','#3d5a80','#6b7a90','#e0e6ef','#f4f6f9'] }, [
      mkRow([[T('Name', ow.name, { size:20, pt:12, color:'#1b2a41' }), T('Title', '*Chief Executive Officer*', { size:14, color:'#3d5a80', pb:10 }),
              T('Company', 'MERIDIAN FREIGHT', { size:11, weight:700, spacing:2.5, color:'#1b2a41', pb:6 }),
              T('Details', `${ow.phone}   |   [${ow.web}](https://${ow.web})`, { size:12, color:'#6b7a90' })]])
    ])},
    { key:'sales', cat:'Business', name:'Sales with booking', state:newState('Sales with booking', { palette:['#0f766e','#13312e','#5b6b69','#dff3ef','#f2f7f6'] }, [
      mkRow([[photo(mo, 'MO', '#dff3ef', '#0f766e', { width:72, pb:0 })],
             [T('Name', mo.name, { size:17, weight:700, color:'#13312e', pb:1 }), T('Title', 'Account Executive, Fernhill Studio', { size:13, color:'#5b6b69', pb:8 }),
              mk('contact', { items:contacts(mo, 2), layout:'inline', size:12, iconSize:11, iconColor:'#0f766e', pb:0 })]], { gap:16 }),
      mkRow([[btn('Grab 15 minutes on my calendar', I('far','calendar-check'), 'https://calendly.com', '#0f766e', { radius:8, padY:10, size:13 })]], { pt:14 })
    ])},
    { key:'classic', cat:'Business', name:'Classic stacked', state:newState('Classic stacked', { font:FONTS[5][0] }, [
      mkRow([[T('Name', mo.name, { size:18, weight:700 }), T('Title', 'Program Coordinator, *Fernhill Studio*', { size:13, color:'#5b6470', pb:8 }),
              mk('divider', { width:40, thickness:2, color:'#1f2328', pb:8 }),
              mk('contact', { items:contacts(mo), layout:'inline', iconSize:11, iconColor:'#1f2328', size:12, pb:10 }),
              mk('social', { items:socials(), shape:'none', color:'#1f2328', size:16, gap:12 })]])
    ])},
    { key:'minimal', cat:'Business', name:'Minimal', state:newState('Minimal', {}, [
      mkRow([[T('Name', `**${mo.name}**  Program Coordinator, Fernhill Studio`, { size:13, pb:2 }),
              T('Links', `[${mo.web}](https://${mo.web})   ${mo.phone}`, { size:12, color:'#5b6470' })]])
    ])},

    /* ---------- Creative ---------- */
    { key:'creative', cat:'Creative', name:'Creative portfolio', state:newState('Creative portfolio', { font:FONTS[4][0], color:'#16161d', palette:['#e0245e','#16161d','#6e6e7a','#fde7ef','#f5f5f7'] }, [
      mkRow([[T('Name', 'THEO LINDQVIST', { size:22, weight:800, spacing:3, color:'#16161d', tag:'he/him', tagPos:'after', tagColor:'#e0245e' }),
              T('Title', 'Brand & motion designer', { size:13, color:'#e0245e', weight:600, pb:10 }),
              mk('contact', { items:plain(contacts(th, 2)), layout:'inline', sep:'/', size:12, color:'#6e6e7a', pb:12 }),
              mk('social', { items:socials('dribbble','behance','instagram','vimeo-v'), shape:'none', color:'#16161d', size:17, gap:14, pb:12 }),
              btn('See my work', I('fas','arrow-right'), 'https://' + th.web, '#16161d', { iconPos:'right', radius:999, padX:18 })]])
    ])},
    { key:'right', cat:'Creative', name:'Photo on the right', state:newState('Photo on the right', { font:FONTS[4][0] }, [
      mkRow([[T('Name', mo.name, { size:19, weight:700, pb:2, tag:'she/her', tagPos:'after' }), T('Title', 'Program Coordinator', { size:13, color:'#5b6470' }), T('Company', 'Fernhill Studio', { size:13, weight:700, color:'#2453e6', pb:8 }),
              mk('contact', { items:contacts(mo), iconShape:'circle', iconColor:'#ffffff', iconBg:'#2453e6', iconSize:10, iconPad:5, pb:0 })],
             [photo(mo, 'MO', '#dfe7fd', '#2453e6', { shape:'rounded', radius:14, width:110, crop:{ aspect:'4:5', zoom:1, x:50, y:30 }, pb:0 })]], { gap:24 })
    ])},
    { key:'dark', cat:'Creative', name:'Dark card', state:newState('Dark card', { bgOn:true, bg:'#111827', color:'#e5e7eb', link:'#6ee7b7', pad:20, br:14, palette:['#34d399','#111827','#9ca3af','#1f2937','#e5e7eb'] }, [
      mkRow([[photo(kw, 'KW', '#1f2937', '#34d399', { width:76, pb:0 })],
             [T('Name', kw.name, { size:18, weight:700, color:'#f9fafb', pb:1, tag:'he/him', tagPos:'after', tagColor:'#9ca3af' }), T('Title', 'Founding Engineer, Tidepool', { size:13, color:'#9ca3af', pb:10 }),
              mk('contact', { items:contacts(kw, 2), size:12, iconSize:11, iconColor:'#34d399', color:'#e5e7eb', pb:10 }),
              mk('social', { items:socials('github','linkedin-in','x-twitter'), shape:'rounded', bg:'#1f2937', color:'#34d399', size:13, pad:7, pb:0 })]], { gap:18 })
    ])},
    { key:'banner', cat:'Creative', name:'With event banner', state:newState('With event banner', {}, [
      mkRow([[photo(mo, 'MO', '#dfe7fd', '#2453e6', { width:64, pb:0 })], [T('Name', mo.name, { size:16, weight:700 }), T('Title', 'Program Coordinator, Fernhill Studio', { size:13, color:'#5b6470', pb:6 }), mk('contact', { items:contacts(mo), layout:'inline', size:12, iconSize:11, pb:0 })]], { gap:14 }),
      mkRow([[mk('image', { label:'Banner', sample:'b|Fernhill Open Studio|Portland, March 12-13. Save your seat.|#2453e6|#ffffff', width:440, shape:'rounded', radius:8, link:'https://fernhill.studio/open-studio', alt:'Fernhill Open Studio, March 12-13 in Portland', pb:0 })]], { pt:14 })
    ])},
    { key:'creator', cat:'Creative', name:'Podcast & creator', state:newState('Podcast & creator', { palette:['#7c3aed','#1e1b2e','#6b6880','#ede9fe','#f6f5fb'] }, [
      mkRow([[photo(nj, 'NJ', '#ede9fe', '#7c3aed', { width:80, shape:'rounded', radius:16, pb:0 })],
             [T('Name', nj.name, { size:17, weight:700, color:'#1e1b2e', pb:1, tag:'she/they', tagPos:'after', tagColor:'#7c3aed' }), T('Title', 'Host of *The Long Commute*', { size:13, color:'#6b6880', pb:8 }),
              mk('social', { items:socials('spotify','apple','youtube','tiktok'), shape:'circle', bg:'#7c3aed', size:12, pad:7, pb:0 })]], { gap:16 }),
      mkRow([[btn('New episode every Tuesday', I('fas','headphones'), 'https://' + nj.web, '#ede9fe', { color:'#5b21b6', radius:8, padY:8 })]], { pt:12 })
    ])},

    /* ---------- Industry ---------- */
    { key:'realestate', cat:'Industry', name:'Real estate agent', state:newState('Real estate agent', { font:FONTS[2][0], palette:['#b45309','#1c1917','#57534e','#fef3c7','#f5f5f4'] }, [
      mkRow([[photo(df, 'DF', '#fef3c7', '#b45309', { width:104, shape:'rounded', radius:10, crop:{ aspect:'4:5', zoom:1, x:50, y:30 }, pb:0 })],
             [T('Name', df.name, { size:18, weight:700, color:'#1c1917', pb:1 }), T('Title', 'Realtor, Harbor & Vine Realty', { size:13, color:'#57534e', pb:6 }),
              T('Phone', `**${df.phone}**`, { size:16, color:'#b45309', link:'tel:6195550162', pb:6 }),
              mk('contact', { items:contacts(df, 3).slice(1), size:12, iconSize:11, iconColor:'#b45309', pb:10 }),
              btn('See my listings', I('fas','house'), 'https://' + df.web, '#b45309', { radius:6 })]], { gap:18, divW:3, divC:'#b45309' }),
      mkRow([fine('CA DRE #02148867. Equal Housing Opportunity.')], { pt:12 })
    ])},
    { key:'clinic', cat:'Industry', name:'Healthcare', state:newState('Healthcare', { palette:['#0e7490','#0f2a33','#5a7079','#e0f2f7','#f3f8fa'] }, [
      mkRow([[photo(ab, 'AB', '#e0f2f7', '#0e7490', { width:84, pb:0 })],
             [T('Name', `${ab.name}, MD`, { size:17, weight:700, color:'#0f2a33', pb:1, tag:'she/her', tagPos:'after' }), T('Title', 'Family Medicine, Brightwater Family Clinic', { size:13, color:'#5a7079', pb:8 }),
              mk('contact', { items:contacts(ab, 4), iconShape:'circle', iconBg:'#e0f2f7', iconColor:'#0e7490', iconSize:10, iconPad:5, size:12, pb:10 }),
              btn('Book an appointment', I('far','calendar-plus'), 'https://' + ab.web, '#0e7490', { radius:20 })]], { gap:18 }),
      mkRow([fine('This email may contain protected health information. If you received it in error, please delete it and tell the sender.')], { pt:12 })
    ])},
    { key:'legal', cat:'Industry', name:'Law & finance', state:newState('Law & finance', { font:FONTS[6][0], color:'#1f1f24', palette:['#4a1d3f','#1f1f24','#606068','#efe6ee','#f6f6f7'] }, [
      mkRow([[T('Name', rh.name, { size:17, weight:700 }), T('Title', 'Partner, Calloway Hart LLP', { size:13, color:'#4a1d3f', pb:8 }),
              mk('contact', { items:plain(contacts(rh, 4)), size:12, gap:2, pb:6 })]]),
      mkRow([fine('CONFIDENTIALITY NOTICE: This message and any attachments may contain attorney-client privileged information. If you are not the intended recipient, do not read, copy or forward it; please notify the sender and delete it.', { lh:1.45 })], { pt:8 })
    ])},
    { key:'nonprofit', cat:'Industry', name:'Nonprofit', state:newState('Nonprofit', { palette:['#c2410c','#2b1d16','#6b5d55','#ffedd5','#faf6f3'] }, [
      mkRow([[mk('image', { label:'Logo', sample:'l|RIVERBEND|#c2410c', width:140, pb:8 }),
              T('Name', lb.name, { size:16, weight:700, color:'#2b1d16', pb:1, tag:'he/him', tagPos:'after' }), T('Title', 'Volunteer Coordinator, Riverbend Food Share', { size:13, color:'#6b5d55', pb:8 }),
              mk('contact', { items:contacts(lb, 3), layout:'inline', size:12, iconSize:11, iconColor:'#c2410c', pb:12 }),
              btn('Donate', I('fas','heart'), 'https://' + lb.web + '/give', '#c2410c', { radius:6 }),
              btn('Volunteer', I('fas','hand-holding-heart'), 'https://' + lb.web + '/volunteer', '#ffffff', { inline:true, color:'#c2410c', borderColor:'#c2410c', borderW:1, radius:6 })]])
    ])},

    /* ---------- Personal ---------- */
    { key:'student', cat:'Personal', name:'Student', state:newState('Student', { palette:['#1d4ed8','#172033','#5b6475','#e1e9fd','#f3f5f9'] }, [
      mkRow([[T('Name', pn.name, { size:16, weight:700, color:'#172033', pb:1, tag:'she/her', tagPos:'after' }),
              T('Title', 'B.S. Computer Science, Class of 2027', { size:13, color:'#5b6475' }),
              T('School', 'Westbrook University', { size:13, weight:600, color:'#1d4ed8', pb:8 }),
              mk('contact', { items:[{ icon:I('fas','envelope'), text:pn.email, link:'mailto:' + pn.email }, { icon:I('fab','linkedin'), text:pn.web, link:'https://' + pn.web }], size:12, iconSize:11, iconColor:'#1d4ed8', pb:0 })]])
    ])},
    // UMass Amherst maroon: ringed headshot over the university mark, a thin rule, then name with LinkedIn, school, pronouns, contact
    { key:'umass', cat:'Personal', name:'UMass Amherst', state:newState('UMass Amherst', { font:FONTS[0][0], color:'#1a1a1a', link:'#881c1c', palette:['#881c1c','#1a1a1a','#5c5c5c','#f4e6e6','#f7f4f4'] }, [
      mkRow([[photo(mb, 'MB', '#f4e6e6', '#881c1c', { width:110, borderW:3, borderColor:'#881c1c', align:'center', pb:8 }),
              mk('image', { label:'Logo', sample:'m|M|UMASS|AMHERST|#881c1c', width:96, align:'center', alt:'UMass Amherst', pb:0 })],
             [T('Name', mb.name, { size:20, weight:700, color:'#881c1c', pb:2 }),
              mk('social', { items:[{ icon:I('fab','linkedin'), link:'https://' + mb.web }], inline:true, gapL:8, shape:'none', color:'#0a66c2', size:20, pad:0, pb:2 }),
              T('School', 'Isenberg School of Management', { size:14, color:'#5c5c5c', pb:1 }),
              T('Degree', 'BBA, 2030', { size:14, color:'#5c5c5c', pb:2 }),
              T('Pronouns', '(She/Her/Hers)', { size:13, italic:true, color:'#8c8c8c', pb:10 }),
              mk('contact', { items:contacts(mb, 2).reverse(), size:13, iconSize:18, iconColor:'#881c1c', gap:6, pb:0 })]],
        { divW:1, divC:'#555555', gap:20, valign:'middle' })
    ])},
    // Jack's own signature layout: photo and logo, a navy rule, then two buttons underneath
    { key:'profilebtns', cat:'Personal', name:'Profile with buttons', state:newState('Profile with buttons', { font:FONTS[0][0], color:'#333333', link:'#1a5fc1', palette:['#26355e','#333333','#8c8c8c','#e6e9f2','#f5f6fa'] }, [
      mkRow([[photo(ac, 'AC', '#e6e9f2', '#26355e', { width:120, borderW:2, borderColor:'#26355e', align:'center', pb:10 }),
              mk('image', { label:'Logo', sample:'l|COLLINS|#26355e', width:110, align:'center', alt:'Avery Collins Photography', pb:0 })],
             [T('Name', ac.name, { size:20, weight:700, color:'#26355e', pb:4 }),
              mk('social', { items:[{ icon:I('fab','linkedin'), link:'https://linkedin.com/in/averycollins' }], inline:true, gapL:12, shape:'none', color:'#3b78c4', size:22, pad:0, pb:4 }),
              T('Title', 'Photographer', { size:14, color:'#444444', pb:1 }),
              T('Pronouns', '(They/Them/Theirs)', { size:13, italic:true, color:'#8c8c8c', pb:14 }),
              mk('contact', { items:[{ icon:I('fas','envelope'), text:ac.email, link:'mailto:' + ac.email }, { icon:I('fas','mobile-screen-button'), text:ac.phone, link:'tel:' + ac.phone.replace(/[^\d+]/g, '') }, { icon:I('fas','location-dot'), text:ac.city, link:'' }],
                size:14, iconSize:20, iconColor:'#26355e', gap:16, pb:0 })]],
        { divW:1, divC:'#26355e', gap:30, valign:'middle' }),
      mkRow([[btn('Schedule a Meeting', I('fas','calendar-day'), 'https://' + ac.web + '/book', '#26355e', { size:14, weight:700, padY:13, padX:26, radius:6, iconSize:15 }),
              btn('Save My Contact', I('fas','user'), 'https://' + ac.web + '/contact.vcf', '#ffffff', { inline:true, gapL:12, color:'#26355e', borderColor:'#26355e', borderW:1, size:14, weight:700, padY:13, padX:26, radius:6, iconSize:15 })]], { pt:14 })
    ])},
    { key:'freelance', cat:'Personal', name:'Freelancer', state:newState('Freelancer', { font:FONTS[2][0], palette:['#15803d','#14241a','#5c6b61','#dcfce7','#f3f7f4'] }, [
      mkRow([[photo(th, 'TL', '#dcfce7', '#15803d', { width:60, pb:0 })],
             [T('Name', `**${th.name}**  Freelance copywriter`, { size:14, color:'#14241a', pb:4 }),
              mk('contact', { items:contacts(th, 3), layout:'inline', iconShape:'rounded', iconBg:'#dcfce7', iconColor:'#15803d', iconSize:10, iconPad:4, size:12, pb:0 })]], { gap:14 }),
      mkRow([[T('Availability', `Booking projects for spring. [Reply to this email](mailto:${th.email}) to start.`, { size:12, color:'#15803d', weight:600 })]], { pt:10 })
    ])},
    { key:'card', cat:'Personal', name:'Bold card', state:newState('Bold card', { bgOn:true, bg:'#f5f7ff', pad:20, bw:3, bc:'#2453e6', br:12, sides:{ t:false, r:false, b:false, l:true } }, [
      mkRow([[mk('image', { label:'Logo', sample:'l|FERNHILL|#1f2328', width:150, pb:12 }),
              T('Name', 'MARISOL OKAFOR', { size:15, weight:700, spacing:1.5 }), T('Title', 'Program Coordinator', { size:13, color:'#5b6470', pb:12 }),
              btn('Book a call', I('fas','phone'), 'tel:5035550148', '#2453e6', { radius:20, size:13, padY:9, padX:16 }),
              btn('Portfolio', I('fas','arrow-up-right-from-square'), 'https://fernhill.studio', '#ffffff', { iconPos:'right', inline:true, color:'#2453e6', borderColor:'#2453e6', borderW:1, radius:20, size:13, padY:9, padX:16 })]])
    ])}
  ];
}
const PRESET_CATS = ['All', 'Business', 'Creative', 'Industry', 'Personal'];

/* ---------- rendering (email-safe tables, inline styles) ---------- */
let P = null; // active person's field values while rendering
const M = s => (P && typeof s === 'string') ? s.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => P[k] ?? '') : (s ?? '');
const usesField = s => typeof s === 'string' && /\{\{/.test(s);
function personFor(st, pid){
  const ps = (st.team && st.team.people) || [];
  if (!ps.length) return null;
  return ps.find(p => p.id === (pid || st.team.active)) || ps[0];
}
function rich(s, linkColor){
  // **bold**, *italic*, [text](url) — escaped first, so only these forms become markup
  return esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${href(u.replace(/&amp;/g, '&')).replace(/"/g, '&quot;')}" style="color:${linkColor};text-decoration:none">${t}</a>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}
function wrapLink(html, link, color){
  const h = href(M(link)); if (!h) return html;
  return `<a href="${esc(h)}" style="color:${color};text-decoration:none">${html}</a>`;
}
const T0 = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
// sample pictures in the templates are drawn in the browser from a short key, so they never take up storage
function sampleArt(key){
  const [k, a, b2, c, d] = String(key).split('|');
  return k === 'a' ? avatar(a, b2, c) : k === 'l' ? logo(a, b2) : k === 'b' ? banner(a, b2, c, d) : k === 'm' ? mark(a, b2, c, d) : '';
}
// a hosted image, cropped to the chosen frame by images.weserv.nl (a free image service) when a frame is set
function cropUrl(url, b){
  const c = b.crop;
  if (c.aspect === 'orig') return url;
  const ar = ratioOf(c.aspect), W = Math.min(800, b.width * 2), H = Math.round(W / ar), d = c.dim;
  if (c.zoom > 1 && d && d.url === url){
    const r = cropRect(d.w, d.h, ar, c);
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(url) + `&precrop&cx=${r.sx}&cy=${r.sy}&cw=${r.sw}&ch=${r.sh}&w=${W}&h=${H}&fit=cover`;
  }
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(url) + `&w=${W}&h=${H}&fit=cover&a=focal-${Math.round(b.crop.x)}-${Math.round(b.crop.y)}`;
}
function imageSrc(b, ctx){
  // the link can hold {{fields}}, e.g. https://site.com/team/{{photo_id}}.jpg; an unfilled field means no link
  let url = M(b.url || '').trim();
  const blank = [...(b.url || '').matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].some(m => !P || !String(P[m[1]] || '').trim());
  if (blank || !/^https?:\/\//i.test(url)) url = '';
  if (b.source === 'field' && P){ const v = String(P[b.field] || '').trim(); url = /^https?:\/\//i.test(v) ? v : ''; }
  if (url) return { src:cropUrl(url, b), remote:true };
  const art = b.source !== 'field' && b.sample ? sampleArt(b.sample) : '';
  if (!art) return { src:'' };
  if (ctx.mode === 'gmail') ctx.embedded.add((b.label || 'image') + ' (sample picture)');
  return { src:cropped(art, b.crop, Math.min(600, b.width * 2)) };
}
function renderBlock(b, ctx){
  const S = ctx.S, color = b.color || S.color, mode = ctx.mode;
  switch (b.type){
    case 'text': {
      const t = M(b.text); if (!t.trim()) return '';
      const st = `font-family:${b.font || S.font};font-size:${b.size}px;line-height:${b.lh};color:${color};font-weight:${b.weight};` +
        (b.italic ? 'font-style:italic;' : '') + (b.upper ? 'text-transform:uppercase;' : '') + (b.spacing ? `letter-spacing:${b.spacing}px;` : '');
      // a small label beside the text, for pronouns or credentials
      const tg = M(b.tag || '').trim();
      const tagH = tg ? `<span style="font-family:${b.font || S.font};font-size:${Math.max(9, Math.round(b.size * .72))}px;font-weight:400;font-style:${b.tagItalic === false ? 'normal' : 'italic'};text-transform:none;letter-spacing:0;color:${b.tagColor || '#667085'}">${esc(tg)}</span>` : '';
      const main = `<span style="${st}">${rich(t, S.link)}</span>`;
      // the line height goes on a block around the text too: an inline span can't make its line shorter than the cell's own line
      return `<div style="font-size:${b.size}px;line-height:${b.lh}">${wrapLink(tagH ? (b.tagPos === 'after' ? main + '&nbsp;&nbsp;' + tagH : tagH + '&nbsp;&nbsp;' + main) : main, b.link, color)}</div>`;
    }
    case 'image': {
      const { src, remote } = imageSrc(b, ctx);
      const ar = b.crop.aspect !== 'orig' ? ratioOf(b.crop.aspect) : 0;
      const hgt = ar ? Math.round(b.width / ar) : 0;
      const r = b.shape === 'circle' ? '50%' : b.shape === 'pill' ? '9999px' : b.shape === 'rounded' ? b.radius + 'px' : '0';
      if (!src || (remote && mode === 'preview')){
        if (mode !== 'preview') return '';
        // if the link can't load, a stand-in with the real size, shape and border takes its place
        const msg = remote ? "This image link didn't load" : b.source === 'field' ? `No ${b.field} link for this person` : 'Add an image link';
        const ph = hgt || (b.shape === 'circle' ? b.width : Math.round(b.width * .62));
        const bd = b.borderW ? `${b.borderW}px solid ${b.borderColor}` : '1px dashed #b0b7c3';
        const box = `<span title="${esc(remote ? src : msg)}" style="display:inline-flex;width:${b.width}px;height:${ph}px;box-sizing:border-box;border:${bd};border-radius:${r === '0' ? '0' : r};background:#f2f4f7;color:#8a93a3;font:${b.width < 80 ? 9 : 11}px/1.25 Arial;text-align:center;align-items:center;justify-content:center;padding:6px;overflow:hidden;vertical-align:middle">${esc(msg)}</span>`;
        if (!remote) return box;
        // show the real image; if the link fails, the stand-in takes its place (see wireRemoteImages)
        const ist = `display:inline-block;width:${b.width}px;${hgt ? `height:${hgt}px;` : 'height:auto;'}border-radius:${r};border:${b.borderW ? `${b.borderW}px solid ${b.borderColor}` : '0'};vertical-align:middle`;
        return `<span class="rimg" data-ph="${esc(box)}"><img src="${esc(src)}" width="${b.width}" alt="${esc(M(b.alt))}" style="${ist}"></span>`;
      }
      const st = `display:inline-block;width:${b.width}px;${hgt ? `height:${hgt}px;` : 'height:auto;'}border-radius:${r};border:${b.borderW ? `${b.borderW}px solid ${b.borderColor}` : '0'};vertical-align:middle`;
      return wrapLink(`<img src="${esc(src)}" width="${b.width}"${hgt ? ` height="${hgt}"` : ''} alt="${esc(M(b.alt))}" style="${st}">`, b.link, S.link);
    }
    case 'divider': {
      const al = b.align === 'center' ? 'margin:0 auto' : b.align === 'right' ? 'margin:0 0 0 auto' : '';
      return `<table ${T0} width="${b.width}%" style="width:${b.width}%;border-collapse:collapse;${al}"><tr><td style="border-top:${b.thickness}px ${b.style} ${b.color};font-size:0;line-height:0;height:1px">&nbsp;</td></tr></table>`;
    }
    case 'spacer':
      return `<div style="height:${b.height}px;line-height:${b.height}px;font-size:0">&nbsp;</div>`;
    case 'contact': {
      const ic = ref => {
        if (!ref) return '';
        const img = iconImg(ref, b.iconColor, b.iconSize, ctx);
        if (b.iconShape === 'none') return img;
        const rad = b.iconShape === 'circle' ? '50%' : b.iconShape === 'rounded' ? '4px' : '0';
        return `<table ${T0}><tr><td bgcolor="${b.iconBg}" align="center" width="${b.iconSize + 2 * b.iconPad}" style="background:${b.iconBg};border-radius:${rad};padding:${b.iconPad}px 0;width:${b.iconSize + 2 * b.iconPad}px">${img}</td></tr></table>`;
      };
      const ts = `font-family:${S.font};font-size:${b.size}px;color:${color};line-height:1.35`;
      const items = b.items.map(i => Object.assign({}, i, { t:M(i.text) })).filter(i => i.t.trim());
      if (!items.length) return '';
      if (b.layout === 'inline'){
        const cells = items.map((it, n) =>
          (n ? `<td style="${ts};padding:0 ${b.gap + 2}px;color:#b0b7c3">${esc(b.sep)}</td>` : '') +
          (it.icon ? `<td valign="middle" style="padding-right:${b.gap}px">${ic(it.icon)}</td>` : '') +
          `<td valign="middle" style="${ts};white-space:nowrap">${wrapLink(esc(it.t), it.link, color)}</td>`).join('');
        return `<table ${T0} style="border-collapse:collapse;display:inline-table"><tr>${cells}</tr></table>`;
      }
      const rows = items.map((it, n) => `<tr>` +
        (items.some(i => i.icon) ? `<td valign="middle" style="padding:${n ? b.gap : 0}px ${b.gap + 3}px 0 0;width:1%">${ic(it.icon)}</td>` : '') +
        `<td valign="middle" style="${ts};padding-top:${n ? b.gap : 0}px">${wrapLink(esc(it.t), it.link, color)}</td></tr>`).join('');
      return `<table ${T0} style="border-collapse:collapse;display:inline-table">${rows}</table>`;
    }
    case 'social': {
      const rad = b.shape === 'circle' ? '50%' : b.shape === 'rounded' ? '6px' : '0';
      const cells = b.items.filter(i => i.icon && !(usesField(i.link) && !M(i.link).trim())).map((it, n) => {
        let img = iconImg(it.icon, b.color, b.size, ctx);
        if (b.shape !== 'none') img = `<table ${T0}><tr><td bgcolor="${b.bg}" align="center" width="${b.size + 2 * b.pad}" style="background:${b.bg};border-radius:${rad};padding:${b.pad}px 0;width:${b.size + 2 * b.pad}px">${img}</td></tr></table>`;
        // an optional title beside the icon ("LinkedIn", "Follow us"), linked the same way
        const t = M(it.text || '').trim(), tc = b.tcolor || S.color;
        if (t) return `<td style="padding-left:${n ? b.gap : 0}px"><table ${T0} style="border-collapse:collapse"><tr><td valign="middle">${wrapLink(img, it.link, b.color)}</td>` +
          `<td valign="middle" style="padding-left:6px;font-family:${S.font};font-size:${b.tsize || 12}px;line-height:1.3;color:${tc};white-space:nowrap">${wrapLink(esc(t), it.link, tc)}</td></tr></table></td>`;
        return `<td style="padding-left:${n ? b.gap : 0}px">${wrapLink(img, it.link, b.color)}</td>`;
      }).join('');
      return cells ? `<table ${T0} style="border-collapse:collapse;display:inline-table"><tr>${cells}</tr></table>` : '';
    }
    case 'button':
      return buttonCell(b, ctx);
    case 'html':
      return M(b.html);
  }
  return '';
}
function buttonCell(b, ctx){
  const S = ctx.S, t = M(b.text);
  if (!t.trim() && !b.icon) return '';
  const ic = b.icon ? `<td valign="middle" style="${t ? (b.iconPos === 'left' ? 'padding-right:7px' : 'padding-left:7px') : ''}">${iconImg(b.icon, b.color, b.iconSize, ctx)}</td>` : '';
  const tx = t ? `<td valign="middle" style="font-family:${S.font};font-size:${b.size}px;font-weight:${b.weight};color:${b.color};line-height:1.2;white-space:nowrap">${esc(t)}</td>` : '';
  const inner = `<table ${T0}><tr>${b.iconPos === 'left' ? ic + tx : tx + ic}</tr></table>`;
  const bord = b.borderW ? `border:${b.borderW}px solid ${b.borderColor};` : '';
  const h = href(M(b.link));
  const a = h ? `<a href="${esc(h)}" style="display:block;text-decoration:none;color:${b.color};padding:${b.padY}px ${b.padX}px">${inner}</a>` : `<div style="padding:${b.padY}px ${b.padX}px">${inner}</div>`;
  return `<table ${T0} style="border-collapse:separate;display:inline-table"><tr><td bgcolor="${b.bg}" style="background:${b.bg};${bord}border-radius:${b.radius}px">${a}</td></tr></table>`;
}
const pv = (ctx, k, id) => ctx.mode === 'preview' ? ` data-${k}="${id}"` : '';
function renderColumn(blocks, ctx){
  let out = '';
  for (let i = 0; i < blocks.length; i++){
    const b = blocks[i];
    // blocks set to "sit beside the block above" share one row: columns inside a column
    const group = [b];
    while (blocks[i + 1] && blocks[i + 1].inline) group.push(blocks[++i]);
    if (group.length > 1 || b.type === 'button'){
      const va = b.rowAlign || 'middle';
      const cells = group.map(g => [g, g.type === 'button' ? buttonCell(g, ctx) : renderBlock(g, ctx)]).filter(x => x[1])
        .map(([g, h], n) => `<td${pv(ctx, 'bid', g.id)} valign="${va}" style="vertical-align:${va};padding-left:${n ? (g.gapL ?? 8) : 0}px;text-align:${g.align}">${h}</td>`).join('');
      if (cells) out += `<tr><td align="${b.align}" style="padding:${Math.max(b.pt, 0)}px 0 ${Math.max(...group.map(g => Math.max(g.pb, 0)))}px 0;text-align:${b.align}"><table ${T0} style="display:inline-table;border-collapse:collapse"><tr>${cells}</tr></table></td></tr>`;
      continue;
    }
    const inner = renderBlock(b, ctx);
    if (!inner) continue;
    // negative spacing pulls neighbours closer with a margin; padding can't go below zero
    const pull = b.pt < 0 || b.pb < 0 ? `<div style="margin:${Math.min(b.pt, 0)}px 0 ${Math.min(b.pb, 0)}px 0">${inner}</div>` : inner;
    out += `<tr><td${pv(ctx, 'bid', b.id)} align="${b.align}" style="padding:${Math.max(b.pt, 0)}px 0 ${Math.max(b.pb, 0)}px 0;text-align:${b.align}">${pull}</td></tr>`;
  }
  return out ? `<table ${T0} width="100%" style="border-collapse:collapse">${out}</table>` : '';
}
function render(st, mode, pid){
  st = resolveColors(st);
  const S = st.style, person = personFor(st, pid);
  P = person ? person.values : null;
  const ctx = { embedded:new Set(), S, mode };
  let rows = '';
  for (const r of st.rows){
    const cells = [];
    let any = false;
    r.cols.forEach((c, i) => {
      if (i){
        const h1 = Math.floor(r.gap / 2), h2 = r.gap - h1, sp = w => `<td width="${w}" style="width:${w}px;font-size:0;line-height:0">&nbsp;</td>`;
        cells.push(r.divW ? sp(h1) + `<td width="1" style="width:1px;border-left:${r.divW}px ${r.divS} ${r.divC};font-size:0;line-height:0">&nbsp;</td>` + sp(h2) : sp(r.gap));
      }
      let inner = renderColumn(c.blocks, ctx);
      if (inner) any = true;
      else if (mode === 'preview') inner = `<div style="min-width:80px;padding:14px 8px;border:1px dashed #c4cad4;border-radius:6px;color:#98a2b3;font:11px Arial;text-align:center">Empty column</div>`;
      const st2 = `vertical-align:${r.valign};` + (c.width ? `width:${c.width}px;` : '') + (c.bgOn ? `background:${c.bg};` : '') + (c.pad ? `padding:${c.pad}px;` : '') + (c.bgOn && c.radius ? `border-radius:${c.radius}px;` : '');
      cells.push(`<td${pv(ctx, 'cid', c.id)} valign="${r.valign}"${c.width ? ` width="${c.width}"` : ''}${c.bgOn ? ` bgcolor="${c.bg}"` : ''} style="${st2}">${inner}</td>`);
    });
    if (!any && mode !== 'preview') continue;
    rows += `<tr><td${pv(ctx, 'rid', r.id)} style="padding:${r.pt}px 0 ${r.pb}px 0"><table ${T0}${r.full ? ' width="100%"' : ''} style="border-collapse:separate${r.full ? ';width:100%' : ''}"><tr>${cells.join('')}</tr></table></td></tr>`;
  }
  const sd = S.sides, bd = S.bw ? ['top','right','bottom','left'].filter((s, i) => sd['trbl'[i]]).map(s => `border-${s}:${S.bw}px ${S.bs} ${S.bc};`).join('') : '';
  const sst = `font-family:${S.font};font-size:${S.size}px;color:${S.color};line-height:1.4;border-collapse:separate;` +
    (S.bgOn ? `background:${S.bg};` : '') + bd + (S.br ? `border-radius:${S.br}px;` : '') + (S.width ? `width:${S.width}px;` : '');
  const html = `<table ${T0}${S.bgOn ? ` bgcolor="${S.bg}"` : ''}${S.width ? ` width="${S.width}"` : ''} style="${sst}"><tr><td style="padding:${S.pad}px"><table ${T0} style="border-collapse:collapse">${rows}</table></td></tr></table>`;
  P = null;
  return { html, embedded:[...ctx.embedded], person };
}
function plainText(st, pid){
  const person = personFor(st, pid); P = person ? person.values : null;
  const lines = [];
  for (const r of st.rows) for (const c of r.cols) for (const b of c.blocks){
    if (b.type === 'text'){ const t = M(b.text).replace(/\*\*|\*/g, '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)'); if (t.trim()) lines.push(t); }
    if (b.type === 'contact') lines.push(b.items.map(i => M(i.text)).filter(x => x.trim()).join(b.layout === 'inline' ? ` ${b.sep} ` : '\n'));
    if (b.type === 'button' && M(b.text)) lines.push(M(b.text) + (b.link ? ': ' + href(M(b.link)) : ''));
  }
  P = null;
  return lines.filter(Boolean).join('\n');
}

/* ---------- state lookups ---------- */
function find(id){
  for (const r of state.rows){
    if (r.id === id) return { kind:'row', r };
    for (const c of r.cols){
      if (c.id === id) return { kind:'col', r, c };
      const i = c.blocks.findIndex(b => b.id === id);
      if (i >= 0) return { kind:'block', r, c, b:c.blocks[i], i };
    }
  }
  return null;
}
const allCols = () => state.rows.flatMap(r => r.cols.map(c => ({ r, c })));
const rowName = r => r.label || `Row ${state.rows.indexOf(r) + 1}`;
const colLabel = (r, c) => c.label || `Column ${r.cols.indexOf(c) + 1}`;
function colName(r, c){ return r.cols.length > 1 ? `${rowName(r)} · ${colLabel(r, c)}` : rowName(r); }

/* ---------- editor state, history and autosave ---------- */
// every signature lives in the library from the moment it's created, and edits save themselves
let state = null, sigId = null, sel = 'style', view = 'home', step = 'design';
let past = [], future = [], lastSnap = '';
const snapshot = () => JSON.stringify(state);
let histT, saveT, saveStatus = 'saved', saveErr = '', saving = null;
function changed(opts){
  renderPreview();
  if (opts && opts.list) renderList();
  if (opts && opts.insp) renderInspector();
  if (opts && opts.team) renderPeople();
  if (step === 'share') renderShare();
  clearTimeout(histT);
  histT = setTimeout(() => { if (lastSnap && lastSnap !== snapshot()){ past.push(lastSnap); if (past.length > 80) past.shift(); future = []; } lastSnap = snapshot(); updateHead(); }, 350);
  queueSave();
}
function queueSave(){ saveStatus = 'pending'; updateHead(); clearTimeout(saveT); saveT = setTimeout(saveNow, 900); }
async function saveNow(){
  clearTimeout(saveT);
  if (!state || !sigId) return;
  if (saving) await saving; // one write at a time per signature
  if (saveStatus === 'saved') return;
  const p = permsOf(curSig());
  if (!p.edit_design && !p.edit_people){ saveStatus = 'saved'; updateHead(); return; } // view only: nothing to save
  const id = sigId, snap = snapshot(), st = JSON.parse(snap);
  saveStatus = 'saving'; updateHead();
  saving = libSave(id, st.name || 'Untitled signature', st)
    .then(() => { saveErr = ''; saveStatus = id === sigId && snapshot() !== snap ? 'pending' : 'saved'; })
    .catch(e => { saveStatus = 'error'; saveErr = (e && e.message) || 'Could not save.'; toast('Not saved: ' + saveErr); })
    .finally(() => { saving = null; updateHead(); });
  await saving;
  if (saveStatus === 'pending') queueSave();
}
function openSig(id, st){
  state = migrate(st); sigId = id; sel = 'style';
  past = []; future = []; lastSnap = snapshot(); saveStatus = 'saved'; saveErr = '';
  store.set('sigstudio.last', id);
  showView('editor'); setStep('design');
  renderAll();
}
async function closeEditor(){
  await saveNow();
  showView('home');
}
function undo(){ clearTimeout(histT); const cur = snapshot(); if (cur !== lastSnap) past.push(lastSnap); if (!past.length) return; future.push(cur); state = JSON.parse(past.pop()); lastSnap = snapshot(); afterHistory(); }
function redo(){ if (!future.length) return; past.push(snapshot()); state = JSON.parse(future.pop()); lastSnap = snapshot(); afterHistory(); }
function afterHistory(){ if (sel !== 'style' && !find(sel)) sel = 'style'; renderAll(); queueSave(); }
function updateHead(){
  if (!state) return;
  const s = $('#savestate');
  s.textContent = saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Not saved. Retry' : 'Saving…';
  s.classList.toggle('err', saveStatus === 'error');
  s.title = saveStatus === 'error' ? saveErr : 'Changes save automatically';
  $('#undo').disabled = !past.length && snapshot() === lastSnap;
  $('#redo').disabled = !future.length;
}
$('#savestate').onclick = () => { if (saveStatus === 'error'){ saveStatus = 'pending'; saveNow(); } };
$('#tname').oninput = () => { state.name = $('#tname').value; queueSave(); };
function applyPerms(){
  const t = curSig(), p = permsOf(t), V = $('#view-editor');
  V.classList.toggle('ro-design', !p.edit_design);
  $('#tname').readOnly = !p.edit_design;
  $('#nav-people').hidden = !p.view_people;
  if (!p.view_people && step === 'people') setStep('design');
  const b = $('#shbanner');
  b.hidden = !(t && t.sh);
  if (t && t.sh) b.textContent = `Shared by ${t.sh.ownerEmail}. ${permWords(p)}.`;
}
function renderAll(){
  applyPerms();
  $('#tname').value = state.name || '';
  renderList(); renderInspector(); renderPreview(); updateHead(); renderCompanySelect();
  if (step === 'people') renderPeople();
  if (step === 'share') renderShare();
}
function showView(v){
  view = v;
  $('#app').dataset.view = v;
  $('#view-home').hidden = v !== 'home'; $('#view-editor').hidden = v !== 'editor';
  if (v === 'home') renderHome();
}
function setStep(s){
  step = s;
  ['design','people','share'].forEach(k => { $('#step-' + k).hidden = k !== s; $('#nav-' + k).setAttribute('aria-selected', k === s); });
  // one live preview, moved to whichever step is showing
  $('#stage-' + s).appendChild($('#stage'));
  // blocks in the preview can only be picked while designing
  $('#stage').classList.toggle('still', s !== 'design');
  if (s === 'people') renderPeople();
  if (s === 'share') renderShare();
}
['design','people','share'].forEach(k => $('#nav-' + k).onclick = () => setStep(k));
$('#back').onclick = closeEditor;
$('#go-home').onclick = () => { if (view === 'editor') closeEditor(); };

/* ---------- preview & checks ---------- */
const gmailLen = h => h.replace(/data:[^"]+/g, '').length; // embedded images never reach Gmail
function checks(st, pid){
  const out = [], g = render(st, 'gmail', pid), n = gmailLen(g.html);
  if (g.embedded.length) out.push(['warn', `Replace the sample pictures with links to your own images (${g.embedded.join(', ')}). Email apps can't show the samples.`]);
  if (n > 10000) out.push(['warn', `Gmail allows 10,000 characters; this is ${n.toLocaleString()}. Remove blocks or icons, or shorten links.`]);
  const person = personFor(st, pid), V = person ? person.values : null;
  let noLink = 0, noAlt = 0; const missing = new Set();
  for (const r of st.rows) for (const c of r.cols) for (const b of c.blocks){
    if (b.type === 'button' && !b.link) noLink++;
    if (b.type === 'social') noLink += b.items.filter(i => !i.link).length;
    if (b.type === 'image' && !b.alt && (b.sample || b.url || b.source === 'field')) noAlt++;
    if (V) JSON.stringify(b).replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => { if (!V[k]) missing.add(k); });
    if (V && b.type === 'image' && b.source === 'field' && !V[b.field]) missing.add(b.field);
  }
  if (noLink) out.push(['info', `${noLink} button${noLink > 1 ? 's or icons have' : ' or icon has'} no link yet.`]);
  if (noAlt) out.push(['info', `${noAlt} image${noAlt > 1 ? 's have' : ' has'} no alt text. Recipients who block images see the alt text instead.`]);
  if (missing.size) out.push(['info', `${person.values.name || 'This person'} has no value for: ${[...missing].join(', ')}. Those parts are hidden in their copy.`]);
  if (!out.length) out.push(['ok', 'Ready to copy: every image is linked and the size is within Gmail\'s limit.']);
  return { out, n };
}
const chkHtml = list => list.map(([k, t]) => `<div class="chkline ${k === 'info' ? '' : k}"><span class="dot"></span><span>${esc(t)}</span></div>`).join('');
function renderPreview(){
  if (!state) return;
  const r = render(state, 'preview');
  $('#sig').innerHTML = r.html;
  wireRemoteImages($('#sig'));
  markSel();
  const { out, n } = checks(state);
  const m = $('#meter');
  m.textContent = `Gmail size ${n.toLocaleString()} / 10,000`;
  m.classList.toggle('bad', n > 10000);
  $('#checks').innerHTML = chkHtml(out);
  renderPersonSelect();
}
// hosted images: show the real one when this view can load it, otherwise the stand-in box
// every thumbnail is scaled to fit its frame (wide and tall signatures alike), then centered
function fitThumbs(root){
  root.querySelectorAll('.pv, .thumb2').forEach(box => {
    const inner = box.firstElementChild; if (!inner) return;
    const fit = () => {
      const W = box.clientWidth, H = box.clientHeight; if (!W || !H) return;
      inner.style.transform = 'none';
      const w = inner.offsetWidth, h = inner.offsetHeight; if (!w || !h) return;
      const s = Math.min((W - 28) / w, (H - 28) / h, 1);
      inner.style.transform = `translate(${Math.round((W - w * s) / 2)}px, ${Math.round((H - h * s) / 2)}px) scale(${s})`;
    };
    fit();
    inner.querySelectorAll('img').forEach(i => { if (!i.complete) i.addEventListener('load', fit, { once:true }); });
  });
}
let fitT;
addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(() => fitThumbs(document), 150); });
function wireRemoteImages(root){
  root.querySelectorAll('.rimg img').forEach(img => {
    const swap = () => { const sp = img.parentElement; if (sp && sp.dataset.ph){ if (root.id === 'sig') noteBroken(img.getAttribute('src')); sp.outerHTML = sp.dataset.ph; } };
    if (img.complete && img.naturalWidth === 0) swap(); else img.addEventListener('error', swap, { once:true });
  });
}
// an image link that didn't load gets its own warning under the preview
function noteBroken(src){
  const box = $('#checks'); if (!box || [...box.querySelectorAll('[data-broken]')].some(x => x.dataset.broken === src)) return;
  const short = src.length > 70 ? src.slice(0, 67) + '…' : src;
  box.insertAdjacentHTML('afterbegin', `<div class="chkline warn" data-broken="${esc(src)}"><span class="dot"></span><span>An image link didn't load: <code>${esc(short)}</code>. Check the address, and that the image is public (not behind a login).</span></div>`);
  box.querySelectorAll('.chkline.ok').forEach(x => x.remove());
}
function markSel(){ document.querySelectorAll('#sig [data-bid],#sig [data-cid],#sig [data-rid]').forEach(el => el.classList.toggle('on', (el.dataset.bid || el.dataset.cid || el.dataset.rid) === sel)); }
// double-click text in the preview to jump straight to editing it
$('#sig').addEventListener('dblclick', e => {
  const el = e.target.closest('[data-bid]'); if (!el) return;
  if (step !== 'design') return;
  select(el.dataset.bid);
  const f = $('#insp textarea:not(.code)') || $('#insp .grp input[type=text]');
  if (f){ f.focus(); f.select(); }
});
$('#sig').addEventListener('click', e => {
  e.preventDefault();
  if (step !== 'design') return;
  const el = e.target.closest('[data-bid],[data-cid]');
  select(el ? (el.dataset.bid || el.dataset.cid) : 'style');
  toInspector();
});
// on a phone the panes stack, so jump to the settings for whatever was just picked
const toInspector = () => { if (matchMedia('(max-width:880px)').matches) $('#step-design .pane.right').scrollIntoView({ behavior:'smooth', block:'start' }); };
function seg2(a, b, on){ $(a).setAttribute('aria-pressed', on); $(b).setAttribute('aria-pressed', !on); }
$('#pv-light').onclick = () => { $('#mail').classList.remove('dark'); seg2('#pv-light', '#pv-dark', true); };
$('#pv-dark').onclick = () => { $('#mail').classList.add('dark'); seg2('#pv-light', '#pv-dark', false); };
$('#pv-desk').onclick = () => { $('#mail').classList.remove('phone'); seg2('#pv-desk', '#pv-phone', true); };
$('#pv-phone').onclick = () => { $('#mail').classList.add('phone'); seg2('#pv-desk', '#pv-phone', false); };
function personLabel(p, i){ return (p.values.name || '').trim() || `Person ${i + 1}`; }
function renderPersonSelect(){
  const s = $('#pv-person'), ps = state.team.people;
  s.hidden = !ps.length;
  if (!ps.length) return;
  const cur = personFor(state);
  s.innerHTML = ps.map((p, i) => `<option value="${p.id}"${p === cur ? ' selected' : ''}>Preview: ${esc(personLabel(p, i))}</option>`).join('');
}
$('#pv-person').onchange = e => { state.team.active = e.target.value; changed({ team:step === 'people' }); };


/* ---------- layers ---------- */
const GLYPH = { text:'fas:font', image:'fas:image', divider:'fas:minus', spacer:'fas:arrows-up-down', contact:'fas:address-card', social:'fas:share-nodes', button:'fas:hand-pointer', html:'fas:code', style:'fas:sliders', row:'fas:table-columns', col:'fas:table-cells-large' };
const glyph = t => { const [s, n] = GLYPH[t].split(':'); return G(s, n); };
const ADD = [
  ['Name', 'text', () => mk('text', { label:'Name', text:'{{name}}', size:18, weight:700, pb:2 })],
  ['Text', 'text', () => mk('text', { text:'Job title · Company' })],
  ['Photo', 'image', () => mk('image', { label:'Photo', width:88, shape:'circle', crop:{ aspect:'1:1', zoom:1, x:50, y:35 } })],
  ['Logo', 'image', () => mk('image', { label:'Logo', width:140 })],
  ['Contact', 'contact', () => mk('contact', { items:[{ icon:I('fas','phone'), text:'{{phone}}', link:'{{phone}}' }, { icon:I('fas','envelope'), text:'{{email}}', link:'{{email}}' }] })],
  ['Icons', 'social', () => mk('social', { items:[{ icon:I('fab','linkedin-in'), link:'' }, { icon:I('fab','instagram'), link:'' }] })],
  ['Button', 'button', () => mk('button')],
  ['Line', 'divider', () => mk('divider')],
  ['Space', 'spacer', () => mk('spacer')],
  ['Banner', 'image', () => mk('image', { label:'Banner', width:440, shape:'rounded', radius:8, crop:{ aspect:'3:1', zoom:1, x:50, y:50 } })],
  ['Fine print', 'text', () => mk('text', { label:'Disclaimer', text:'Confidentiality notice…', size:10, color:'#98a2b3' })],
  ['HTML', 'html', () => mk('html')]
];
$('#addgrid').innerHTML = ADD.map(([n, t], i) => `<button data-add="${i}" title="Add ${n}">${glyph(t)}<span>${n}</span></button>`).join('');
$('#addgrid').onclick = e => {
  const btn = e.target.closest('[data-add]'); if (!btn) return;
  const b = ADD[+btn.dataset.add][2]();
  if (!state.team.people.length) {
    // without a team, field tokens would show literally — swap in readable sample text
    const sample = { name:'Your Name', phone:'(555) 000-0000', email:'you@example.com' };
    const fix = s => typeof s === 'string' ? s.replace(/\{\{(\w+)\}\}/g, (_, k) => sample[k] || k) : s;
    if (b.text) b.text = fix(b.text);
    (b.items || []).forEach(it => { it.text = fix(it.text); it.link = fix(it.link); });
  }
  const f = find(sel);
  if (f && f.kind === 'block') f.c.blocks.splice(f.i + 1, 0, b);
  else if (f && f.kind === 'col') f.c.blocks.push(b);
  else if (f && f.kind === 'row') f.r.cols[0].blocks.push(b);
  else { if (!state.rows.length) state.rows.push(mkRow([[]])); state.rows[state.rows.length - 1].cols[0].blocks.push(b); }
  sel = b.id; changed({ list:true, insp:true });
};
$('#addrow').innerHTML = `<span class="note" style="width:100%">Add a row</span>` + [1, 2, 3, 4].map(n => `<button class="btn sm" data-cols="${n}">${n} column${n > 1 ? 's' : ''}</button>`).join('');
$('#addrow').onclick = e => {
  const b = e.target.closest('[data-cols]'); if (!b) return;
  const n = +b.dataset.cols, r = mkRow(Array.from({ length:n }, () => []));
  const f = find(sel), at = f && f.r ? state.rows.indexOf(f.r) + 1 : state.rows.length;
  state.rows.splice(at, 0, r); sel = r.id; changed({ list:true, insp:true });
};
function blockName(b){
  if (b.inline) return '↔ ' + blockName(Object.assign({}, b, { inline:false }));
  const strip = s => String(s || '').replace(/\*\*|\*/g, '').split('\n')[0];
  if (b.type === 'text') return (b.label && b.label !== 'Text' ? b.label + ': ' : '') + strip(b.text);
  if (b.type === 'button') return 'Button: ' + b.text;
  return b.label || DEF[b.type].label;
}
const ACTS = { ren:['fas:pen','Rename'], up:['fas:arrow-up','Move up'], down:['fas:arrow-down','Move down'], left:['fas:arrow-left','Move left'], right:['fas:arrow-right','Move right'], dup:['far:copy','Duplicate'], del:['far:trash-can','Delete'] };
const acts = keys => `<span class="acts">${keys.map(k => { const [g, t] = ACTS[k], [s, n] = g.split(':'); return `<button class="iconbtn" data-act="${k}" title="${t}" aria-label="${t}">${G(s, n)}</button>`; }).join('')}</span>`;
let dragId = null;
function renderList(){
  let h = `<li class="bitem${sel === 'style' ? ' sel' : ''}" data-id="style"><span class="ic">${glyph('style')}</span><span class="nm"><b>Signature style</b></span></li>`;
  state.rows.forEach((r, ri) => {
    h += `<li class="bitem rowh${sel === r.id ? ' sel' : ''}" data-id="${r.id}"><span class="ic">${glyph('row')}</span><span class="nm"><b>${esc(rowName(r))}</b> · ${r.cols.length} column${r.cols.length > 1 ? 's' : ''}</span>${acts(['ren','up','down','dup','del'])}</li>`;
    const multi = r.cols.length > 1;
    r.cols.forEach((c, ci) => {
      if (multi) h += `<li class="bitem colh${sel === c.id ? ' sel' : ''}" data-id="${c.id}" data-drop="${c.id}"><span class="nm">${esc(colLabel(r, c))}${c.width ? ` · ${c.width}px` : ''}</span>${acts(['ren','left','right','del'])}</li>`;
      c.blocks.forEach(b => {
        h += `<li class="bitem blk${multi ? ' in' : ''}${sel === b.id ? ' sel' : ''}" data-id="${b.id}" draggable="true"><span class="ic">${glyph(b.type)}</span><span class="nm">${esc(blockName(b))}</span>${acts(['up','down','dup','del'])}</li>`;
      });
      if (!c.blocks.length) h += `<li class="emptycol" data-drop="${c.id}" style="${multi ? '' : 'margin-left:22px'}">Empty. Select it and add a block, or drag one here.</li>`;
    });
  });
  if (!state.rows.length) h += `<li class="empty" style="margin:6px">No rows yet. Add one below.</li>`;
  $('#blist').innerHTML = h;
}
function moveBlock(f, dir){
  const cols = allCols(), ci = cols.findIndex(x => x.c === f.c);
  const j = f.i + dir;
  if (j >= 0 && j < f.c.blocks.length){ [f.c.blocks[f.i], f.c.blocks[j]] = [f.c.blocks[j], f.c.blocks[f.i]]; return; }
  const to = cols[ci + dir]; if (!to) return;
  f.c.blocks.splice(f.i, 1);
  if (dir < 0) to.c.blocks.push(f.b); else to.c.blocks.unshift(f.b);
}
function colCount(r, label){
  const nc = { n:r.cols.length };
  const cnt = segs(nc, 'n', label, [[1,'1'],[2,'2'],[3,'3'],[4,'4']]);
  cnt.querySelector('.seg').addEventListener('click', () => {
    while (r.cols.length < nc.n) r.cols.push(mkCol([]));
    while (r.cols.length > nc.n) removeCol(r, r.cols[r.cols.length - 1]);
    changed({ list:true, insp:true });
  });
  return cnt;
}
function removeCol(r, c){
  const i = r.cols.indexOf(c);
  if (r.cols.length === 1){ state.rows.splice(state.rows.indexOf(r), 1); return; }
  const into = r.cols[i ? i - 1 : 1];
  if (i) into.blocks.push(...c.blocks); else into.blocks.unshift(...c.blocks);
  r.cols.splice(i, 1);
}
function freshIds(o){ o.id = uid(); (o.cols || []).forEach(freshIds); (o.blocks || []).forEach(freshIds); return o; }
$('#blist').addEventListener('click', e => {
  const li = e.target.closest('[data-id]');
  if (!li){ const d = e.target.closest('[data-drop]'); if (d) select(d.dataset.drop); return; }
  const act = e.target.closest('[data-act]');
  if (!act){ select(li.dataset.id); toInspector(); return; }
  const f = find(li.dataset.id), k = act.dataset.act;
  if (k === 'ren'){ renameLayer(li.dataset.id); return; }
  if (f.kind === 'row'){
    const i = state.rows.indexOf(f.r);
    if (k === 'up' && i > 0) [state.rows[i - 1], state.rows[i]] = [state.rows[i], state.rows[i - 1]];
    if (k === 'down' && i < state.rows.length - 1) [state.rows[i + 1], state.rows[i]] = [state.rows[i], state.rows[i + 1]];
    if (k === 'dup'){ const c = freshIds(clone(f.r)); state.rows.splice(i + 1, 0, c); sel = c.id; }
    if (k === 'del'){ state.rows.splice(i, 1); sel = 'style'; toast('Row deleted.', UNDO); }
  } else if (f.kind === 'col'){
    const i = f.r.cols.indexOf(f.c);
    if (k === 'left' && i > 0) [f.r.cols[i - 1], f.r.cols[i]] = [f.r.cols[i], f.r.cols[i - 1]];
    if (k === 'right' && i < f.r.cols.length - 1) [f.r.cols[i + 1], f.r.cols[i]] = [f.r.cols[i], f.r.cols[i + 1]];
    if (k === 'del'){ removeCol(f.r, f.c); sel = 'style'; toast('Column removed; its blocks moved next door.', UNDO); }
  } else {
    if (k === 'del'){ f.c.blocks.splice(f.i, 1); if (sel === f.b.id) sel = 'style'; toast('Block deleted.', UNDO); }
    if (k === 'dup'){ const c = clone(f.b); c.id = uid(); f.c.blocks.splice(f.i + 1, 0, c); sel = c.id; }
    if (k === 'up' || k === 'down') moveBlock(f, k === 'up' ? -1 : 1);
  }
  changed({ list:true, insp:true });
});
function renameLayer(id){ select(id); toInspector(); const n = $('#layername'); if (n){ n.focus(); n.select(); } }
$('#blist').addEventListener('dblclick', e => { const li = e.target.closest('.rowh,.colh'); if (li && !e.target.closest('[data-act]')) renameLayer(li.dataset.id); });
const BL = $('#blist');
BL.addEventListener('dragstart', e => { const li = e.target.closest('.blk'); if (!li) return; dragId = li.dataset.id; li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
BL.addEventListener('dragover', e => {
  if (!dragId) return; e.preventDefault();
  BL.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
  const t = e.target.closest('.blk,[data-drop]'); if (t) t.classList.add('over');
});
BL.addEventListener('drop', e => {
  e.preventDefault();
  const t = e.target.closest('.blk,[data-drop]'), f = dragId && find(dragId);
  if (f && t && t.dataset.id !== dragId){
    f.c.blocks.splice(f.i, 1);
    if (t.classList.contains('blk')){ const g = find(t.dataset.id); g.c.blocks.splice(g.i, 0, f.b); }
    else find(t.dataset.drop).c.blocks.push(f.b);
    changed({ insp:true });
  }
  dragId = null; renderList();
});
BL.addEventListener('dragend', () => { dragId = null; renderList(); });
function select(id){
  sel = id; renderList(); renderInspector(); markSel();
  // stacked phone layout: bring the inspector to the person who just tapped something
  if (id !== 'style' && matchMedia('(max-width:880px)').matches) $('#insp').scrollIntoView({ behavior:matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block:'start' });
}

/* ---------- inspector field builders ---------- */
function el(html){ const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
let fid = 0, lastText = null;
function field(label, node){
  const f = el(`<div class="field"><span>${esc(label)}</span></div>`);
  [node, ...node.querySelectorAll('input,select,textarea')].forEach(x => { if (/INPUT|SELECT|TEXTAREA/.test(x.tagName) && !x.getAttribute('aria-label')) x.setAttribute('aria-label', label); });
  f.appendChild(node); return f;
}
function nameField(o, ph){ const w = txt(o, 'label', 'Name', { list:true, ph }); w.querySelector('input').id = 'layername'; return w; }
function txt(obj, key, label, opts = {}){
  const id = 'f' + (++fid);
  const n = opts.area ? el(`<textarea id="${id}" class="${opts.code ? 'code' : ''}"></textarea>`) : el(`<input id="${id}" type="text" placeholder="${esc(opts.ph || '')}">`);
  n.value = obj[key] ?? '';
  n.oninput = () => { obj[key] = n.value; changed(opts.list ? { list:true } : opts.ch); };
  n.addEventListener('focus', () => lastText = n);
  return field(label, n);
}
function num(obj, key, label, min, max, step = 1, opts){
  const id = 'f' + (++fid);
  const w = el(`<div class="rng"><input type="range" aria-label="${esc(label)}" min="${min}" max="${max}" step="${step}"><input id="${id}" type="number" min="${min}" max="${max}" step="${step}"></div>`);
  const [r, n] = w.querySelectorAll('input'); r.value = n.value = obj[key];
  // the typed box isn't rewritten while typing, so "1." can become "1.2"
  const set = (v, typed) => { if (v === '') return; v = Number(v); if (Number.isNaN(v)) return; obj[key] = v; r.value = v; if (!typed) n.value = v; changed(opts); };
  r.oninput = () => set(r.value); n.oninput = () => set(n.value, true); n.onblur = () => { n.value = obj[key]; };
  return field(label, w);
}
function color(obj, key, label, auto){
  const id = 'f' + (++fid);
  const w = el(`<div class="clr"><input type="color" aria-label="${esc(label)}"><input id="${id}" type="text" maxlength="9"><span class="sw5"></span>${auto ? `<label class="chk"><input type="checkbox">${esc(auto)}</label>` : ''}</div>`);
  const [c, t, a] = w.querySelectorAll('input');
  t.onfocus = () => { if (isTok(obj[key])) t.select(); };
  const sync = () => {
    const v = obj[key], hx = isTok(v) ? state.style.palette[+v[1]] : v;
    c.value = /^#[0-9a-f]{6}$/i.test(hx) ? hx : '#000000'; t.value = isTok(v) ? `Brand ${+v[1] + 1}` : v;
    w.querySelectorAll('.sw5 button').forEach((b, i) => b.classList.toggle('on', v === '@' + i));
    if (a){ a.checked = !v; c.disabled = t.disabled = !v; }
  };
  sync();
  c.oninput = () => { obj[key] = c.value; t.value = c.value; changed(); };
  t.onchange = () => { if (/^#([0-9a-f]{3}){1,2}$/i.test(t.value.trim())){ obj[key] = t.value.trim(); sync(); changed(); } else sync(); };
  if (a) a.onchange = () => { obj[key] = a.checked ? '' : (c.value || '#000000'); sync(); changed(); };
  const sw = w.querySelector('.sw5');
  // picking a swatch links to that brand color, so it follows later brand changes
  state.style.palette.forEach((p, i) => { const b = el(`<button type="button" title="Brand color ${i + 1} (stays in sync with the brand)" aria-label="Use brand color ${i + 1}" style="background:${p}"></button>`); b.onclick = () => { obj[key] = '@' + i; sync(); changed(); }; sw.appendChild(b); });
  sync();
  return field(label, w);
}
// font choices preview in their own face (Chrome and Edge draw this; Safari ignores it)
const fontStyle = v => FONTS.some(f => f[0] === v) ? ` style="font-family:${esc(v)}"` : '';
function sel_(obj, key, label, options, opts = {}){
  const id = 'f' + (++fid);
  const n = el(`<select id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}"${fontStyle(v)}>${esc(l)}</option>`).join('')}</select>`);
  n.value = String(obj[key]);
  n.onchange = () => { const v = n.value; obj[key] = typeof obj[key] === 'number' ? Number(v) : v; changed(opts); };
  return field(label, n);
}
function chk(obj, key, label, opts = {}){
  const w = el(`<label class="chk"><input id="f${++fid}" type="checkbox">${esc(label)}</label>`);
  const c = w.querySelector('input'); c.checked = !!obj[key];
  c.onchange = () => { obj[key] = c.checked; changed(opts); };
  return w;
}
function segs(obj, key, label, options, opts){
  const w = el(`<div class="seg" role="group" aria-label="${esc(label)}">${options.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(obj[key]) === String(v)}">${l}</button>`).join('')}</div>`);
  w.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; obj[key] = typeof obj[key] === 'number' ? Number(b.dataset.v) : b.dataset.v; w.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); changed(opts); };
  return field(label, w);
}
function chips(){
  const fs = state.team.fields.filter(f => f.type !== 'image');
  const w = el(`<div class="chips"><span>Insert field:</span>${fs.map(f => `<button type="button" class="chip" data-k="${f.key}" title="${esc(f.label)}">{{${f.key}}}</button>`).join('')}</div>`);
  w.addEventListener('mousedown', e => e.preventDefault());
  w.onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const n = lastText && document.body.contains(lastText) ? lastText : w.parentElement.querySelector('input[type=text],textarea');
    if (!n) return;
    const tok = `{{${b.dataset.k}}}`, s = n.selectionStart ?? n.value.length, e2 = n.selectionEnd ?? s;
    n.value = n.value.slice(0, s) + tok + n.value.slice(e2); n.focus(); n.setSelectionRange(s + tok.length, s + tok.length);
    n.dispatchEvent(new Event('input'));
  };
  return w;
}
function iconField(obj, key, label, allowNone, onPick){
  const w = el(`<div class="iconpick"><span class="sw">${iconChip(obj[key])}</span><button type="button" class="btn sm">Choose…</button>${allowNone ? '<button type="button" class="btn sm ghost">Remove</button>' : ''}</div>`);
  const [ch, rm] = w.querySelectorAll('button');
  ch.onclick = () => openPicker(ref => { obj[key] = ref; if (onPick) onPick(ref); changed({ insp:true }); });
  if (rm) rm.onclick = () => { obj[key] = null; changed({ insp:true }); };
  const f = field(label, w);
  if (obj[key] && obj[key].set === 'custom') f.appendChild(txt(obj[key], 'url', 'Public URL of this icon (needed for Gmail)', { ph:'https://…/icon.png' }));
  return f;
}
function grp(title, ...nodes){ const g = el(`<div class="grp"><p class="label">${esc(title)}</p></div>`); nodes.flat(9).filter(Boolean).forEach(n => g.appendChild(n)); return g; }
function row(...nodes){ const r = el('<div class="row2"></div>'); nodes.forEach(n => r.appendChild(n)); return r; }
function note(html){ return el(`<p class="note">${html}</p>`); }

function readImage(file, maxW, cb){
  const fr = new FileReader();
  fr.onload = () => {
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') return cb(fr.result);
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxW / img.width), c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      cb(file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', .88) : c.toDataURL('image/png'));
    };
    img.onerror = () => toast('That file could not be read as an image.');
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
const SHAPES = [['square','Square',0],['rounded','Rounded','6px'],['circle','Circle','50%'],['pill','Pill','12px']];
const SIZES = [['XS',40],['S',64],['M',88],['L',120],['XL',160]];
function imageEditor(b){
  const out = [];
  if (state.team.people.length || b.source === 'field'){
    out.push(segs(b, 'source', 'Image comes from', [['upload','One link for everyone'],['field','Each person\'s link']], { insp:true }));
  }
  if (b.source === 'field'){
    const imgFields = state.team.fields.filter(f => f.type === 'image');
    out.push(sel_(b, 'field', 'Person field', imgFields.map(f => [f.key, f.label])), note('Each person\'s photo link goes in the People step. The crop and shape below apply to everyone.'));
  } else {
    const u = txt(b, 'url', 'Image link', { ph:'https://yoursite.com/photo.jpg' });
    u.querySelector('input').addEventListener('change', () => renderInspector());
    out.push(u, chips(),
      note(b.url ? '<span class="badge ok">Linked</span> Works in every email app, as long as the link stays online.' : b.sample ? '<span class="badge">Sample picture</span> Paste a link to your own image. Email apps can\'t show the sample.' : 'Paste a link to an image that\'s online.'),
      note('To get a link: right-click an image on your website or LinkedIn and choose <b>Copy image address</b>. Images aren\'t uploaded or stored here.'));
  }
  return out;
}
function shapeEditor(b){
  const sh = el(`<div class="shapes" role="group" aria-label="Shape">${SHAPES.map(([v, l, r]) => `<button type="button" data-v="${v}" aria-pressed="${b.shape === v}"><i style="border-radius:${r};${v === 'pill' ? 'width:34px;height:20px' : ''}"></i>${l}</button>`).join('')}</div>`);
  sh.onclick = e => {
    const x = e.target.closest('[data-v]'); if (!x) return;
    b.shape = x.dataset.v;
    if (b.shape === 'circle' && b.crop.aspect !== '1:1') b.crop.aspect = '1:1';
    if (b.shape === 'pill' && (b.crop.aspect === '1:1' || b.crop.aspect === 'orig')) b.crop.aspect = '16:9';
    changed({ insp:true });
  };
  const sz = el(`<div class="seg" role="group" aria-label="Size presets">${SIZES.map(([l, v]) => `<button type="button" data-v="${v}" aria-pressed="${b.width === v}">${l} · ${v}</button>`).join('')}</div>`);
  sz.onclick = e => { const x = e.target.closest('[data-v]'); if (!x) return; b.width = +x.dataset.v; changed({ insp:true }); };
  return [field('Shape', sh), b.shape === 'rounded' ? num(b, 'radius', 'Corner radius', 1, 60) : null, field('Size', sz), num(b, 'width', 'Width (px)', 16, 600)];
}
function cropEditor(b){
  const c = b.crop;
  return [
    sel_(c, 'aspect', 'Crop to', ASPECTS, { insp:true }),
    c.aspect !== 'orig' ? note('Cropping a linked image uses images.weserv.nl, a free image service, so recipients load it from there.') : null,
    c.aspect !== 'orig' ? reframer(b) : null,
    b.shape === 'circle' && c.aspect !== '1:1' ? note('Circles look best with a 1:1 crop.') : null
  ];
}
// the picture this block shows right now (the current person's photo for a person field)
function framedSrc(b){
  const p = personFor(state), V = p ? p.values : {};
  if (b.source === 'field'){ const v = String(V[b.field] || '').trim(); return /^https?:\/\//i.test(v) ? v : ''; }
  const u = String(b.url || '').replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => V[k] || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  return b.sample ? sampleArt(b.sample) : '';
}
function reframer(b){
  const c = b.crop, src = framedSrc(b), ar = ratioOf(c.aspect);
  const w = el(`<div class="field"><span>Reframe</span><div class="reframe" tabindex="0" role="application" aria-label="Picture position. Drag, or use the arrow keys; plus and minus zoom."><div class="rf-img"></div></div></div>`);
  const box = w.querySelector('.reframe'), pic = box.querySelector('.rf-img');
  const BW = 220, BH = Math.round(BW / ar);
  box.style.cssText = `width:${BW}px;height:${BH}px;border-radius:${b.shape === 'circle' ? '50%' : b.shape === 'rounded' ? Math.min(b.radius, 30) + 'px' : '4px'}`;
  if (!src){ box.classList.add('empty'); pic.textContent = 'Add a picture link to reframe it here.'; }
  let nw = 0, nh = 0;
  // the picture covers the frame at zoom 1, the same math as the crop itself
  const paint = () => {
    if (!nw) return;
    const cover = Math.max(BW / nw, BH / nh) * (c.zoom || 1), iw = nw * cover, ih = nh * cover;
    pic.style.cssText = `width:${iw}px;height:${ih}px;left:${-(iw - BW) * c.x / 100}px;top:${-(ih - BH) * c.y / 100}px;background-image:url("${src.replace(/"/g, '%22')}")`;
    return [iw - BW, ih - BH];
  };
  if (src){
    const im = new Image(); im.referrerPolicy = 'no-referrer';
    im.onload = () => {
      nw = im.naturalWidth; nh = im.naturalHeight; paint();
      // remember the size of a linked picture so zoom works for it in email (see cropUrl)
      if (/^https?:/.test(src) && b.source !== 'field' && !(c.dim && c.dim.url === src && c.dim.w === nw)){ c.dim = { url:src, w:nw, h:nh }; changed(); }
    };
    im.src = src;
  }
  const move = (dx, dy) => { const [mx, my] = paint() || [0, 0]; if (mx > 0) c.x = Math.min(100, Math.max(0, c.x - dx / mx * 100)); if (my > 0) c.y = Math.min(100, Math.max(0, c.y - dy / my * 100)); paint(); changed(); };
  let drag = null;
  box.onpointerdown = e => { if (!nw) return; drag = [e.clientX, e.clientY]; box.setPointerCapture(e.pointerId); box.classList.add('drag'); };
  box.onpointermove = e => { if (!drag) return; move(e.clientX - drag[0], e.clientY - drag[1]); drag = [e.clientX, e.clientY]; };
  box.onpointerup = box.onpointercancel = () => { drag = null; box.classList.remove('drag'); };
  // zoom needs each picture's size, so it isn't offered for per-person photos
  const zoomTo = z => { if (b.source === 'field') return; c.zoom = Math.round(Math.min(4, Math.max(1, z)) * 100) / 100; zr.value = c.zoom; paint(); changed(); };
  box.onwheel = e => { if (!nw) return; e.preventDefault(); zoomTo((c.zoom || 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
  box.onkeydown = e => {
    const k = { ArrowLeft:[8, 0], ArrowRight:[-8, 0], ArrowUp:[0, 8], ArrowDown:[0, -8] }[e.key];
    if (k){ e.preventDefault(); move(...k); } else if (e.key === '+' || e.key === '='){ zoomTo((c.zoom || 1) + .1); } else if (e.key === '-'){ zoomTo((c.zoom || 1) - .1); }
  };
  const z = el(`<div class="rng"><input type="range" min="1" max="4" step="0.01" aria-label="Zoom"><button type="button" class="btn sm ghost">Reset</button></div>`);
  const zr = z.querySelector('input'); zr.value = c.zoom || 1;
  zr.oninput = () => zoomTo(Number(zr.value));
  z.querySelector('button').onclick = () => { c.x = 50; c.y = 50; zoomTo(1); };
  if (b.source !== 'field') w.append(field('Zoom', z));
  else w.append(note('Shows the person picked in the preview. The same position is used for everyone.'));
  return w;
}
function itemsEditor(b, kind){
  const box = el('<div class="items"></div>');
  b.items.forEach((it, i) => {
    const card = el(`<div class="item"><div class="bar"><b class="grow">${kind === 'contact' ? 'Line' : 'Icon'} ${i + 1}</b></div></div>`);
    const bar = card.querySelector('.bar');
    [['up','fas:arrow-up'],['down','fas:arrow-down'],['del','far:trash-can']].forEach(([k, g]) => {
      const [s, n] = g.split(':'); const what = kind === 'contact' ? 'line' : 'icon', lbl = { up:`Move ${what} ${i + 1} up`, down:`Move ${what} ${i + 1} down`, del:`Remove ${what} ${i + 1}` }[k];
      const btn = el(`<button type="button" class="iconbtn" aria-label="${lbl}" title="${lbl}">${G(s, n)}</button>`);
      btn.onclick = () => {
        if (k === 'del') b.items.splice(i, 1);
        else { const j = i + (k === 'up' ? -1 : 1); if (j < 0 || j >= b.items.length) return; [b.items[i], b.items[j]] = [b.items[j], b.items[i]]; }
        changed({ insp:true });
      };
      bar.appendChild(btn);
    });
    card.appendChild(iconField(it, 'icon', 'Icon', kind === 'contact', ref => prefillLink(it, ref)));
    card.appendChild(kind === 'contact' ? txt(it, 'text', 'Text') : txt(it, 'text', 'Title beside the icon (optional)', { ph:'e.g. LinkedIn' }));
    card.appendChild(txt(it, 'link', 'Link (URL, email or phone)', { ph:'https://… or name@site.com' }));
    box.appendChild(card);
  });
  const add = el(`<button type="button" class="btn sm">+ Add ${kind === 'contact' ? 'line' : 'icon'}</button>`);
  add.onclick = () => { b.items.push(kind === 'contact' ? { icon:I('fas','circle-info'), text:'New line', link:'' } : { icon:I('fab','facebook-f'), link:'' }); changed({ insp:true }); };
  box.appendChild(add);
  return box;
}

// picking a social icon fills in that site's profile URL, so only the username is left to type
const SOCIAL_URL = { 'linkedin-in':'https://linkedin.com/in/', linkedin:'https://linkedin.com/in/', instagram:'https://instagram.com/', 'x-twitter':'https://x.com/', twitter:'https://x.com/',
  'facebook-f':'https://facebook.com/', facebook:'https://facebook.com/', tiktok:'https://tiktok.com/@', youtube:'https://youtube.com/@', github:'https://github.com/', dribbble:'https://dribbble.com/',
  behance:'https://behance.net/', threads:'https://threads.net/@', pinterest:'https://pinterest.com/', 'pinterest-p':'https://pinterest.com/', spotify:'https://open.spotify.com/', whatsapp:'https://wa.me/',
  'vimeo-v':'https://vimeo.com/', medium:'https://medium.com/@', bluesky:'https://bsky.app/profile/', twitch:'https://twitch.tv/', reddit:'https://reddit.com/user/', snapchat:'https://snapchat.com/add/',
  discord:'https://discord.gg/', mastodon:'https://mastodon.social/@', etsy:'https://etsy.com/shop/', yelp:'https://yelp.com/biz/', 'google-scholar':'https://scholar.google.com/citations?user=' };
function prefillLink(it, ref){
  const u = ref.set === 'fab' && SOCIAL_URL[ref.name]; if (!u) return;
  const roots = Object.values(SOCIAL_URL);
  if (!it.link || roots.includes(it.link) || /^https:\/\/[\w.]+\/?$/.test(it.link)){ it.link = u; toast('Profile link started. Add your username to the end.'); }
}
const ALIGN = [['left','Left'],['center','Center'],['right','Right']];
const WEIGHTS = [[300,'Light'],[400,'Regular'],[600,'Semibold'],[700,'Bold'],[800,'Extra bold']];
const LSTYLES = [['solid','Solid'],['dashed','Dashed'],['dotted','Dotted'],['double','Double']];
function recolorMap(map, st = state){
  // swap brand colors everywhere they're used in the design, in one pass so swaps can't collide
  const m = {}; for (const k in map) m[k.toLowerCase()] = map[k];
  const walk = o => { for (const k in o){ if (k === 'palette' || k === 'team') continue; const v = o[k]; if (typeof v === 'string' && m[v.toLowerCase()]) o[k] = m[v.toLowerCase()]; else if (v && typeof v === 'object') walk(v); } };
  walk(st.rows); walk(st.style);
}
const recolor = (from, to) => recolorMap({ [from]:to });

/* colors from an image: bucket pixels, then build accent / ink / muted / soft / faint */
const hex = (r, g, b) => '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return hex(...x.map((v, i) => v + (y[i] - v) * t)); };
function hslOf(r, g, b){ r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; return { s:d ? d / (1 - Math.abs(2 * l - 1)) : 0, l }; }
const readable = src => /^https?:/i.test(src) ? 'https://images.weserv.nl/?url=' + encodeURIComponent(src) + '&w=160&output=png' : src;
function paletteFromImage(src, cb){
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const n = 72, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data, bins = {};
    for (let i = 0; i < d.length; i += 4){
      if (d[i + 3] < 140) continue;
      const k = (d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4), bn = bins[k] || (bins[k] = { n:0, r:0, g:0, b:0 });
      bn.n++; bn.r += d[i]; bn.g += d[i + 1]; bn.b += d[i + 2];
    }
    const cols = Object.values(bins).map(x => { const r = x.r / x.n, gg = x.g / x.n, b = x.b / x.n; return Object.assign({ n:x.n, h:hex(r, gg, b) }, hslOf(r, gg, b)); }).sort((a, b) => b.n - a.n);
    const accent = (cols.find(x => x.s > .35 && x.l > .18 && x.l < .68) || cols.find(x => x.l > .12 && x.l < .8) || { h:'#2453e6' }).h;
    const darkest = cols.filter(x => x.l < .22 && x.n > 3)[0];
    const ink = darkest ? darkest.h : mix(accent, '#0b0d10', .78);
    cb([accent, ink, mix(ink, '#ffffff', .42), mix(accent, '#ffffff', .86), mix(accent, '#ffffff', .95)]);
  };
  img.onerror = () => toast("That image couldn't be read for colors. Check the link.");
  img.src = readable(src);
}
function applyPaletteIn(st, next){
  const S = st.style, map = {};
  S.palette.forEach((p, i) => { if (next[i] && p.toLowerCase() !== next[i].toLowerCase()) map[p] = next[i]; });
  // text and link colors follow the brand too when they still use the defaults
  if (S.color === STYLE0.color) map[S.color] = map[S.color] || next[1];
  recolorMap(map, st); S.palette = next.slice(); if (S.link === STYLE0.link || S.link === next[0]) S.link = next[0];
}
function applyPalette(next){ applyPaletteIn(state, next); changed({ insp:true, list:true }); }
function paletteEditor(){
  const S = state.style;
  const w = el(`<div class="field"><span>Brand colors. Changing one updates it everywhere it's used.</span><div style="display:flex;gap:6px;flex-wrap:wrap"></div></div>`);
  S.palette.forEach((p, i) => {
    const c = el(`<input type="color" aria-label="Brand color ${i + 1}" style="width:40px;height:32px;padding:0;border:1px solid var(--line);border-radius:6px;background:none">`);
    c.value = p; let from = p;
    c.oninput = () => { recolor(from, c.value); from = c.value; S.palette[i] = c.value; changed(); };
    c.onchange = () => renderInspector();
    w.lastChild.appendChild(c);
  });
  // match colors to a logo or photo: one in the design, or a file on this computer (read here, never stored)
  // one button per picture (the same logo used twice is one button), with a thumbnail; repeated names get numbered
  const imgs = [], named = {};
  state.rows.flatMap(r => r.cols.flatMap(c => c.blocks)).forEach(b => {
    if (b.type !== 'image') return;
    const src = /^https?:/i.test(b.url || '') && !usesField(b.url) ? b.url : b.sample ? sampleArt(b.sample) : '';
    if (!src || imgs.some(x => x.src === src)) return;
    const base = b.label || 'image'; named[base] = (named[base] || 0) + 1;
    imgs.push({ src, label:named[base] > 1 ? base + ' ' + named[base] : base });
  });
  const m = el(`<div class="field"><span>Match colors to a logo or photo</span><div style="display:flex;gap:6px;flex-wrap:wrap">${imgs.map((x, i) => `<button type="button" class="btn sm" data-img="${i}"><img src="${esc(x.src)}" alt="" width="18" height="18" referrerpolicy="no-referrer" style="object-fit:contain;background:#fff;border-radius:3px;vertical-align:middle;margin-right:6px">From ${esc(x.label)}</button>`).join('')}<label class="btn sm">From a file<input type="file" accept="image/*" hidden></label></div><p class="note">A file is only read for its colors. It isn't uploaded or saved.</p></div>`);
  m.onclick = e => { const b = e.target.closest('[data-img]'); if (b) paletteFromImage(imgs[+b.dataset.img].src, p => { applyPalette(p); toast('Colors matched.', UNDO); }); };
  m.querySelector('input').onchange = e => { const f = e.target.files[0]; if (f) readImage(f, 300, d => paletteFromImage(d, p => { applyPalette(p); toast('Colors matched to your logo.', UNDO); })); };
  return [w, m];
}
// bold / italic / all caps as one row right under size, where people look for them
function styleToggles(b){
  const w = el('<div class="sides"></div>');
  const bold = el('<label class="chk"><input id="f-bold" type="checkbox"><b>Bold</b></label>');
  const c = bold.querySelector('input'); c.checked = b.weight >= 600;
  c.onchange = () => { b.weight = c.checked ? 700 : 400; changed({ insp:true }); };
  w.append(bold, chk(b, 'italic', 'Italic'), chk(b, 'upper', 'All caps'));
  return w;
}
function renderInspector(){
  const Pn = $('#insp'); Pn.innerHTML = ''; fid = 0; lastText = null;
  if (sel === 'style'){
    const S = state.style;
    Pn.append(el('<h3>Signature style</h3>'),
      note('Settings for the whole signature. Click any part of the preview to select it, or double-click text to edit it.'),
      grp('Brand', paletteEditor()),
      grp('Type', sel_(S, 'font', 'Font family', FONTS), row(num(S, 'size', 'Base size', 9, 24), color(S, 'color', 'Text color')), color(S, 'link', 'Link color'),
        note('Email apps only show fonts installed on the reader\'s device, so these are the email-safe ones.')),
      grp('Size', num(S, 'width', 'Fixed width (0 = fit content)', 0, 700, 10), num(S, 'pad', 'Inner padding', 0, 60)),
      grp('Background & border', chk(S, 'bgOn', 'Background fill', { insp:true }), S.bgOn ? color(S, 'bg', 'Background color') : null,
        row(num(S, 'bw', 'Border thickness', 0, 12), sel_(S, 'bs', 'Border style', LSTYLES)),
        color(S, 'bc', 'Border color'), num(S, 'br', 'Corner radius', 0, 40),
        (() => { const w = el('<div class="field"><span>Border sides</span><div class="sides"></div></div>'); [['t','Top'],['r','Right'],['b','Bottom'],['l','Left']].forEach(([k, l]) => w.lastChild.appendChild(chk(S.sides, k, l))); return w; })())
    );
    return;
  }
  const f = find(sel); if (!f){ sel = 'style'; return renderInspector(); }
  const head = (title, sub) => { const h = el(`<div style="display:flex;align-items:center;gap:8px"><h3 style="flex:1">${esc(title)}</h3><button type="button" class="btn sm ghost">Done</button></div>`); h.querySelector('button').onclick = () => select('style'); Pn.appendChild(h); if (sub) Pn.appendChild(note(esc(sub))); };
  if (f.kind === 'row'){
    const r = f.r, ri = state.rows.indexOf(r) + 1;
    head(rowName(r), 'A row holds side-by-side columns. Stack rows to build any layout.');
    Pn.appendChild(nameField(r, `Row ${ri}`));
    const cnt = colCount(r, 'Columns');
    [grp('Columns', cnt, r.cols.length > 1 ? [row(num(r, 'gap', 'Gap between', 0, 60), sel_(r, 'valign', 'Line up', [['top','Top'],['middle','Middle'],['bottom','Bottom']]))] : null,
        r.cols.map((c, i) => num(c, 'width', `Column ${i + 1} width (0 = auto)`, 0, 500, 2, { list:true })),
        chk(r, 'full', 'Stretch row to full signature width')),
      r.cols.length > 1 ? grp('Divider between columns', row(num(r, 'divW', 'Thickness (0 = none)', 0, 8), sel_(r, 'divS', 'Style', LSTYLES)), color(r, 'divC', 'Color')) : null,
      grp('Spacing', row(num(r, 'pt', 'Space above', 0, 60), num(r, 'pb', 'Space below', 0, 60)))].filter(Boolean).forEach(g => Pn.appendChild(g));
    return;
  }
  if (f.kind === 'col'){
    const c = f.c;
    head(colName(f.r, c), 'Select a block in this column to edit it, or add one from the left.');
    Pn.appendChild(nameField(c, `Column ${f.r.cols.indexOf(c) + 1}`));
    Pn.append(grp('Layout', colCount(f.r, 'Columns in this row'), num(c, 'width', 'Width (0 = auto)', 0, 500, 2, { list:true })),
      grp('Background', chk(c, 'bgOn', 'Fill this column', { insp:true }), c.bgOn ? [color(c, 'bg', 'Color'), row(num(c, 'pad', 'Padding', 0, 40), num(c, 'radius', 'Corner radius', 0, 30))] : num(c, 'pad', 'Padding', 0, 40)));
    return;
  }
  const b = f.b;
  head(DEF[b.type].label, b.type === 'text' ? 'Supports **bold**, *italic* and [link text](https://…).' : '');
  const place = [
    sel_({ to:f.c.id }, 'to', 'Position', allCols().map(x => [x.c.id, colName(x.r, x.c)])),
    segs(b, 'align', 'Alignment', ALIGN), row(num(b, 'pt', 'Space above', -20, 60), num(b, 'pb', 'Space below', -20, 60))
  ];
  place.push(colCount(f.r, 'Columns in this row'));
  if (f.i > 0 && f.r.cols.length < 4){
    const sp = el('<button type="button" class="btn sm">Move this and the blocks below into a new column</button>');
    sp.onclick = () => { const moved = f.c.blocks.splice(f.i); moved[0].inline = false; f.r.cols.splice(f.r.cols.indexOf(f.c) + 1, 0, mkCol(moved)); changed({ list:true, insp:true }); };
    place.push(sp);
  }
  // side by side: this block joins the one above it in a row
  const beside = f.i > 0;
  if (beside && b.type !== 'button') place.push(chk(b, 'inline', 'Sit beside the block above (side by side)', { insp:true, list:true }));
  if (b.inline){ if (b.gapL == null) b.gapL = 8; place.push(num(b, 'gapL', 'Space to the left', 0, 60)); }
  const nxt = f.c.blocks[f.i + 1];
  if (!b.inline && nxt && nxt.inline && !b.rowAlign) b.rowAlign = 'middle';
  if (!b.inline && nxt && nxt.inline) place.push(sel_(b, 'rowAlign', 'Line up side-by-side blocks', [['top','Top'],['middle','Middle'],['bottom','Bottom']]));
  place[0].querySelector('select').onchange = e => { const to = find(e.target.value); f.c.blocks.splice(f.i, 1); to.c.blocks.push(b); changed({ list:true, insp:true }); };
  switch (b.type){
    case 'text':
      Pn.append(grp('Content', txt(b, 'text', 'Text', { area:true, list:true }),
          row(txt(b, 'tag', 'Pronouns or credentials beside it', { ph:'she/her' }), segs(b, 'tagPos', 'Side', [['before','Left'],['after','Right']])),
          color(b, 'tagColor', 'Pronoun color', 'Default'),
          (() => { if (b.tagItalic === undefined) b.tagItalic = true; return chk(b, 'tagItalic', 'Italic pronouns'); })(),
          txt(b, 'link', 'Link the whole line (optional)', { ph:'https://… or name@site.com' }), chips()),
        grp('Style', row(num(b, 'size', 'Size', 6, 48), sel_(b, 'weight', 'Weight', WEIGHTS)), styleToggles(b), color(b, 'color', 'Color', 'Default'),
          sel_(b, 'font', 'Font', [['','Same as signature'], ...FONTS]),
          row(num(b, 'spacing', 'Letter spacing', 0, 10, .5), num(b, 'lh', 'Line height', .5, 2.4, .05))));
      break;
    case 'image':
      Pn.append(grp('Image', imageEditor(b)),
        grp('Shape & size', shapeEditor(b)),
        grp('Crop', cropEditor(b)),
        grp('Border & link', row(num(b, 'borderW', 'Border', 0, 10), color(b, 'borderColor', 'Border color')), txt(b, 'alt', 'Alt text'), txt(b, 'link', 'Link (optional)', { ph:'https://' })));
      break;
    case 'divider':
      Pn.append(grp('Line', row(num(b, 'thickness', 'Thickness', 1, 12), sel_(b, 'style', 'Style', LSTYLES)), color(b, 'color', 'Color'), num(b, 'width', 'Length (%)', 5, 100)));
      break;
    case 'spacer':
      Pn.append(grp('Space', num(b, 'height', 'Height', 2, 80)));
      break;
    case 'contact':
      Pn.append(grp('Lines', itemsEditor(b, 'contact'), chips()),
        grp('Style', segs(b, 'layout', 'Layout', [['stack','Stacked'],['inline','One line']], { insp:true }),
          b.layout === 'inline' ? txt(b, 'sep', 'Separator') : null,
          row(num(b, 'size', 'Text size', 8, 24), num(b, 'gap', 'Spacing', 0, 20)), color(b, 'color', 'Text color', 'Default'),
          row(num(b, 'iconSize', 'Icon size', 8, 32), color(b, 'iconColor', 'Icon color')),
          sel_(b, 'iconShape', 'Icon background', [['none','None'],['circle','Circle'],['rounded','Rounded square'],['square','Square']], { insp:true }),
          b.iconShape !== 'none' ? row(color(b, 'iconBg', 'Background'), num(b, 'iconPad', 'Padding', 0, 14)) : null));
      break;
    case 'social':
      if (b.tsize == null) b.tsize = 12;
      Pn.append(grp('Icons', itemsEditor(b, 'social'), chips()),
        grp('Style', row(num(b, 'size', 'Icon size', 8, 48), num(b, 'gap', 'Gap', 0, 30)), color(b, 'color', 'Icon color'),
          row(num(b, 'tsize', 'Title size', 8, 24), color(b, 'tcolor', 'Title color', 'Default')),
          sel_(b, 'shape', 'Background shape', [['none','None'],['circle','Circle'],['rounded','Rounded square'],['square','Square']], { insp:true }),
          b.shape !== 'none' ? row(color(b, 'bg', 'Background'), num(b, 'pad', 'Padding', 0, 20)) : null));
      break;
    case 'button':
      Pn.append(grp('Button', txt(b, 'text', 'Label', { list:true }), txt(b, 'link', 'Link', { ph:'https://… or name@site.com' }), chips(),
          chk(b, 'inline', 'Sit beside the previous button', { insp:true })),
        grp('Icon', iconField(b, 'icon', 'Icon', true), row(sel_(b, 'iconPos', 'Position', [['left','Before text'],['right','After text']]), num(b, 'iconSize', 'Icon size', 8, 32))),
        grp('Style', row(color(b, 'bg', 'Fill'), color(b, 'color', 'Text & icon')),
          row(num(b, 'size', 'Text size', 9, 24), sel_(b, 'weight', 'Weight', WEIGHTS)),
          row(num(b, 'padX', 'Padding sides', 0, 40), num(b, 'padY', 'Padding top/bottom', 0, 24)),
          num(b, 'radius', 'Corner radius', 0, 40), row(num(b, 'borderW', 'Border', 0, 8), color(b, 'borderColor', 'Border color'))));
      break;
    case 'html':
      Pn.append(grp('Custom HTML', txt(b, 'html', 'HTML (inline styles work best in email)', { area:true, code:true }), chips()));
      break;
  }
  Pn.append(grp('Placement', ...place, txt(b, 'label', 'Layer name (shown in the layers list)', { list:true })));
}

/* ---------- step 2: people (one design, a signature for everyone) ---------- */
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field';
function newPerson(values){ return { id:uid(), values:Object.assign({}, values || {}) }; }
function convertToTeam(){
  // turn literal details in the design into {{fields}} and keep them as person 1
  const v = {}; let n = 0;
  const take = (k, val) => { if (val && !v[k]) v[k] = val; n++; return `{{${k}}}`; };
  for (const r of state.rows) for (const c of r.cols) for (const b of c.blocks){
    if (b.type === 'text' && /^name$/i.test(b.label) && !usesField(b.text)) b.text = take('name', b.text);
    else if (b.type === 'text' && /^title$/i.test(b.label) && !usesField(b.text)) b.text = take('title', b.text);
    if (b.type === 'contact') b.items.forEach(it => {
      if (usesField(it.text)) return;
      if (/^mailto:/i.test(it.link) || /@/.test(it.text)){ it.text = take('email', it.text); it.link = '{{email}}'; }
      else if (/^tel:/i.test(it.link) || /^\+?[\d\s().-]{7,}$/.test(it.text)){ it.text = take('phone', it.text); it.link = '{{phone}}'; }
    });
    if (b.type === 'image' && /head|photo|portrait/i.test(b.label) && b.source !== 'field'){ v.photo = b.url || b.orig; b.source = 'field'; b.field = 'photo'; n++; }
  }
  const p = newPerson(v);
  state.team.people.push(p); state.team.active = p.id;
  return n;
}
function parseTable(text){
  const t = text.replace(/\r/g, '').trim(); if (!t) return [];
  const delim = t.split('\n')[0].includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++){
    const ch = t[i];
    if (q){ if (ch === '"' && t[i + 1] === '"'){ cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"' && !cell) q = true;
    else if (ch === delim){ row.push(cell); cell = ''; }
    else if (ch === '\n'){ row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows;
}
function importRows(text){
  const rows = parseTable(text); if (rows.length < 2) return 0;
  const tm = state.team;
  const keys = rows[0].map(h => {
    const s = slug(h), hl = h.trim().toLowerCase();
    const f = tm.fields.find(f => f.key === s || f.label.toLowerCase() === hl) || tm.fields.find(f => s.startsWith(f.key) || f.key.startsWith(s));
    if (f) return f.key;
    if (!s) return null;
    tm.fields.push(/photo|image|picture|headshot/.test(s) ? { key:s, label:h.trim(), type:'image' } : { key:s, label:h.trim() });
    return s;
  });
  let n = 0;
  rows.slice(1).forEach(r => {
    if (!r.some(c => c.trim())) return;
    const v = {}; keys.forEach((k, i) => { if (k) v[k] = (r[i] || '').trim(); });
    tm.people.push(newPerson(v)); n++;
  });
  if (n && !tm.active) tm.active = tm.people[0].id;
  return n;
}
let delPerson = null, importOpen = false;
function renderPeople(){
  if (!state || step !== 'people') return;
  const tm = state.team, cur = personFor(state), Pn = $('#people');
  const keep = document.activeElement && Pn.contains(document.activeElement) ? document.activeElement.id : null;
  const cols = tm.fields;
  const one = v => String(v || '').replace(/\s*\n\s*/g, ' ').trim();
  // text boxes take Enter for a new line (it shows as a line break in the signature)
  const box = (p, f, i) => f.type === 'image'
    ? `<input type="text" id="pf-${p.id}-${f.key}" data-pid="${p.id}" data-k="${f.key}" placeholder="https://…/photo.jpg" value="${esc(p.values[f.key] || '')}" aria-label="${esc(f.label)} link for ${esc(personLabel(p, i))}">`
    : `<textarea id="pf-${p.id}-${f.key}" data-pid="${p.id}" data-k="${f.key}" rows="${String(p.values[f.key] || '').split('\n').length}" aria-label="${esc(f.label)} for ${esc(personLabel(p, i))}">${esc(p.values[f.key] || '')}</textarea>`;
  const photoOf = p => { const f = cols.find(x => x.type === 'image'), v = f && p.values[f.key]; return /^https?:/i.test(v || '') ? `<img src="${esc(v)}" alt="" referrerpolicy="no-referrer">` : esc((one(p.values.name) || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()); };
  const rows = tm.people.map((p, i) => {
    const on = p === cur, sub = cols.filter(f => f.key !== 'name' && f.type !== 'image').map(f => one(p.values[f.key])).filter(Boolean)[0] || '';
    return `<div class="pcard${on ? ' on' : ''}" data-pid="${p.id}">
      <div class="phead"><button type="button" class="pick" data-a="pick" aria-expanded="${on}" aria-label="Edit and preview ${esc(personLabel(p, i))}"><span class="pav">${photoOf(p)}</span><span class="pnm"><b>${esc(one(personLabel(p, i)))}</b><span class="note">${esc(sub)}</span></span></button>
        <div class="acts2"><button type="button" class="btn sm" data-a="copy" title="Copy this person's signature for Gmail">Copy</button><button type="button" class="iconbtn" data-a="pdup" title="Duplicate" aria-label="Duplicate ${esc(personLabel(p, i))}">${G('far','copy')}</button><button type="button" class="${delPerson === p.id ? 'btn sm danger' : 'iconbtn'}" data-a="pdel" title="Remove" aria-label="Remove ${esc(personLabel(p, i))}">${delPerson === p.id ? 'Confirm' : G('far','trash-can')}</button></div></div>
      ${on ? `<div class="pform">${cols.map(f => `<label class="pf"><span>${esc(f.label)}</span>${box(p, f, i)}</label>`).join('')}</div><p class="note" style="margin:6px 0 0">Press Enter in a box to put the rest on a new line.</p>` : ''}
    </div>`;
  }).join('');
  Pn.innerHTML = `<div class="pwrap">
    <h2>People</h2>
    <p class="note">One design, a signature for everyone. Fields like <code>{{name}}</code> in the design fill in from each row. Blank fields are left out of that person's signature.</p>
    ${tm.people.length ? '' : `<div class="sharecard"><h3>${G('fas','users')}Make this a team signature</h3><p class="note">Convert turns the name, title, email, phone and photo in this design into fields and keeps the current details as the first person.</p><div class="row"><button class="btn primary sm" data-a="convert" type="button">Convert this design</button><button class="btn sm" data-a="add" type="button">Add a person</button><button class="btn sm" data-a="import" type="button">Paste from a spreadsheet</button></div></div>`}
    <div class="field"><span>Fields</span><div class="chips">${cols.map(f => `<span class="chip" style="display:inline-flex;gap:4px;align-items:center">{{${f.key}}}${f.type === 'image' ? ' (image)' : ''}<button type="button" class="iconbtn" data-rmf="${f.key}" aria-label="Remove field ${esc(f.label)}">${G('fas','xmark')}</button></span>`).join('')}</div>
      <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap"><input id="tnewf" type="text" placeholder="New field, e.g. Pronouns" aria-label="New field name" style="flex:1;min-width:140px;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel2)"><label class="chk" style="font-size:12px"><input id="tnewimg" type="checkbox">Image</label><button class="btn sm" data-a="addf" type="button">Add field</button></div></div>
    ${tm.people.length ? `<div class="plist">${rows}</div>` : ''}
    <div class="row" style="display:flex;gap:6px;flex-wrap:wrap">${tm.people.length ? '<button class="btn sm" data-a="add" type="button">+ Add person</button><button class="btn sm" data-a="import" type="button">Paste from a spreadsheet</button>' : ''}${tm.people.length && dlOK ? '<button class="btn sm" data-a="csv" type="button">Download CSV</button>' : ''}${tm.people.length ? `<button class="btn sm" type="button" data-a="toshare">Share with everyone →</button>` : ''}</div>
    <div class="sharecard" ${importOpen ? '' : 'hidden'}><h3>${G('fas','table')}Paste from a spreadsheet</h3><p class="note">Copy rows from Excel or Google Sheets, including a header row (Name, Job title, Email, Phone, Photo URL…). New column names become new fields.</p>
      <textarea id="timptext" class="code" style="min-height:110px" aria-label="Spreadsheet rows"></textarea>
      <div class="row"><button class="btn sm primary" data-a="doimport" type="button">Import rows</button><button class="btn sm" data-a="import" type="button">Cancel</button></div></div>
  </div>`;
  if (keep){ const k = document.getElementById(keep); if (k){ k.focus(); const v = k.value || ''; try { k.setSelectionRange(v.length, v.length); } catch {} } }
  const nf = $('#tnewf'); if (nf) nf.onkeydown = e => { if (e.key === 'Enter') Pn.querySelector('[data-a="addf"]').click(); };
  if (!permsOf(curSig()).edit_people){
    Pn.querySelectorAll('input, textarea, button').forEach(x => { if (!/^(copy|toshare)$/.test(x.dataset.a || '') && x.type !== 'radio') x.disabled = true; });
    Pn.querySelector('.pwrap h2').insertAdjacentHTML('afterend', '<p class="note"><b>View only.</b> You can preview and copy each person\'s signature, but not change the list.</p>');
  }
}
$('#people').addEventListener('input', e => {
  const t = e.target; if (!t.dataset.pid || !t.dataset.k) return;
  const p = state.team.people.find(x => x.id === t.dataset.pid); if (!p) return;
  p.values[t.dataset.k] = t.value;
  if (t.tagName === 'TEXTAREA') t.rows = t.value.split('\n').length;
  state.team.active = p.id;
  changed();
});
$('#people').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.pv){ state.team.active = t.dataset.pv; changed({ team:true }); return; }
});
$('#people').addEventListener('click', async e => {
  const a = e.target.closest('[data-a],[data-rmf]'); if (!a) return;
  const tm = state.team, tr = e.target.closest('.pcard[data-pid]'), p = tr && tm.people.find(x => x.id === tr.dataset.pid);
  if (a.dataset.rmf){ const k = a.dataset.rmf; tm.fields = tm.fields.filter(f => f.key !== k); toast(`Removed {{${k}}}. Values stay saved with each person.`, UNDO); changed({ team:true }); return; }
  const act = a.dataset.a;
  if (act !== 'pdel') delPerson = null;
  if (act === 'pick'){ tm.active = p.id; changed({ team:true }); const f = $(`#pf-${p.id}-${tm.fields[0] ? tm.fields[0].key : 'name'}`); if (f) f.focus(); return; }
  if (act === 'convert'){ const n = convertToTeam(); toast(n ? `Converted ${n} detail${n > 1 ? 's' : ''} to fields. Add more people below.` : 'Nothing to convert automatically. Use the field chips in the design inspector.'); changed({ team:true, list:true, insp:true }); }
  if (act === 'add'){ const np = newPerson({}); tm.people.push(np); tm.active = np.id; changed({ team:true }); const f = $(`#pf-${np.id}-${tm.fields[0] ? tm.fields[0].key : 'name'}`); if (f) f.focus(); }
  if (act === 'addf'){
    const lbl = $('#tnewf').value.trim(); if (!lbl) return;
    let k = slug(lbl); while (tm.fields.some(f => f.key === k)) k += '_2';
    tm.fields.push(Object.assign({ key:k, label:lbl }, $('#tnewimg').checked ? { type:'image' } : {}));
    toast(`Added {{${k}}}. Insert it from any text field in the design.`); changed({ team:true, insp:true });
  }
  if (act === 'copy'){ const r = render(state, 'gmail', p.id); const ok = await copyRich(r.html, plainText(state, p.id)); toast(ok ? `Copied ${personLabel(p, tm.people.indexOf(p))}'s signature. Paste it in their Gmail settings.` : 'Copy was blocked. Use the Share step instead.'); }
  if (act === 'pdup'){ const np = newPerson(clone(p.values)); np.values.name = (np.values.name || '') + ' (copy)'; tm.people.splice(tm.people.indexOf(p) + 1, 0, np); tm.active = np.id; changed({ team:true }); }
  if (act === 'pdel'){
    if (delPerson !== p.id){ delPerson = p.id; renderPeople(); return; }
    delPerson = null; tm.people.splice(tm.people.indexOf(p), 1); if (tm.active === p.id) tm.active = tm.people[0] ? tm.people[0].id : null;
    toast(`Removed ${personLabel(p, 0)}.`, UNDO); changed({ team:true });
  }
  if (act === 'import'){ importOpen = !importOpen; renderPeople(); if (importOpen) $('#timptext').focus(); }
  if (act === 'doimport'){
    const n = importRows($('#timptext').value);
    toast(n ? `Imported ${n} ${n > 1 ? 'people' : 'person'}.` : 'No rows found. Include a header row, then one row per person.');
    if (n){ importOpen = false; changed({ team:true }); }
  }
  if (act === 'csv') downloadCsv();
  if (act === 'toshare') setStep('share');
});
function saveFile(filename, data){
  const type = /\.json$/.test(filename) ? 'application/json' : /\.csv$/.test(filename) ? 'text/csv' : 'text/html';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type:type + ';charset=utf-8' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function downloadTeam(){
  const tm = state.team, parts = tm.people.map((p, i) => `<section style="margin:0 0 40px"><h2 style="font:600 14px Arial;color:#667085;margin:0 0 12px">${esc(personLabel(p, i))}</h2>${render(state, 'gmail', p.id).html}</section>`);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(state.name)}: team signatures</title></head><body style="margin:40px;background:#fff">${parts.join('<hr style="border:0;border-top:1px solid #e4e7ec;margin:0 0 40px">')}</body></html>`;
  saveFile(slug(state.name || 'team') + '-signatures.html', doc);
}
function downloadCsv(){
  const tm = state.team, q = s => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [tm.fields.map(f => q(f.label)).join(',')].concat(tm.people.map(p => tm.fields.map(f => q(f.type === 'image' && /^data:/.test(p.values[f.key] || '') ? '' : (p.values[f.key] || ''))).join(',')));
  saveFile(slug(state.name || 'team') + '-people.csv', lines.join('\n'));
}


/* ---------- icon picker ---------- */
let pickCb = null, pickSet = 'all', myIcons = store.get('sigstudio.icons') || [], allIcons = null;
function iconIndex(){
  if (allIcons && allIcons.length) return allIcons;
  allIcons = [];
  const st = FA();
  for (const s of ['fab','fas','far']) for (const n of Object.keys(st[s] || {})) allIcons.push({ set:s, name:n, terms:n + ' ' + (st[s][n][2] || []).filter(x => typeof x === 'string').join(' ') });
  return allIcons;
}
function openPicker(cb){ pickCb = cb; $('#isearch').value = ''; drawIcons(); $('#dlg-icons').showModal(); $('#isearch').focus(); }
function drawIcons(){
  const q = $('#isearch').value.trim().toLowerCase(), Gd = $('#igrid');
  if (pickSet === 'custom'){
    Gd.innerHTML = myIcons.map((m, i) => `<button data-my="${i}" title="${esc(m.name)}"><img src="${esc(m.data)}" alt=""><span>${esc(m.name)}</span></button>`).join('');
    $('#inote').textContent = myIcons.length ? 'Icon links you added are remembered in this browser.' : 'No icons of your own yet. Paste an icon link above.';
    return;
  }
  if (!iconIndex().length){ Gd.innerHTML = ''; $('#inote').textContent = 'The icon library did not load. Reload the page, or add your own icon by link.'; return; }
  const list = iconIndex().filter(x => (pickSet === 'all' || x.set === pickSet) && (!q || x.terms.includes(q)));
  const shown = list.slice(0, 300);
  Gd.innerHTML = shown.map((x, i) => `<button data-i="${i}" title="${x.name}">${iconSvg(x)}<span>${x.name}</span></button>`).join('');
  Gd._list = shown;
  $('#inote').textContent = list.length > 300 ? `Showing 300 of ${list.length}. Type to narrow it down.` : list.length ? '' : 'No icons match. Try a simpler word, or add your own by link.';
}
$('#isearch').oninput = drawIcons;
$('#isets').onclick = e => { const b = e.target.closest('[data-set]'); if (!b) return; pickSet = b.dataset.set; $('#isets').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); drawIcons(); };
$('#igrid').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  let ref;
  if (b.dataset.my != null){ const m = myIcons[+b.dataset.my]; ref = { set:'custom', name:m.name, data:m.data, url:m.url || '' }; }
  else { const x = $('#igrid')._list[+b.dataset.i]; ref = { set:x.set, name:x.name }; }
  $('#dlg-icons').close(); pickCb && pickCb(ref);
};
$('#iclose').onclick = () => $('#dlg-icons').close();
$('#iaddform').onsubmit = e => {
  e.preventDefault();
  const u = $('#iaddurl').value.trim();
  if (!/^https:\/\//i.test(u)){ toast('Paste a link that starts with https://'); return; }
  const name = decodeURIComponent(u.split(/[?#]/)[0].split('/').pop() || 'icon').replace(/\.[^.]+$/, '').slice(0, 30) || 'icon';
  myIcons.unshift({ name, data:u, url:u });
  store.set('sigstudio.icons', myIcons);
  $('#iaddurl').value = '';
  pickSet = 'custom'; $('#isets').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.set === 'custom'));
  drawIcons(); toast('Icon added to My icons.');
};

/* ---------- copy / export ---------- */
async function copyRich(html, text){
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html':new Blob([html], { type:'text/html' }), 'text/plain':new Blob([text], { type:'text/plain' }) })]);
    return true;
  } catch {
    const d = document.createElement('div');
    d.contentEditable = 'true'; d.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff';
    d.innerHTML = html; document.body.appendChild(d);
    const r = document.createRange(); r.selectNodeContents(d);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    s.removeAllRanges(); d.remove(); return ok;
  }
}
async function copyText(t, ta){
  try { await navigator.clipboard.writeText(t); return true; }
  catch { if (ta){ ta.focus(); ta.select(); try { return document.execCommand('copy'); } catch {} } return false; }
}
/* ---------- step 3: share (every way out, in one place) ---------- */
const dlOK = true;
let sharePid = null, showCode = false;
// private per-person links: only for my own saved signatures while signed in
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const linksOK = () => !!(user && sb && sigId && !(curSig() || {}).sh);
async function personLinks(ps){
  await saveNow();
  const { data, error } = await sb.from('person_links')
    .upsert(ps.map(p => ({ owner:user.id, sig_id:sigId, person_id:p.id, can_edit:!!state.team.selfEdit })), { onConflict:'owner,sig_id,person_id' })
    .select('person_id,token');
  if (error) throw cloudErr(error);
  return ps.map(p => toolUrl() + '?p=' + (data.find(d => d.person_id === p.id) || {}).token);
}
function mailtoFor(p, url){
  const first = (p.values.name || '').trim().split(/\s+/)[0] || 'there';
  const body = `Hi ${first},\n\nHere's your email signature: ${url}\n\nOpen the link, click "Copy for Gmail" (or Outlook), then paste it into your email signature settings. The page has step-by-step instructions.${state.team.selfEdit ? ' You can also update your own details there.' : ''}\n`;
  return `mailto:${encodeURIComponent(p.values.email.trim())}?subject=${encodeURIComponent('Your email signature')}&body=${encodeURIComponent(body)}`;
}
const STEPS = {
  gmail:['Click <b>Copy for Gmail</b>.','In Gmail open <b>Settings → See all settings → General</b>.','Under <b>Signature</b> click <b>Create new</b>, name it, click in the box and paste (Ctrl+V or ⌘V).','Pick it under <b>Signature defaults</b>, then click <b>Save Changes</b> at the bottom.'],
  outlook:['Click <b>Copy for Outlook / Apple Mail</b>.','<b>Outlook:</b> Settings → Mail → Compose and reply (desktop: File → Options → Mail → Signatures), add a signature and paste.','<b>Apple Mail:</b> Settings → Signatures, add one, paste, and untick "Always match my default message font".']
};
function renderShare(){
  if (!state || step !== 'share') return;
  const ps = state.team.people;
  if (sharePid && !ps.some(p => p.id === sharePid)) sharePid = null;
  const pid = sharePid || undefined, person = personFor(state, pid);
  const g = render(state, 'gmail', pid), gw = checks(state, pid).out.filter(c => c[0] === 'warn');
  const n = gmailLen(g.html);
  $('#share').innerHTML = `<div class="pwrap">
    <h2>Share</h2>
    ${ps.length ? `<div class="field"><span>Signature for</span><select id="sharep" style="max-width:320px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel2)">${ps.map((p, i) => `<option value="${p.id}"${p === person ? ' selected' : ''}>${esc(personLabel(p, i))}</option>`).join('')}</select></div>` : ''}
    <div class="sharecard"><h3>${G('fab','google')}Gmail</h3>
      <ol class="steps note">${STEPS.gmail.map(s => `<li>${s}</li>`).join('')}</ol>
      ${gw.length ? chkHtml(gw) : chkHtml([['ok', `Ready for Gmail. ${n.toLocaleString()} of 10,000 characters.`]])}
      <div class="row"><button class="btn primary" data-a="copy-gmail" type="button">Copy for Gmail</button></div></div>
    <div class="sharecard"><h3>${G('fas','envelope-open-text')}Outlook and Apple Mail</h3>
      <ol class="steps note">${STEPS.outlook.map(s => `<li>${s}</li>`).join('')}</ol>
      <p class="note">Icons are packed into the signature itself. Images come from their links, same as Gmail.</p>
      <div class="row"><button class="btn" data-a="copy-embed" type="button">Copy for Outlook / Apple Mail</button>${dlOK ? '<button class="btn" data-a="dl" type="button">Download .html</button>' : ''}</div></div>
    ${ps.length ? `<div class="sharecard"><h3>${G('fas','users')}Everyone at once</h3>
      ${linksOK() ? `<p class="note">Give each person their own private link. It shows only their signature, with a Copy button and setup steps, and needs no account.</p>
      <label class="chk"><input type="checkbox" id="selfedit"${state.team.selfEdit ? ' checked' : ''}>Let people update their own details (title, phone, photo link…) from their link</label>` : `<p class="note">Sign in to give each person a private link to their own signature.</p>`}
      <div class="teamlist">${ps.map((p, i) => `<div><span class="grow">${esc(personLabel(p, i))}${p.values.email ? ` <span class="note">${esc(p.values.email)}</span>` : ''}</span>${linksOK() ? `<button class="btn sm" data-a="plink" data-pid="${p.id}" type="button">Copy their link</button>${validEmail(p.values.email) ? `<button class="btn sm ghost" data-a="pmail" data-pid="${p.id}" type="button">Email it</button>` : ''}` : ''}<button class="btn sm" data-a="copy-p" data-pid="${p.id}" type="button">Copy signature</button></div>`).join('')}</div>
      ${linksOK() ? '<div class="row"><button class="btn sm" data-a="plink-all" type="button">Copy everyone\'s links</button></div>' : ''}
      <div class="row">${dlOK ? '<button class="btn sm" data-a="dlteam" type="button">Download all signatures</button><button class="btn sm" data-a="csv" type="button">Download CSV</button>' : ''}</div></div>` : ''}
    <div class="sharecard"><h3>${G('fas','code')}HTML and plain text</h3>
      <div class="row"><button class="btn sm" data-a="copy-html" type="button">Copy HTML code</button><button class="btn sm" data-a="copy-text" type="button">Copy plain text</button><button class="btn sm ghost" data-a="code" type="button">${showCode ? 'Hide code' : 'Show code'}</button></div>
      ${showCode ? `<textarea class="code" id="xcode" readonly aria-label="Signature HTML">${esc(g.html)}</textarea>` : ''}</div>
  </div>`;
}
$('#share').addEventListener('change', async e => {
  if (e.target.id === 'sharep'){ sharePid = e.target.value; state.team.active = sharePid; changed(); }
  if (e.target.id === 'selfedit'){
    state.team.selfEdit = e.target.checked; changed();
    const { error } = await sb.from('person_links').update({ can_edit:state.team.selfEdit }).eq('sig_id', sigId);
    toast(error ? 'Could not update existing links: ' + error.message : state.team.selfEdit ? 'People can now update their own details from their link.' : 'Links are now view only.');
  }
});
$('#share').addEventListener('click', async e => {
  const a = e.target.closest('[data-a]'); if (!a) return;
  const act = a.dataset.a, pid = sharePid || undefined;
  const copied = (ok, who) => toast(ok ? `Copied${who ? ' for ' + who : ''}. Paste it into your email settings.` : 'Copy was blocked. Use Copy HTML code instead.');
  const nm = p => p ? personLabel(p, state.team.people.indexOf(p)) : '';
  if (act === 'copy-gmail'){ const r = render(state, 'gmail', pid); copied(await copyRich(r.html, plainText(state, pid)), nm(r.person)); }
  if (act === 'copy-embed'){ render(state, 'preview'); const r = render(state, 'embed', pid); copied(await copyRich(r.html, plainText(state, pid)), nm(r.person)); }
  if (act === 'copy-p'){ const p = state.team.people.find(x => x.id === a.dataset.pid); const r = render(state, 'gmail', p.id); copied(await copyRich(r.html, plainText(state, p.id)), nm(p)); }
  if (act === 'copy-html'){ const ok = await copyText(render(state, 'gmail', pid).html); toast(ok ? 'HTML copied.' : 'Copy was blocked. Click Show code and copy it from the box.'); }
  if (act === 'copy-text'){ const ok = await copyText(plainText(state, pid)); toast(ok ? 'Plain-text version copied.' : 'Copy was blocked.'); }
  if (act === 'code'){ showCode = !showCode; renderShare(); }
  if (act === 'dl'){ const p = personFor(state, pid); render(state, 'preview'); saveFile(slug((p && p.values.name) || state.name || 'signature') + '-signature.html', `<!doctype html><html><head><meta charset="utf-8"><title>${esc(state.name)}</title></head><body>${render(state, 'embed', pid).html}</body></html>`); }
  if (act === 'dlteam') downloadTeam();
  if (act === 'csv') downloadCsv();
  if (act === 'plink' || act === 'pmail'){
    const p = state.team.people.find(x => x.id === a.dataset.pid);
    try {
      const [u] = await personLinks([p]);
      if (act === 'pmail'){ location.href = mailtoFor(p, u); return; }
      const ok = await copyText(u); toast(ok ? `Copied ${personLabel(p, 0)}'s private link.` : u);
    } catch (er){ toast('Could not make the link: ' + er.message); }
  }
  if (act === 'plink-all'){
    try {
      const ps = state.team.people, urls = await personLinks(ps);
      const text = ps.map((p, i) => `${personLabel(p, i)}${p.values.email ? ' <' + p.values.email + '>' : ''}: ${urls[i]}`).join('\n');
      const ok = await copyText(text); toast(ok ? `Copied ${ps.length} links, one per line.` : 'Copy was blocked.');
    } catch (er){ toast('Could not make the links: ' + er.message); }
  }
});
$('#copygmail').onclick = async () => {
  const r = render(state, 'gmail');
  const ok = await copyRich(r.html, plainText(state));
  if (!ok){ setStep('share'); toast('Copy was blocked here. Use Copy HTML code on this page instead.'); return; }
  const who = r.person ? ` for ${r.person.values.name || 'this person'}` : '';
  toast(r.embedded.length ? `Copied${who}. Gmail can't show the sample pictures; see the checks below the preview.` : `Copied${who}. In Gmail: Settings → Signature → paste.`);
};

/* ---------- library: in this browser (localStorage) for guests, in the account (Supabase) once signed in ---------- */
let templates = [], companies = [], libReady = false, storageOK = true;
let libCo = 'all', libQ = '', coForm = false, coDelArm = null, delArm = null, brandOpen = false;
const LIBKEY = 'sigstudio.templates', COKEY = 'sigstudio.companies';
const coById = id => companies.find(c => c.id === id);
// companies and signatures someone shared with me carry .sh = { owner, ownerEmail, rid (their real id), perms }
const FULL = { view_people:true, edit_people:true, edit_design:true, edit_brand:true };
const shId = (owner, id) => 'sh~' + owner + '~' + id;
const ownCos = () => companies.filter(c => !c.sh), sharedCos = () => companies.filter(c => c.sh);
const permsOf = x => (x && x.sh ? x.sh.perms : FULL);
const curSig = () => templates.find(t => t.id === sigId);
function permWords(p){
  if (p.edit_design && p.edit_people && p.edit_brand) return 'Can edit everything';
  const can = [p.edit_design && 'design', p.edit_people && 'employees', p.edit_brand && 'brand kit'].filter(Boolean);
  return can.length ? 'Can edit ' + can.join(', ') : p.view_people ? 'View only' : 'View design only';
}
// the public project URL and publishable key are meant to be in the page; row-level security keeps each account's rows private
const SUPABASE_URL = 'https://rizgpvzmazuvidvbpkoa.supabase.co', SUPABASE_KEY = 'sb_publishable_gi6G-cLhq6wYpiB3G7kEsg_G_aI0QKk';
let sb = null, user = null;
const cloudErr = e => new Error(/fetch|network/i.test(String(e && e.message)) ? 'you seem to be offline. Your changes will save when you reconnect and retry' : 'the account server said: ' + ((e && e.message) || 'unknown error'));
async function libSave(id, name, st){
  const shT = templates.find(t => t.id === id && t.sh);
  if (shT) return saveShared(shT, name, st);
  const doc = { name, state:st, companyId:st.companyId || '', updatedAt:Date.now() };
  const size = JSON.stringify(doc).length;
  if (size > 400000) throw new Error(`this signature is ${Math.round(size / 1024)} KB, which is more than one signature should need`);
  const next = [Object.assign({ id }, doc)].concat(templates.filter(t => t.id !== id));
  if (user){
    const { error } = await sb.from('signatures').upsert({ user_id:user.id, id, name, company_id:doc.companyId, state:st, updated_at:doc.updatedAt });
    if (error) throw cloudErr(error);
  } else persist(LIBKEY, next);
  templates = next;
  if (view === 'home') renderHome();
}
// a signature someone shared with me: the server checks the permission again and keeps what I may not change
async function saveShared(t, name, st){
  const p = t.sh.perms, args = { p_owner:t.sh.owner, p_id:t.sh.rid };
  let res;
  if (p.edit_design) res = await sb.rpc('save_shared_signature', Object.assign(args, { p_name:name, p_state:st }));
  else if (p.edit_people) res = await sb.rpc('save_shared_team', Object.assign(args, { p_team:st.team }));
  else throw new Error('this signature is view only');
  if (res.error) throw cloudErr(res.error);
  Object.assign(t, { name:p.edit_design ? name : t.name, state:st, updatedAt:Number(res.data) || Date.now() });
  if (view === 'home') renderHome();
}
async function libDelete(id){
  if (user){ const { error } = await sb.from('signatures').delete().eq('id', id); if (error) throw cloudErr(error); }
  templates = templates.filter(t => t.id !== id);
  if (!user) persist(LIBKEY, templates);
  if (view === 'home') renderHome();
}
async function coSave(co){
  if (co.sh){
    if (!co.sh.perms.edit_brand) throw new Error('you can view this company but not change its brand kit');
    const { id, sh, updatedAt, ...data } = co;
    const { error } = await sb.rpc('save_shared_company', { p_owner:sh.owner, p_id:sh.rid, p_data:data });
    if (error) throw cloudErr(error);
    if (view === 'home') renderHome();
    return;
  }
  const { id, ...doc } = co; doc.updatedAt = Date.now();
  const next = companies.filter(c => c.id !== id).concat(Object.assign({ id }, doc)).sort((a, b) => a.name.localeCompare(b.name));
  if (user){ const { error } = await sb.from('companies').upsert({ user_id:user.id, id, data:doc, updated_at:doc.updatedAt }); if (error) throw cloudErr(error); }
  else persist(COKEY, next);
  companies = next;
  if (view === 'home') renderHome();
  renderCompanySelect();
}
async function coDelete(id){
  if (user){ const { error } = await sb.from('companies').delete().eq('id', id); if (error) throw cloudErr(error); }
  companies = companies.filter(c => c.id !== id);
  if (!user) persist(COKEY, companies);
  renderHome(); renderCompanySelect();
}
// many rows at once (import, moving a browser library into an account)
async function saveMany(sigs, cos){
  if (user){
    if (sigs.length){ const { error } = await sb.from('signatures').upsert(sigs.map(t => ({ user_id:user.id, id:t.id, name:t.name || '', company_id:t.companyId || '', state:t.state, updated_at:t.updatedAt || Date.now() }))); if (error) throw cloudErr(error); }
    if (cos.length){ const { error } = await sb.from('companies').upsert(cos.map(c => { const { id, ...d } = c; return { user_id:user.id, id, data:d, updated_at:d.updatedAt || Date.now() }; })); if (error) throw cloudErr(error); }
  }
  const t2 = sigs.concat(templates.filter(t => !sigs.some(x => x.id === t.id))).sort((a, b) => b.updatedAt - a.updatedAt);
  const c2 = cos.concat(companies.filter(c => !cos.some(x => x.id === c.id))).sort((a, b) => a.name.localeCompare(b.name));
  if (!user){ persist(LIBKEY, t2); persist(COKEY, c2); }
  templates = t2; companies = c2;
}
async function loadCloud(){
  const [s1, s2, s3, s4] = await Promise.all([
    sb.from('signatures').select('id,name,company_id,state,updated_at').order('updated_at', { ascending:false }),
    sb.from('companies').select('id,data,updated_at'),
    sb.rpc('shared_companies'),
    sb.rpc('shared_signatures')
  ]);
  for (const r of [s1, s2, s3, s4]) if (r.error) throw cloudErr(r.error);
  const own = s1.data.map(r => ({ id:r.id, name:r.name, state:r.state, companyId:r.company_id, updatedAt:Number(r.updated_at) }));
  const ownC = s2.data.map(r => Object.assign({}, r.data, { id:r.id, updatedAt:Number(r.updated_at) }));
  const shC = s3.data.map(r => Object.assign({}, r.data, { id:shId(r.owner, r.id), updatedAt:Number(r.updated_at), sh:{ owner:r.owner, ownerEmail:r.owner_email, rid:r.id,
    perms:{ view_people:r.can_view_people, edit_people:r.can_edit_people, edit_design:r.can_edit_design, edit_brand:r.can_edit_brand } } }));
  const shS = s4.data.map(r => {
    const c = shC.find(x => x.sh.owner === r.owner && x.sh.rid === r.company_id);
    const st = Object.assign({}, r.state, { companyId:shId(r.owner, r.company_id) });
    return { id:shId(r.owner, r.id), name:r.name, state:st, companyId:st.companyId, updatedAt:Number(r.updated_at), sh:Object.assign({}, c.sh, { rid:r.id }) };
  });
  templates = own.concat(shS).sort((a, b) => b.updatedAt - a.updatedAt);
  companies = ownC.sort((a, b) => (a.name || '').localeCompare(b.name || '')).concat(shC.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
}

// write one list to this browser's storage; a failure is reported, never swallowed
function persist(key, list){
  try { localStorage.setItem(key, JSON.stringify(list)); }
  catch (e){ throw new Error(storageOK ? 'this browser\'s storage is full. Export a backup, then delete signatures you no longer need' : 'this browser isn\'t letting the page save (private browsing?). Export a backup before you close the tab'); }
}
function loadList(key){ try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; } catch { storageOK = false; return []; } }

/* backup: one JSON file with every signature and company */
function exportLibrary(){
  const data = { app:'signature-studio', format:1, exportedAt:new Date().toISOString(), signatures:templates.filter(t => !t.sh), companies:ownCos() };
  saveFile('signature-studio-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 2));
  toast(`Exported ${templates.length} signature${templates.length === 1 ? '' : 's'} and ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}.`);
}
function importLibrary(file){
  const fr = new FileReader();
  fr.onload = async () => {
    let d; try { d = JSON.parse(fr.result); } catch { toast("That file isn't a Signature Studio backup."); return; }
    const sigs = Array.isArray(d && d.signatures) ? d.signatures : [], cos = Array.isArray(d && d.companies) ? d.companies : [];
    if (!sigs.length && !cos.length){ toast("That file isn't a Signature Studio backup."); return; }
    try {
      // same ids are replaced by the backup's copy, everything else is added
      await saveMany(sigs.filter(t => t && t.id && t.state), cos.filter(c => c && c.id && c.name));
      renderHome(); toast(`Imported ${sigs.length} signature${sigs.length === 1 ? '' : 's'} and ${cos.length} compan${cos.length === 1 ? 'y' : 'ies'}${user ? ' into your account' : ''}.`);
    } catch (e){ toast('Import failed: ' + e.message + '.'); }
  };
  fr.readAsText(file);
}

/* brand kits: a company's logo, colors and font */
function brandFromDesign(co, st){
  const logoB = st.rows.flatMap(r => r.cols.flatMap(c => c.blocks)).find(b => b.type === 'image' && /logo/i.test(b.label) && /^https?:/i.test(b.url || ''));
  return Object.assign(co, { palette:st.style.palette.slice(), font:st.style.font }, logoB ? { logoUrl:logoB.url } : {});
}
function applyBrandIn(st, co){
  if (co.font) st.style.font = co.font;
  st.rows.forEach(r => r.cols.forEach(c => c.blocks.forEach(b => {
    if (b.type === 'image' && /logo/i.test(b.label) && co.logoUrl){ b.url = co.logoUrl; b.sample = ''; b.orig = ''; b.crop = { aspect:'orig', zoom:1, x:50, y:50 }; b.alt = co.name + ' logo'; }
    if (b.type === 'text' && /^company$/i.test(b.label)) b.text = co.name;
  })));
  st.companyId = co.id;
  if (co.palette && co.palette.length === 5) applyPaletteIn(st, co.palette);
  return st;
}

/* header: which company the open signature belongs to */
function renderCompanySelect(){
  const s = $('#tcompany'); if (!s || !state) return;
  const t = curSig();
  if (t && t.sh){ const c = coById(t.companyId); s.innerHTML = `<option>${esc(c ? c.name : 'Shared')}</option>`; s.disabled = true; return; }
  s.disabled = false;
  s.innerHTML = `<option value="">No company</option>` + ownCos().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  s.value = coById(state.companyId) ? state.companyId : '';
}
$('#tcompany').onchange = e => {
  state.companyId = e.target.value; queueSave();
  const co = coById(state.companyId);
  if (co) toast(`Filed under ${co.name}.`, { label:'Apply its brand', fn:() => { applyBrandIn(state, co); changed({ insp:true, list:true }); toast(`Applied ${co.name}'s brand.`, UNDO); } });
  else toast('Not filed under a company.');
};

/* home screen */
const thumbCache = {};
function thumbOf(t){
  const k = t.id + ':' + t.updatedAt;
  if (!thumbCache[k]){ try { thumbCache[k] = render(migrate(t.state), 'preview').html.replace(/ data-(bid|cid|rid)="[^"]*"/g, ''); } catch { thumbCache[k] = ''; } }
  return thumbCache[k];
}
const swatches = p => (p || []).map(c => `<span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${esc(c)};border:1px solid var(--line)"></span>`).join('');
function renderHome(){
  if (view !== 'home') return;
  const count = id => templates.filter(t => (t.companyId || '') === id).length;
  if (libCo !== 'all' && !coById(libCo)) libCo = 'all';
  const co = coById(libCo), q = libQ.trim().toLowerCase();
  const row = (id, label, n, sw) => `<button type="button" class="bitem${libCo === id ? ' sel' : ''}" data-co="${id}">${sw || ''}<span class="nm">${label}</span><span class="note">${n}</span></button>`;
  $('#cos').innerHTML = `<p class="label" style="margin:0 6px 6px">Library</p>
    ${row('all', 'All signatures', templates.length, `<span class="ic">${G('fas','layer-group')}</span>`)}
    <p class="label" style="margin:14px 6px 6px;display:flex;align-items:center">Companies<span class="spacer"></span><button class="btn sm ghost" data-a="co-form" type="button">+ New</button></p>
    ${coForm ? `<div class="card cur" style="margin:0 2px 6px"><input id="co-new" type="text" placeholder="Company name" aria-label="Company name"><div class="row"><button class="btn sm primary" data-a="co-create" type="button">Create</button><button class="btn sm" data-a="co-cancel" type="button">Cancel</button></div></div>` : ''}
    ${ownCos().map(c => row(c.id, esc(c.name), count(c.id), `<span class="sw" style="background:${esc((c.palette || ['#c4cad4'])[0])}"></span>`)).join('')}
    ${ownCos().length ? '' : `<p class="note" style="margin:0 6px">Add a company to keep its signatures and brand together.</p>`}
    ${sharedCos().length ? `<p class="label" style="margin:14px 6px 6px">Shared with me</p>` + sharedCos().map(c => row(c.id, esc(c.name), count(c.id), `<span class="sw" style="background:${esc((c.palette || ['#c4cad4'])[0])}"></span>`)).join('') : ''}`;

  const list = templates.filter(t => (libCo === 'all' || (t.companyId || '') === libCo) &&
    (!q || (t.name + ' ' + ((coById(t.companyId) || {}).name || '') + ' ' + ((t.state.team && t.state.team.people) || []).map(p => Object.values(p.values).filter(v => !/^data:/.test(v)).join(' ')).join(' ')).toLowerCase().includes(q)));
  const moveOpts = cur => `<option value="">No company</option>` + ownCos().map(c => `<option value="${c.id}"${c.id === cur ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  const cards = list.map(t => {
    const ppl = (t.state.team && t.state.team.people.length) || 0, tc = coById(t.companyId);
    return `<div class="scard" data-tid="${t.id}">
      <button type="button" class="thumb2" data-a="open" aria-label="Open ${esc(t.name)}"><div>${thumbOf(t)}</div></button>
      <div class="meta"><div class="t" title="${esc(t.name)}">${esc(t.name)}</div>
        <div class="m">${tc && libCo === 'all' ? esc(tc.name) + '. ' : ''}${ppl ? `${ppl} ${ppl > 1 ? 'people' : 'person'}. ` : ''}Edited ${ago(t.updatedAt)}</div>
        ${t.sh ? `<div class="m"><span class="badge ok">Shared</span> by ${esc(t.sh.ownerEmail)}. ${permWords(t.sh.perms)}.</div>
        <div class="row"><button class="btn sm" data-a="open" type="button">Open</button><button class="btn sm" data-a="dup" type="button" title="Copy it into your own library">Make a copy</button></div></div></div>`
        : `<div class="row"><button class="btn sm" data-a="open" type="button">Open</button><button class="btn sm" data-a="dup" type="button">Duplicate</button>${ownCos().length ? `<select data-move aria-label="Company for ${esc(t.name)}">${moveOpts(t.companyId || '')}</select>` : ''}<button class="${delArm === t.id ? 'btn sm danger' : 'iconbtn'}" data-a="del" type="button" aria-label="Delete ${esc(t.name)}" title="Delete">${delArm === t.id ? 'Confirm delete' : G('far','trash-can')}</button></div></div></div>`}`;
  }).join('');
  const newCard = `<button type="button" class="newcard" data-a="new">${G('fas','plus')}<span>New signature${co ? ' for ' + esc(co.name) : ''}</span></button>`;

  const brandKit = co && brandOpen ? `<div class="brandkit">
      <div class="field"><span>Company name</span><input id="bk-name" type="text" value="${esc(co.name)}"></div>
      <div class="field"><span>Logo link</span><input id="bk-logourl" type="text" placeholder="https://…/logo.png" value="${esc(co.logoUrl || '')}"><div class="row" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px">${co.logoUrl ? `<img src="${esc(co.logoUrl)}" alt="" referrerpolicy="no-referrer" style="max-width:110px;max-height:34px;object-fit:contain">` : ''}<button class="btn sm" type="button" data-a="co-match"${co.logoUrl ? '' : ' disabled'}>Match colors to logo</button></div></div>
      <div class="field"><span>Brand colors</span><div style="display:flex;gap:6px;flex-wrap:wrap">${(co.palette || STYLE0.palette).map((c, i) => `<input type="color" data-bkc="${i}" value="${esc(c)}" aria-label="Brand color ${i + 1}" style="width:36px;height:30px;padding:0;border:1px solid var(--line);border-radius:6px;background:none">`).join('')}</div></div>
      <div class="field"><span>Font</span><select id="bk-font"><option value="">Keep each signature's font</option>${FONTS.map(f => `<option value="${esc(f[0])}"${fontStyle(f[0])}${f[0] === co.font ? ' selected' : ''}>${esc(f[1])}</option>`).join('')}</select></div>
      <div class="field"><span>Signatures</span><div class="row" style="display:flex;gap:6px;flex-wrap:wrap">${co.sh ? '' : `<button class="btn sm primary" data-a="co-applyall" type="button"${count(co.id) ? '' : ' disabled'}>Update all ${count(co.id)} with this brand</button>`}<button class="btn sm" data-a="co-done" type="button">Done</button></div></div>
    </div>` : '';
  const head = co ? `<div class="cohead">${co.logoUrl ? `<img class="logo" src="${esc(co.logoUrl)}" alt="${esc(co.name)} logo" referrerpolicy="no-referrer">` : ''}
      <div class="grow"><h1>${esc(co.name)}</h1><div style="display:flex;gap:4px;align-items:center;margin-top:6px">${swatches(co.palette)}<span class="note" style="margin-left:6px">${esc((FONTS.find(f => f[0] === co.font) || ['', ''])[1])}</span></div></div>
      ${co.sh ? `${co.sh.perms.edit_brand ? `<button class="btn" data-a="co-brand" type="button">${brandOpen ? 'Close brand kit' : 'Edit brand kit'}</button>` : ''}<button class="btn ghost" data-a="co-leave" type="button">${coDelArm === co.id ? 'Confirm: leave' : 'Leave'}</button></div>
      <p class="note">Shared with you by <b>${esc(co.sh.ownerEmail)}</b>. ${permWords(co.sh.perms)}. Only they can add or delete signatures here.</p>`
      : `<button class="btn" data-a="co-share" type="button">${shareOpen ? 'Close sharing' : 'Share'}</button>
      <button class="btn" data-a="co-brand" type="button">${brandOpen ? 'Close brand kit' : 'Edit brand kit'}</button>
      <button class="${coDelArm === co.id ? 'btn danger' : 'btn ghost'}" data-a="co-del" type="button">${coDelArm === co.id ? `Confirm: delete ${esc(co.name)}` : 'Delete company'}</button></div>
      ${coDelArm === co.id ? `<p class="note">Its ${count(co.id)} signature${count(co.id) === 1 ? '' : 's'} will be kept under "No company"${(members[co.id] || []).length ? ', and the people it\'s shared with lose access' : ''}.</p>` : ''}${shareOpen ? sharePanel(co) : ''}`}${brandKit}`
    : `<div class="cohead"><div class="grow"><h1>All signatures</h1></div></div>`;

  let body;
  if (!libReady) body = `<div class="empty">Loading your library…</div>`;
  else if (!templates.length) body = `<div class="sharecard"><h3>${G('fas','pen-nib')}Start your first signature</h3><p class="note">Pick a layout below. You can change everything about it, and it saves as you go.</p></div>${templateGallery('home', co)}`;
  else body = `<div class="sgrid">${q || (co && co.sh) ? '' : newCard}${cards}</div>${list.length ? '' : `<div class="empty">${q ? 'No signatures match that search.' : co ? `No signatures for ${esc(co.name)} yet.` : 'Nothing here yet.'}</div>`}`;
  const offer = user && offerMove ? `<div class="sharecard"><h3>${G('fas','cloud-arrow-up')}Move this browser's signatures into your account?</h3><p class="note">${offerMove} signature${offerMove === 1 ? ' is' : 's are'} saved in this browser from before you signed in. Moving them puts them in your account, on every device.</p><div class="row"><button class="btn primary sm" type="button" data-a="move-local">Move them</button><button class="btn sm" type="button" data-a="move-later">Not now</button></div></div>` : '';
  $('#homemain').innerHTML = offer + head + body;
  wireRemoteImages($('#homemain'));
  fitThumbs($('#homemain'));
  const ni = $('#co-new'); if (ni){ ni.focus(); ni.onkeydown = e => { if (e.key === 'Enter') $('#cos [data-a="co-create"]').click(); if (e.key === 'Escape'){ coForm = false; renderHome(); } }; }
  wireBrandKit(co);
}
function wireBrandKit(co){
  if (!co || !brandOpen) return;
  const sv = async msg => { try { await coSave(co); if (msg) toast(msg); } catch (er){ toast(er.message); } };
  $('#bk-name').onchange = e => { const v = e.target.value.trim(); if (v){ co.name = v; sv('Renamed.'); } };
  $('#bk-logourl').onchange = e => { co.logoUrl = e.target.value.trim(); sv('Logo link saved.').then(renderHome); };
  $('#bk-font').onchange = e => { co.font = e.target.value; sv(); };
  document.querySelectorAll('[data-bkc]').forEach(inp => inp.onchange = () => { co.palette = (co.palette || STYLE0.palette).slice(); co.palette[+inp.dataset.bkc] = inp.value; sv(); });
  const mb = document.querySelector('[data-a="co-match"]');
  if (mb) mb.onclick = () => paletteFromImage(co.logoUrl, p => { co.palette = p; sv(`${co.name}'s colors now match the logo.`).then(renderHome); });
}

/* "Preview with your details": the templates' fictional people swapped for the visitor's own
   name, title, email, phone and website, kept in this browser only */
const ME_KEY = 'sigstudio.me', ME_FIELDS = [['name','Name'],['pronouns','Pronouns'],['title','Job title'],['email','Email'],['phone','Phone'],['web','Website']];
const myDetails = () => store.get(ME_KEY) || {};
const initialsOf = n => n.replace(/^(dr|mr|mrs|ms|mx)\.?\s+/i, '').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
function withMe(st, me){
  if (!ME_FIELDS.some(([k]) => (me[k] || '').trim())) return st;
  // text is swapped inside the saved JSON, so names in bold, links (mailto:, tel:) and labels all follow
  const q = v => JSON.stringify(v).slice(1, -1), digits = v => (v || '').replace(/[^\d+]/g, '');
  let s = JSON.stringify(st);
  const swap = (from, to) => { if (from && to && to.trim()) s = s.split(q(from)).join(q(to.trim())); };
  samplePeople.forEach(w => {
    swap(w.email, me.email); swap(w.name.toUpperCase(), (me.name || '').toUpperCase()); swap(w.name, me.name);
    swap(w.phone, me.phone); swap(digits(w.phone), digits(me.phone));
    if (!/linkedin\.com/.test(w.web)) swap(w.web, me.web); // a LinkedIn link stays on its LinkedIn icon
  });
  if ((me.name || '').trim()) s = s.replace(/"a\|[^|"]*\|/g, '"a|' + q(initialsOf(me.name.trim())) + '|');
  st = JSON.parse(s);
  const title = (me.title || '').trim(), pro = (me.pronouns || '').trim();
  st.rows.forEach(r => r.cols.forEach(c => c.blocks.forEach(b => {
    if (b.type !== 'text') return;
    if (title && b.label === 'Title') b.text = title;
    if (pro && b.tag) b.tag = pro;
    if (pro && b.label === 'Pronouns') b.text = `(${pro})`;
  })));
  return st;
}

/* templates: a gallery used on the empty home screen and in the New signature dialog */
let presetCache = null, tplCat = 'All';
function templateGallery(where, co){
  const thumbOf = st => render(st, 'preview').html.replace(/ data-(bid|cid|rid)="[^"]*"/g, '');
  if (!presetCache){ presetCache = presets(); presetCache.forEach(p => p.thumb = thumbOf(migrate(p.state))); }
  const shown = presetCache.filter(p => tplCat === 'All' || p.cat === tplCat);
  // previews wear the picked company's brand kit and your details, just as createFrom will start them
  const me = myDetails(), mine = co && !co.sh, personal = ME_FIELDS.some(([k]) => (me[k] || '').trim());
  const brand = mine || personal ? p => { const st = migrate(p.state); if (mine) applyBrandIn(st, co); return thumbOf(withMe(st, me)); } : p => p.thumb;
  const cats = `<div class="seg" role="group" aria-label="Template category">${PRESET_CATS.map(c => `<button type="button" data-cat="${c}" aria-pressed="${c === tplCat}">${c}</button>`).join('')}</div>`;
  const grid = `<div class="tgrid">${shown.map(p => `<button type="button" class="pcard" data-preset="${p.key}" title="Start from ${esc(p.name)}"><div class="pv"><div>${brand(p)}</div></div><div class="pn">${esc(p.name)}</div></button>`).join('')}</div>`;
  return where === 'home' ? `${cats}${grid}<div><button class="btn sm" data-a="blank" type="button">Start blank</button></div>` : grid;
}
function openNew(){
  const s = $('#newco');
  s.innerHTML = `<option value="">No company</option>` + ownCos().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  s.value = coById(libCo) && !coById(libCo).sh ? libCo : '';
  $('#newme').innerHTML = `<summary>Preview with your details</summary><div class="mefields">${ME_FIELDS.map(([k, l]) => `<label><span>${l}</span><input type="text" data-me="${k}" value="${esc(myDetails()[k] || '')}"></label>`).join('')}</div><p class="note">Saved only in this browser. Every template fills in with these, and so does the signature you start.</p>`;
  $('#dlg-new').showModal(); drawNew();
}
// your details are saved as you type; the previews redraw a moment after you stop
let meT;
$('#newme').oninput = e => {
  const k = e.target.dataset.me; if (!k) return;
  const me = myDetails(); me[k] = e.target.value; store.set(ME_KEY, me);
  clearTimeout(meT); meT = setTimeout(drawNew, 250);
};
function drawNew(){
  const co = coById($('#newco').value);
  $('#newcats').innerHTML = PRESET_CATS.map(c => `<button type="button" data-cat="${c}" aria-pressed="${c === tplCat}">${c}</button>`).join('');
  $('#newnote').textContent = co ? `Templates start with ${co.name}'s colors, font and logo. Sample details are placeholders.` : 'Sample details are placeholders. Add yours below to see every template with them.';
  $('#newgrid').innerHTML = templateGallery('dialog', co);
  wireRemoteImages($('#newgrid'));
  fitThumbs($('#newgrid'));
}
$('#newco').onchange = drawNew;
$('#newcats').onclick = e => { const b = e.target.closest('[data-cat]'); if (b){ tplCat = b.dataset.cat; drawNew(); } };
$('#newgrid').onclick = e => { const b = e.target.closest('[data-preset]'); if (b){ $('#dlg-new').close(); createFrom(presets().find(p => p.key === b.dataset.preset), $('#newco').value); } };
$('#newblank').onclick = () => { $('#dlg-new').close(); createFrom(null, $('#newco').value); };
$('#newclose').onclick = () => $('#dlg-new').close();
$('#newsig').onclick = openNew;
const blankState = () => newState('Untitled signature', {}, [mkRow([[mk('text', { label:'Name', text:'Your Name', size:18, weight:700 }), mk('text', { label:'Title', text:'Job title, Company', size:13, color:'#5b6470' })]])]);
async function createFrom(p, coId){
  let st = migrate(p ? p.state : blankState());
  const co = coById(coId), mine = co && !co.sh;
  if (mine){ applyBrandIn(st, co); st.name = `${co.name}: ${st.name}`; } else st.companyId = '';
  if (p) st = withMe(st, myDetails());
  const id = uid() + uid();
  try { await libSave(id, st.name, st); } catch (e){ toast('Could not create it: ' + e.message); return; }
  openSig(id, st);
  toast(`Started "${st.name}". Changes save automatically.`);
}

$('#cos').addEventListener('click', async e => {
  const c = e.target.closest('[data-co]');
  if (c){ libCo = c.dataset.co; coDelArm = null; brandOpen = false; renderHome(); return; }
  const a = e.target.closest('[data-a]'); if (!a) return;
  if (a.dataset.a === 'co-form'){ coForm = !coForm; renderHome(); }
  if (a.dataset.a === 'co-cancel'){ coForm = false; renderHome(); }
  if (a.dataset.a === 'co-create'){
    const nm = ($('#co-new').value || '').trim(); if (!nm){ $('#co-new').focus(); return; }
    const co = { id:uid() + uid(), name:nm, palette:clone(STYLE0.palette), font:'', logo:'', logoUrl:'' };
    coForm = false; libCo = co.id; brandOpen = true;
    try { await coSave(co); toast(`Created ${nm}. Add a logo to set its brand, then make signatures.`); } catch (er){ toast(er.message); }
  }
});
$('#homemain').addEventListener('change', async e => {
  const s = e.target.closest('[data-move]'); if (!s) return;
  const t = templates.find(x => x.id === s.closest('[data-tid]').dataset.tid);
  const st = clone(t.state); st.companyId = s.value; const c = coById(s.value);
  try { await libSave(t.id, t.name, st); toast(`Moved "${t.name}" ${c ? 'to ' + c.name : 'out of its company'}.`, c ? { label:'Apply its brand', fn:async () => { const st2 = applyBrandIn(clone(st), c); await libSave(t.id, t.name, st2); toast(`Applied ${c.name}'s brand to "${t.name}".`); } } : null); } catch (er){ toast(er.message); }
});
$('#homemain').addEventListener('click', async e => {
  const cb = e.target.closest('[data-cat]'); if (cb){ tplCat = cb.dataset.cat; renderHome(); return; }
  const pc = e.target.closest('[data-preset]'); if (pc){ createFrom(presets().find(p => p.key === pc.dataset.preset), coById(libCo) ? libCo : ''); return; }
  const a = e.target.closest('[data-a]'); if (!a) return;
  const act = a.dataset.a, card = a.closest('[data-tid]'), t = card && templates.find(x => x.id === card.dataset.tid), co = coById(libCo);
  if (act !== 'del') delArm = null;
  if (act !== 'co-del') coDelArm = null;
  if (act === 'new') openNew();
  if (act === 'move-local') moveLocalIntoAccount();
  if (act === 'move-later'){ offerMove = 0; renderHome(); toast('They stay in this browser. Sign out to see them again.'); }
  if (act === 'blank') createFrom(null, co ? co.id : '');
  if (act === 'open') openSig(t.id, t.state);
  if (act === 'dup'){ const st = clone(t.state); st.name = t.name + ' copy'; if (t.sh) st.companyId = ''; try { await libSave(uid() + uid(), st.name, st); toast('Duplicated.'); } catch (er){ toast(er.message); } }
  if (act === 'del'){
    if (delArm !== t.id){ delArm = t.id; renderHome(); return; }
    delArm = null; const keep = clone(t);
    try { await libDelete(t.id); toast(`Deleted "${t.name}".`, { label:'Undo', fn:async () => { await libSave(keep.id, keep.name, keep.state); toast('Restored.'); } }); } catch { toast('Could not delete. Try again.'); }
  }
  if (act === 'co-brand'){ brandOpen = !brandOpen; shareOpen = false; renderHome(); }
  if (act === 'co-share'){
    if (!user){ toast('Sign in to share companies.'); openAccount(); return; }
    shareOpen = !shareOpen; brandOpen = false; renderHome();
    if (shareOpen){ try { await loadMembers(co); renderHome(); } catch (er){ toast(er.message); } }
  }
  if (act === 'co-leave'){
    if (coDelArm !== co.id){ coDelArm = co.id; renderHome(); return; }
    coDelArm = null;
    const { error } = await sb.rpc('leave_shared_company', { p_owner:co.sh.owner, p_id:co.sh.rid });
    if (error){ toast('Could not leave: ' + error.message); return; }
    await loadCloud(); libCo = 'all'; renderHome(); toast(`You left ${co.name}.`);
  }
  if (act === 'mem-remove'){
    const em = a.dataset.email;
    const { error } = await sb.from('company_members').delete().eq('company_id', co.id).eq('email', em);
    if (error){ toast('Could not remove them: ' + error.message); return; }
    await loadMembers(co); renderHome(); toast(`${em} no longer has access.`);
  }
  if (act === 'mem-invite'){ const ok = await copyText(inviteText(co, a.dataset.email)); toast(ok ? 'Invite message copied. Paste it into an email or chat.' : 'Copy was blocked.'); }
  if (act === 'co-done'){ brandOpen = false; renderHome(); }
  if (act === 'co-applyall'){
    const list = templates.filter(x => x.companyId === co.id); let n = 0;
    a.disabled = true; a.textContent = 'Updating…';
    for (const tt of list){ try { await libSave(tt.id, tt.name, applyBrandIn(migrate(tt.state), co)); n++; } catch {} }
    toast(`Updated ${n} signature${n === 1 ? '' : 's'} with ${co.name}'s brand.`); renderHome();
  }
  if (act === 'co-del'){
    if (coDelArm !== co.id){ coDelArm = co.id; renderHome(); return; }
    coDelArm = null;
    try {
      for (const tt of templates.filter(x => x.companyId === co.id)){ const st = clone(tt.state); st.companyId = ''; await libSave(tt.id, tt.name, st); }
      await coDelete(co.id); libCo = 'all'; renderHome(); toast(`Deleted ${co.name}. Its signatures were kept.`);
    } catch { toast('Could not delete the company. Try again.'); }
  }
});
$('#homeq').oninput = e => { libQ = e.target.value; renderHome(); };

/* ---------- sharing a company (owner side) ---------- */
let shareOpen = false, lastInvite = '';
const members = {};
const ROLES = [
  ['view', 'Can view', { can_view_people:true, can_edit_people:false, can_edit_design:false, can_edit_brand:false }],
  ['design', 'View design only (no employee details)', { can_view_people:false, can_edit_people:false, can_edit_design:false, can_edit_brand:false }],
  ['people', 'Can edit employees', { can_view_people:true, can_edit_people:true, can_edit_design:false, can_edit_brand:false }],
  ['all', 'Can edit everything', { can_view_people:true, can_edit_people:true, can_edit_design:true, can_edit_brand:true }]
];
const PERMS = [['can_view_people', 'See employees'], ['can_edit_people', 'Edit employees'], ['can_edit_design', 'Edit design'], ['can_edit_brand', 'Edit brand kit']];
async function loadMembers(co){
  const { data, error } = await sb.from('company_members').select('*').eq('company_id', co.id).order('created_at');
  if (error) throw cloudErr(error);
  members[co.id] = data;
}
const toolUrl = () => location.origin + location.pathname;
const inviteText = (co, email) => `I shared the "${co.name}" email signatures with you on Signature Studio. Open ${toolUrl()} and sign in with ${email} to see them.`;
function sharePanel(co){
  const list = members[co.id];
  const rows = (list || []).map(m => `<div class="memrow" data-email="${esc(m.email)}"><div class="grow"><b>${esc(m.email)}</b><div class="memperms">${PERMS.map(([k, l]) => `<label class="chk"><input type="checkbox" data-perm="${k}"${m[k] ? ' checked' : ''}>${l}</label>`).join('')}</div></div>
    <div class="row"><button class="btn sm" type="button" data-a="mem-invite" data-email="${esc(m.email)}">Copy invite</button><a class="btn sm ghost" href="mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Email signatures for ' + co.name)}&body=${encodeURIComponent(inviteText(co, m.email))}">Email invite</a><button class="btn sm ghost danger" type="button" data-a="mem-remove" data-email="${esc(m.email)}">Remove</button></div></div>`).join('');
  return `<div class="sharecard sharepanel"><h3>${G('fas','user-plus')}Share ${esc(co.name)}</h3>
    <p class="note">People you add see this company and its signatures after they sign in with that email. They can't share it, delete it, or add new signatures. Change what each person can do below; it takes effect the next time they open the page.</p>
    <form id="shareform" class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      <div class="field" style="flex:1 1 220px"><span>Email</span><input id="share-email" type="email" required placeholder="name@company.com" autocomplete="off"></div>
      <div class="field"><span>Access</span><select id="share-role">${ROLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      <button class="btn primary" type="submit">Share</button></form>
    ${lastInvite ? `<div class="chkline ok"><span class="dot"></span><span>Shared. They won't get an email from us, so send them the invite: <button class="btn sm" type="button" data-a="mem-invite" data-email="${esc(lastInvite)}">Copy invite</button></span></div>` : ''}
    ${list ? (rows ? `<div class="memlist">${rows}</div>` : '<p class="note">Not shared with anyone yet.</p>') : '<p class="note">Loading…</p>'}</div>`;
}
$('#homemain').addEventListener('submit', async e => {
  if (e.target.id !== 'shareform') return;
  e.preventDefault();
  const co = coById(libCo), email = $('#share-email').value.trim().toLowerCase(), role = ROLES.find(r => r[0] === $('#share-role').value)[2];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Enter an email address.'); return; }
  if (user && email === (user.email || '').toLowerCase()){ toast("That's your own email."); return; }
  const { error } = await sb.from('company_members').upsert(Object.assign({ company_owner:user.id, company_id:co.id, email }, role));
  if (error){ toast('Could not share: ' + error.message); return; }
  lastInvite = email; await loadMembers(co); renderHome();
  toast(`Shared ${co.name} with ${email}.`);
});
$('#homemain').addEventListener('change', async e => {
  const cb = e.target.closest('[data-perm]'); if (!cb) return;
  const co = coById(libCo), em = cb.closest('[data-email]').dataset.email, k = cb.dataset.perm, patch = { [k]:cb.checked };
  // editing employees needs seeing them; hiding them takes editing away too
  if (k === 'can_edit_people' && cb.checked) patch.can_view_people = true;
  if (k === 'can_view_people' && !cb.checked) patch.can_edit_people = false;
  const { error } = await sb.from('company_members').update(patch).eq('company_id', co.id).eq('email', em);
  if (error){ toast('Could not change that: ' + error.message); cb.checked = !cb.checked; return; }
  await loadMembers(co); renderHome(); toast('Access updated.');
});
function ago(t){ const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return new Date(t).toLocaleDateString(); }

// key-order-independent JSON, since the store may hand documents back with keys sorted
const canon = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {}) : v);
function loadLocal(){
  templates = loadList(LIBKEY).sort((a, b) => b.updatedAt - a.updatedAt); companies = loadList(COKEY);
}
function initLib(){
  loadLocal();
  try { localStorage.setItem('sigstudio.test', '1'); localStorage.removeItem('sigstudio.test'); } catch { storageOK = false; }
  libReady = true; renderHome();
  if (!storageOK) toast("This browser won't let the page save. Your work lasts only until you close the tab, so export a backup.");
  initAuth();
}

/* ---------- accounts (optional): sign in with a one-time email code or link ---------- */
let offerMove = 0; // browser signatures waiting to be moved into a just-signed-in account
function initAuth(){
  if (!window.supabase){ $('#acctbtn').hidden = true; return; } // library didn't load: guest mode only
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{ flowType:'pkce', detectSessionInUrl:true, persistSession:true, autoRefreshToken:true } });
  sb.auth.onAuthStateChange((ev, session) => { setTimeout(() => setUser(session ? session.user : null), 0); });
  // only offer Google once it's switched on in the project (otherwise Supabase shows a raw error page)
  fetch(SUPABASE_URL + '/auth/v1/settings', { headers:{ apikey:SUPABASE_KEY } }).then(r => r.json())
    .then(j => { googleOn = !!(j.external && j.external.google); if ($('#dlg-acct').open && authStep === 'email') drawAccount(); }).catch(() => {});
  // coming back from a failed or cancelled Google / email sign-in
  const q = new URLSearchParams(location.search + '&' + location.hash.slice(1));
  if (q.get('error_description')){ toast("Sign-in didn't finish: " +q.get('error_description')); history.replaceState(null, '', location.pathname); }
}
async function setUser(u){
  if ((u && u.id) === (user && user.id)) { renderAccount(); return; }
  if (view === 'editor') await closeEditor();
  user = u || null;
  renderAccount();
  if (user && $('#dlg-acct').open && authStep !== 'account'){ $('#dlg-acct').close(); toast('Signed in as ' + (user.email || 'you') + '.'); }
  if (!user){ loadLocal(); libReady = true; renderHome(); renderCompanySelect(); return; }
  libReady = false; renderHome();
  try { await loadCloud(); } catch (e){ toast('Could not load your account: ' + e.message + '.'); }
  libReady = true;
  const local = loadList(LIBKEY), moved = store.get('sigstudio.moved.' + user.id);
  offerMove = local.length && !moved ? local.length : 0;
  renderHome(); renderCompanySelect();
  if (location.search.includes('code=')) history.replaceState(null, '', location.pathname);
}
async function moveLocalIntoAccount(){
  const sigs = loadList(LIBKEY), cos = loadList(COKEY);
  try {
    await saveMany(sigs, cos);
    store.set('sigstudio.moved.' + user.id, Date.now());
    // they live in the account now; clearing them here stops them showing up again on sign-out
    persist(LIBKEY, []); persist(COKEY, []);
    offerMove = 0; renderHome(); renderCompanySelect();
    toast(`Moved ${sigs.length} signature${sigs.length === 1 ? '' : 's'} into your account.`);
  } catch (e){ toast('Could not move them: ' + e.message + '.'); }
}
function renderAccount(){
  const b = $('#acctbtn'); if (!b) return;
  b.textContent = user ? (user.email || 'Account') : 'Sign in';
  b.title = user ? 'Your account' : 'Sign in to keep your signatures on every device';
  b.classList.toggle('primary', false);
}
// Email sign-in stays off until a mail sender (SMTP, e.g. Resend) is set up in Supabase;
// Supabase's built-in sender only reaches the project's own team. Flip to true then.
const EMAIL_SIGNIN = false;
let authStep = 'email', authEmail = '', authBusy = false, delAcct = false, resendAt = 0, codeOpen = false, googleOn = false;
function openAccount(){ authStep = user ? 'account' : 'email'; delAcct = false; drawAccount(); $('#dlg-acct').showModal(); const i = $('#dlg-acct input'); if (i) i.focus(); }
function drawAccount(){
  const B = $('#acctbody');
  if (authStep === 'account'){
    B.innerHTML = `<p>Signed in as <b>${esc(user.email || '')}</b>. Your signatures and companies are saved to your account, so they're here on any device you sign in on.</p>
      <div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-a="signout">Sign out</button></div>
      <div class="sharecard" style="margin-top:6px"><h3>Delete account</h3><p class="note">Deletes your account and every signature and company in it, for good. Export a backup first if you might want them.</p>
      ${delAcct ? `<div class="field"><span>Type DELETE to confirm</span><input id="delconfirm" type="text" autocomplete="off"></div><div class="row"><button class="btn danger" type="button" data-a="delacct-go">Delete my account</button><button class="btn" type="button" data-a="delacct-no">Cancel</button></div>` : `<div class="row"><button class="btn ghost danger" type="button" data-a="delacct">Delete account…</button></div>`}</div>`;
    return;
  }
  if (authStep === 'email'){
    B.innerHTML = `<p>Sign in to keep your signatures in your account and use them on any device.</p>
      ${googleOn ? `<div id="gsibtn" class="gsiwrap"><span class="note">Loading Google sign-in…</span></div>` : `<p class="note">Loading sign-in…</p>`}
      ${EMAIL_SIGNIN ? `${googleOn ? '<div class="orline"><span>or use your email</span></div>' : ''}
      <form id="authform" class="field" style="gap:8px"><span>Email</span><input id="authemail" type="email" autocomplete="email" required value="${esc(authEmail)}" placeholder="you@example.com">
      <div class="row" style="display:flex;gap:8px"><button class="btn" type="submit"${authBusy ? ' disabled' : ''}>${authBusy ? 'Sending…' : 'Email me a sign-in link'}</button></div></form>` : ''}
      <p class="note">Signing in is optional. Without it, everything stays in this browser.</p>`;
    mountGoogle();
    return;
  }
  const wait = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
  B.innerHTML = `<h3 style="margin:0;font-size:17px">Check your email</h3>
    <p>We emailed a sign-in link to <b>${esc(authEmail)}</b>. Open the link on this device and you'll be signed in here. You can close this box.</p>
    <div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-a="resend"${wait ? ' disabled' : ''}>${wait ? `Resend in ${wait}s` : 'Resend email'}</button><button class="btn ghost" type="button" data-a="otheremail">Use a different email</button></div>
    <p class="note">Can't find it? Check spam. The email comes from Supabase, the service that runs sign-in.</p>
    <details${codeOpen ? ' open' : ''} id="codedetails"><summary class="note" style="cursor:pointer">Reading email on a different device? Sign in with the code instead</summary>
      <form id="codeform" class="field" style="gap:8px;margin-top:8px"><span>Code from the email</span><input id="authcode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required placeholder="123456">
      <div class="row" style="display:flex;gap:8px"><button class="btn primary" type="submit"${authBusy ? ' disabled' : ''}>${authBusy ? 'Checking…' : 'Sign in with code'}</button></div></form></details>`;
  const det = $('#codedetails'); if (det) det.ontoggle = () => { codeOpen = det.open; };
  if (wait) setTimeout(() => { if (authStep === 'code' && $('#dlg-acct').open) drawAccount(); }, 1000);
}
/* Google's own sign-in button (Google Identity Services). Because the popup comes from this page,
   Google names jackjaillet.com, not the Supabase address. Google's script loads only when the
   sign-in box opens. Supabase checks the ID token, matched to a one-time nonce. */
const GOOGLE_CLIENT_ID = '177957739990-5jnfagsstcbia381oek4lbg9vf4qmv0s.apps.googleusercontent.com';
let gsiLoading = null;
function loadGsi(){
  return gsiLoading || (gsiLoading = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = res; sc.onerror = () => { gsiLoading = null; rej(new Error("Google sign-in couldn't load")); };
    document.head.appendChild(sc);
  }));
}
const hexOf = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
async function mountGoogle(){
  const box = $('#gsibtn'); if (!box) return;
  try {
    await loadGsi();
    const raw = hexOf(crypto.getRandomValues(new Uint8Array(16)));
    const hashed = hexOf(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
    google.accounts.id.initialize({
      client_id:GOOGLE_CLIENT_ID, nonce:hashed, ux_mode:'popup', context:'signin', itp_support:true,
      callback:async resp => {
        const { error } = await sb.auth.signInWithIdToken({ provider:'google', token:resp.credential, nonce:raw });
        if (error) toast("Google sign-in didn't finish: " + error.message);
      }
    });
    if (!document.body.contains(box)) return;
    box.innerHTML = '';
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    google.accounts.id.renderButton(box, { type:'standard', theme:dark ? 'filled_black' : 'outline', size:'large', text:'continue_with', shape:'rectangular', logo_alignment:'center', width:Math.min(400, Math.max(220, box.clientWidth || 320)) });
  } catch (e){ box.innerHTML = `<p class="note">${esc(e.message)}. Use your email instead.</p>`; }
}
async function sendCode(){
  authBusy = true; drawAccount();
  const { error } = await sb.auth.signInWithOtp({ email:authEmail, options:{ shouldCreateUser:true, emailRedirectTo:location.origin + location.pathname } });
  authBusy = false;
  if (error){ authStep = 'email'; drawAccount(); toast(/rate|many|seconds/i.test(error.message) ? 'Too many emails just now. Wait a minute, then try again.' : 'Could not send the email: ' + error.message); return; }
  authStep = 'code'; codeOpen = false; resendAt = Date.now() + 60000; drawAccount();
}
$('#acctbody').addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'authform'){ authEmail = $('#authemail').value.trim(); if (authEmail) sendCode(); }
  if (e.target.id === 'codeform'){
    const token = $('#authcode').value.trim(); if (!token) return;
    authBusy = true; drawAccount();
    const { error } = await sb.auth.verifyOtp({ email:authEmail, token, type:'email' });
    authBusy = false;
    if (error){ codeOpen = true; drawAccount(); $('#authcode').value = token; toast("That code didn't work. Check it, or resend a new one."); return; }
    $('#dlg-acct').close(); toast('Signed in.');
  }
});
$('#acctbody').addEventListener('click', async e => {
  const a = e.target.closest('[data-a]'); if (!a) return;
  const act = a.dataset.a;
  if (act === 'resend') sendCode();
  if (act === 'otheremail'){ authStep = 'email'; drawAccount(); $('#authemail').focus(); }
  if (act === 'signout'){ await saveNow(); await sb.auth.signOut(); $('#dlg-acct').close(); toast('Signed out. Your signatures stay in your account.'); }
  if (act === 'delacct'){ delAcct = true; drawAccount(); $('#delconfirm').focus(); }
  if (act === 'delacct-no'){ delAcct = false; drawAccount(); }
  if (act === 'delacct-go'){
    if ($('#delconfirm').value.trim() !== 'DELETE'){ toast('Type DELETE to confirm.'); return; }
    const { error } = await sb.rpc('delete_my_account');
    if (error){ toast('Could not delete the account: ' + error.message); return; }
    await sb.auth.signOut(); $('#dlg-acct').close(); toast('Your account and everything in it is deleted.');
  }
});
$('#acctbtn').onclick = openAccount;
$('#acctclose').onclick = () => $('#dlg-acct').close();

// another tab changed the library: pick it up, and refresh the open signature if nothing is waiting to save here
addEventListener('storage', e => {
  if (user || (e.key !== LIBKEY && e.key !== COKEY)) return;
  templates = loadList(LIBKEY).sort((a, b) => b.updatedAt - a.updatedAt); companies = loadList(COKEY);
  const mine = view === 'editor' && sigId && templates.find(t => t.id === sigId);
  if (mine && saveStatus === 'saved' && !saving){ const remote = migrate(mine.state); if (canon(remote) !== canon(state)){ state = remote; lastSnap = snapshot(); if (sel !== 'style' && !find(sel)) sel = 'style'; renderAll(); toast('Updated with changes from another tab.'); } }
  renderHome(); renderCompanySelect();
});
/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if (view !== 'editor') return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('dialog[open]');
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z' && !typing){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
  if (mod && k === 'y' && !typing){ e.preventDefault(); redo(); }
  if (mod && k === 's'){ e.preventDefault(); saveNow().then(() => toast(saveStatus === 'saved' ? 'Saved.' : 'Not saved: ' + saveErr)); }
  if (step !== 'design' || typing || !permsOf(curSig()).edit_design) return;
  if (k === 'delete' || k === 'backspace'){
    const f = find(sel);
    if (f && f.kind === 'block'){ e.preventDefault(); f.c.blocks.splice(f.i, 1); sel = 'style'; toast('Block deleted.', UNDO); changed({ list:true, insp:true }); }
  }
  if (mod && k === 'd'){
    const f = find(sel);
    if (f && f.kind === 'block'){ e.preventDefault(); const c = clone(f.b); c.id = uid(); f.c.blocks.splice(f.i + 1, 0, c); sel = c.id; changed({ list:true, insp:true }); }
  }
});
$('#undo').onclick = undo; $('#redo').onclick = redo;
// don't lose a pending save when the tab closes
addEventListener('pagehide', () => { if (saveStatus !== 'saved') saveNow(); });

/* ---------- a person's own signature page (?p=link), no account needed ---------- */
let personData = null, personToken = '';
async function initPerson(token){
  personToken = token;
  $('#app').dataset.view = 'person';
  $('#view-home').hidden = true; $('#view-editor').hidden = true; $('#view-person').hidden = false;
  document.title = 'Your email signature | Signature Studio';
  const B = $('#personbody');
  B.innerHTML = '<p class="note">Loading your signature…</p>';
  if (!window.supabase){ B.innerHTML = '<div class="sharecard"><h3>Couldn\'t load</h3><p class="note">This page needs an internet connection to show your signature. Reload to try again.</p></div>'; return; }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{ persistSession:false, detectSessionInUrl:false, autoRefreshToken:false } });
  const { data, error } = await sb.rpc('person_signature', { p_token:token });
  if (error){ B.innerHTML = `<div class="sharecard"><h3>This link isn't working</h3><p class="note">${esc(error.message)}</p></div>`; return; }
  personData = data; drawPerson();
}
function drawPerson(){
  const st = migrate(personData.state), p = st.team.people[0], pid = p.id, fields = st.team.fields;
  const g = render(st, 'gmail', pid), sample = g.embedded.length;
  const first = (p.values.name || '').trim().split(/\s+/)[0];
  $('#personbody').innerHTML = `
    <h1 class="ptitle">${first ? esc(first) + ', here\'s' : 'Here\'s'} your email signature</h1>
    <p class="note">From <b>${esc(personData.name || 'your team')}</b>. Copy it, then paste it into your email settings.</p>
    <div class="mail"><div class="mailbody"><div class="dash">--</div><div class="sigwrap" id="psig">${render(st, 'preview', pid).html}</div></div></div>
    ${sample ? chkHtml([['warn', 'Some pictures in this signature are samples that email apps can\'t show. Ask whoever sent this link to replace them.']]) : ''}
    <div class="sharecard"><h3>${G('fab','google')}Gmail</h3><ol class="steps note">${STEPS.gmail.map(x => `<li>${x}</li>`).join('')}</ol>
      <div class="row"><button class="btn primary" type="button" data-a="p-gmail">Copy for Gmail</button></div></div>
    <div class="sharecard"><h3>${G('fas','envelope-open-text')}Outlook and Apple Mail</h3><ol class="steps note">${STEPS.outlook.map(x => `<li>${x}</li>`).join('')}</ol>
      <div class="row"><button class="btn" type="button" data-a="p-embed">Copy for Outlook / Apple Mail</button></div></div>
    ${personData.can_edit ? `<form class="sharecard" id="pform"><h3>${G('fas','user-pen')}Your details</h3><p class="note">Fix anything that's out of date. Saving updates your signature for everyone who manages it.</p>
      ${fields.map(f => `<div class="field"><span>${esc(f.label)}</span><input type="text" name="${esc(f.key)}" value="${esc(p.values[f.key] || '')}"${f.type === 'image' ? ' placeholder="https://… link to your photo"' : ''}></div>`).join('')}
      <div class="row"><button class="btn primary" type="submit">Save my details</button></div></form>` : ''}
    <p class="note" style="margin-top:8px">Made with <a href="./">Signature Studio</a>, a free email signature builder.</p>`;
  wireRemoteImages($('#psig'));
}
$('#personbody').addEventListener('click', async e => {
  const a = e.target.closest('[data-a]'); if (!a || !personData) return;
  const st = migrate(personData.state), pid = st.team.people[0].id;
  if (a.dataset.a === 'p-gmail'){ const ok = await copyRich(render(st, 'gmail', pid).html, plainText(st, pid)); toast(ok ? 'Copied. Now paste it into Gmail\'s signature settings.' : 'Copy was blocked. Select the signature above and copy it.'); }
  if (a.dataset.a === 'p-embed'){ render(st, 'preview', pid); const ok = await copyRich(render(st, 'embed', pid).html, plainText(st, pid)); toast(ok ? 'Copied. Now paste it into your signature settings.' : 'Copy was blocked.'); }
});
$('#personbody').addEventListener('submit', async e => {
  if (e.target.id !== 'pform') return;
  e.preventDefault();
  const values = Object.fromEntries(new FormData(e.target).entries());
  const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Saving…';
  const { error } = await sb.rpc('person_update', { p_token:personToken, p_values:values });
  if (error){ btn.disabled = false; btn.textContent = 'Save my details'; toast(error.message); return; }
  const r = await sb.rpc('person_signature', { p_token:personToken });
  if (!r.error){ personData = r.data; drawPerson(); }
  toast('Saved. Your signature is up to date.');
});

/* ---------- boot ---------- */
// light/dark switch shared with the rest of jackjaillet.com (localStorage "theme"; dark is the default)
function paintTheme(){
  const light = document.documentElement.dataset.theme === 'light';
  $('#themebtn').setAttribute('aria-checked', String(!light));
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = light ? '#f7f8fa' : '#10131a';
}
$('#themebtn').onclick = () => {
  const light = document.documentElement.dataset.theme !== 'light';
  if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
  paintTheme();
  if (view === 'home') renderHome();
};
paintTheme();
$('#back').innerHTML = G('fas', 'arrow-left') + ' All signatures';
const PTOKEN = new URLSearchParams(location.search).get('p');
if (PTOKEN) initPerson(PTOKEN);
else { showView('home'); initLib(); }
$('#exportlib').onclick = exportLibrary;
$('#importlib').onchange = e => { const f = e.target.files[0]; if (f) importLibrary(f); e.target.value = ''; };
$('#aboutbtn').onclick = () => $('#dlg-about').showModal();
$('#aboutclose').onclick = () => $('#dlg-about').close();
