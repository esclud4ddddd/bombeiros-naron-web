// Noticias de prensa automáticas sobre los bomberos de Narón (Google News RSS).
// Devuelve las de los últimos 4 días; la página las mezcla con las que sube el administrador.
const CONSULTAS = [
  '"bomberos de Narón"', '"Speis de Narón"', 'Speis Narón', '"Bombeiros de Narón"', '"Bombeiros Narón"',
  'bomberos Narón incendio', 'bomberos Narón rescate', 'Narón Speis intervención'
];
const DIAS = 4;
const RELEVANTE = /nar[oó]n/i, BOMBEROS = /bomber|bombeir|speis|incendi|fuego|lume|rescat|excarcel|accident|112|emergenc/i;

const dec = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = new RegExp('<' + t + '\\b[^>]*>([\\s\\S]*?)</' + t + '>', 'i').exec(x); return m ? m[1] : ''; };

async function traer(q) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:' + DIAS + 'd') + '&hl=es&gl=ES&ceid=ES:es';
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 7000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 (BombeirosNaron web)', Accept: 'application/rss+xml, application/xml' } });
    if (!r.ok) return [];
    const x = await r.text();
    return (x.match(/<item>[\s\S]*?<\/item>/gi) || []).map(it => {
      const medio = dec(tag(it, 'source'));
      let titulo = dec(tag(it, 'title'));
      if (medio && titulo.endsWith(' - ' + medio)) titulo = titulo.slice(0, -(medio.length + 3));
      const d = new Date(dec(tag(it, 'pubDate')));
      return { titulo, medio, url: dec(tag(it, 'link')), fecha: isNaN(d) ? '' : d.toISOString(), resumen: '' };
    });
  } catch (e) { return []; } finally { clearTimeout(t); }
}

module.exports = async (req, res) => {
  const limite = Date.now() - DIAS * 864e5;
  const listas = await Promise.all(CONSULTAS.map(traer));
  const vistos = new Set(), noticias = [];
  for (const n of listas.flat()) {
    if (!n.titulo || !n.url || !n.fecha || Date.parse(n.fecha) < limite) continue;
    const txt = n.titulo + ' ' + n.medio;
    if (!RELEVANTE.test(txt) || !BOMBEROS.test(txt)) continue;
    const k = n.titulo.toLowerCase().replace(/[^a-z0-9áéíóúñ]/g, '').slice(0, 60);
    if (vistos.has(k)) continue; vistos.add(k); noticias.push(n);
  }
  noticias.sort((a, b) => b.fecha.localeCompare(a.fecha));
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify({ actualizado: new Date().toISOString(), dias: DIAS, noticias: noticias.slice(0, 20) }));
};
