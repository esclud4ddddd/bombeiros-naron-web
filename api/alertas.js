// Alertas meteorológicas activas (MeteoGalicia, los avisos que difunde el 112 Galicia).
//  - galicia: nivel más alto activo en toda Galicia, incluidos los avisos costeros por zonas (0-3)
//  - alertas: avisos activos en el concello de Narón
// Si una fuente falla se ignora; si fallan todas, galicia = 0 y alertas = [].
const CONCELLOS = 'https://servizos.meteogalicia.gal/mgrss/predicion/adversos/jsonAvisosConcellos.action?dia=-1';
const RSS = [
  'https://servizos.meteogalicia.gal/mgrss/predicion/adversos/rssAdversos.action?request_locale=gl',
  'https://servizos.meteogalicia.gal/mgrss/predicion/rssAdversos.action?request_locale=gl',
  'https://servizos.meteogalicia.gal/rss/predicion/rssAdversos.action?request_locale=gl'
];
// AEMET (Galicia): incluye los avisos por costeros que el 112 difunde, p. ej. "Noroeste da Coruña".
const AEMET = [
  'https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC71_RSS.xml',
  'https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC71_ATOM.xml'
];
const ZONA_NARON = /noroeste\s+d[ae]\s+(a\s+)?coru[ñn]a/i;   // zona AEMET de Ferrolterra
const ID_NARON = 15054;
const CAB = { 'User-Agent': 'BombeirosNaron-web (servizo municipal de emerxencias)' };

