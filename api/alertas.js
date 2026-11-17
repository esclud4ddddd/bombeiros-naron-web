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
  const [c, r] = await Promise.allSettled([deConcellos(ahora), deRss(ahora)]);
  const con = c.status === 'fulfilled' ? c.value : null, rss = r.status === 'fulfilled' ? r.value : null;
  res.status(200).send(JSON.stringify({
    actualizado: ahora, fuente: 'MeteoGalicia',
    galicia: Math.max(con ? con.galicia : 0, rss ? rss.galicia : 0),
    alertas: con ? con.alertas : [],
    estado: { concellos: con ? 'ok' : 'sin datos', rss: rss ? rss.url : 'sin datos' }
  }));
};