const ahoraMadrid = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
}).format(new Date()).replace(' ', 'T');
const norm = s => {
  s = String(s || '').trim();
  let m = /(\d{4})-?(\d{2})-?(\d{2})[T ](\d{2}):(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(s); if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`;
  return '';
};
const traer = (u, tipo) => fetch(u, { headers: { ...CAB, Accept: tipo }, signal: AbortSignal.timeout(8000) });

async function deConcellos(ahora) {
  const r = await traer(CONCELLOS, 'application/json'); if (!r.ok) throw new Error('HTTP ' + r.status);
  const lista = (await r.json()).listaAvisosConcellos || [];
  const activo = a => { const f = norm(a.dataFin); return +a.idNivel >= 1 && (!f || f >= ahora); };
  const galicia = lista.reduce((m, a) => activo(a) ? Math.max(m, Math.min(3, +a.idNivel)) : m, 0);
  const vistos = new Set();
  const alertas = lista
    .filter(a => (+a.idconcello === ID_NARON || /^nar[oó]n$/i.test(String(a.nomeConcello || '').trim())) && activo(a))
    .map(a => ({ nivel: Math.min(3, +a.idNivel), tipo_es: a.tipoalerta_es || '', tipo_gl: a.tipoalerta_gl || '', ini: norm(a.dataIni), fin: norm(a.dataFin) }))
    .filter(a => { const k = [a.nivel, a.tipo_es, a.ini, a.fin].join('|'); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .sort((a, b) => b.nivel - a.nivel || a.ini.localeCompare(b.ini));
  return { galicia, alertas };
}

const NIVW = [[3, /\b(vermell[oa]s?|roj[oa]s?)\b/i], [2, /\b(laranx[ao]s?|naranj[ao]s?)\b/i], [1, /\b(amarel[oa]s?|amarill[oa]s?)\b/i]];
const nivelDe = t => { for (const [n, re] of NIVW) if (re.test(t)) return n; return 0; };
// Busca "nivel laranxa", "aviso naranja", etc. en el texto de cada elemento
function nivelTexto(x) {
  let max = 0;
  for (const it of x.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || []) {
    const t = it.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;[^&]*&gt;/g, ' ');
    if (/n[oi]n?\s+h(ai|ay)\s+avisos|sin avisos/i.test(t)) continue;
    const m = /(nivel|aviso|alerta)\s+(de\s+)?(nivel\s+)?(\w+)/gi; let r, n = 0;
    while ((r = m.exec(t))) n = Math.max(n, nivelDe(r[4]));
    max = Math.max(max, n);
  }
  return max;
}

const FEN = /(costeros|costeiros|lluvias?|choivas?|viento|vento|nevadas|neve|tormentas|treboadas|temperaturas?\s+m[aá]ximas|temperaturas?\s+m[ií]nimas|nieblas?|n[eé]boas|aludes|polvo|galerna|rissagas|deshielo)/i;
async function deAemet(ahora) {
  for (const u of AEMET) {
    try {
      const r = await traer(u, 'application/rss+xml, application/atom+xml, application/xml, text/xml'); if (!r.ok) continue;
      const x = await r.text(); if (!/<(channel|feed)/i.test(x)) continue;
      let galicia = 0; const alertas = [], vistos = new Set();
      for (const it of x.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || []) {
        const tit = ((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(it) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        const txt = it.replace(/<!\[CDATA\[|\]\]>/g, '');
        const n = nivelDe(tit) || nivelDe(((/nivel\s+(\w+)/i.exec(txt)) || [])[1] || '');
        if (!n) continue;
        const fechas = (txt.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}|\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/g) || []).map(norm).filter(Boolean).sort();
        const fin = fechas.length > 1 ? fechas[fechas.length - 1] : '';
        if (fin && fin < ahora) continue;
        galicia = Math.max(galicia, n);
        if (ZONA_NARON.test(tit) || ZONA_NARON.test(txt)) {
          const f = (FEN.exec(tit) || FEN.exec(txt) || [])[1] || '';
          const fl = f.toLowerCase();
          const es = /cost/.test(fl) ? 'Costeros' : /llu|choi/.test(fl) ? 'Lluvias' : /vien|vent/.test(fl) ? 'Viento' : /nev|neve/.test(fl) ? 'Nevadas' : /torm|treb/.test(fl) ? 'Tormentas' : /m[aá]x/.test(fl) ? 'Temperaturas máximas' : /m[ií]n/.test(fl) ? 'Temperaturas mínimas' : /nie|n[eé]bo/.test(fl) ? 'Nieblas' : f;
          const gl = { Costeros: 'Costeiros', Lluvias: 'Choivas', Viento: 'Vento', Nevadas: 'Neve', Tormentas: 'Treboadas', 'Temperaturas máximas': 'Temperaturas máximas', 'Temperaturas mínimas': 'Temperaturas mínimas', Nieblas: 'Néboas' }[es] || es;
          const a = { nivel: n, tipo_es: es, tipo_gl: gl, ini: fechas.length > 1 ? fechas[0] : '', fin, zona: 'Noroeste da Coruña', fuente: 'AEMET' };
          const k = [a.nivel, a.tipo_es, a.ini, a.fin].join('|'); if (!vistos.has(k)) { vistos.add(k); alertas.push(a); }
        }
      }
      return { galicia, alertas, url: u };
    } catch (e) {}
  }
  return null;
}

async function deRss(ahora) {
  for (const u of RSS) {
    try {
      const r = await traer(u, 'application/rss+xml, application/xml, text/xml'); if (!r.ok) continue;
      const x = await r.text(); if (!/<channel/i.test(x)) continue;
      let max = 0;
      const tramos = x.match(/<tramo\b[\s\S]*?(?:<\/tramo>|\/>)/gi) || [];
      for (const t of tramos) {
        const n = +((/nivel(?:>|\s*=\s*")\s*(\d)/i.exec(t) || [])[1] || 0);
        const f = norm((/dataFin(?:>|\s*=\s*")([^<"]+)/i.exec(t) || [])[1]);
        if (n >= 1 && (!f || f >= ahora)) max = Math.max(max, Math.min(3, n));
      }
      max = Math.max(max, nivelTexto(x));
      if (!tramos.length) (x.match(/nivelMax\s*=\s*"(\d)"/gi) || []).forEach(s => { max = Math.max(max, Math.min(3, +s.replace(/\D/g, ''))); });
      return { galicia: max, url: u };
    } catch (e) {}
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
  const ahora = ahoraMadrid();
  const [c, r, ae] = await Promise.allSettled([deConcellos(ahora), deRss(ahora), deAemet(ahora)]);
  const con = c.status === 'fulfilled' ? c.value : null, rss = r.status === 'fulfilled' ? r.value : null, aem = ae.status === 'fulfilled' ? ae.value : null;
  const alertas = [...(con ? con.alertas : []), ...(aem ? aem.alertas : [])].sort((a, b) => b.nivel - a.nivel || String(a.ini).localeCompare(String(b.ini)));
  res.status(200).send(JSON.stringify({
    actualizado: ahora, fuente: 'MeteoGalicia + AEMET',
    galicia: Math.max(con ? con.galicia : 0, rss ? rss.galicia : 0, aem ? aem.galicia : 0, alertas.reduce((m, a) => Math.max(m, a.nivel), 0)),
    alertas,
    estado: { concellos: con ? 'ok' : 'sin datos', rss: rss ? rss.url : 'sin datos', aemet: aem ? aem.url + ' (nivel ' + aem.galicia + ')' : 'sin datos' }
  }));
};
