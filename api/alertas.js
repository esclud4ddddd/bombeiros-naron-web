// Alertas meteorológicas activas para Narón (avisos por concello de MeteoGalicia,
// los mismos niveles amarillo/naranja/rojo que difunde el 112 Galicia).
// Responde {actualizado, fuente, galicia (nivel máximo en Galicia 0-3), alertas (Narón):[{nivel,tipo_es,tipo_gl,ini,fin}]}. Si la fuente falla, alertas:[].
const FUENTE = 'https://servizos.meteogalicia.gal/mgrss/predicion/adversos/jsonAvisosConcellos.action?dia=-1';
const ID_NARON = 15054;

const ahoraMadrid = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
}).format(new Date()).replace(' ', 'T');
const norm = s => { const m = /(\d{4})-?(\d{2})-?(\d{2})T(\d{2}):(\d{2})/.exec(String(s || '')); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : ''; };

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
  const ahora = ahoraMadrid();
  try {
    const r = await fetch(FUENTE, { headers: { 'User-Agent': 'BombeirosNaron-web', 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const lista = Array.isArray(j.listaAvisosConcellos) ? j.listaAvisosConcellos : [];
    // nivel más alto activo en toda Galicia (lo que muestra la barra del 112)
    const galicia = lista.reduce((m, a) => { const f = norm(a.dataFin); return (+a.idNivel >= 1 && (!f || f >= ahora)) ? Math.max(m, Math.min(3, +a.idNivel)) : m; }, 0);
    const vistos = new Set();
    const alertas = lista
      .filter(a => (+a.idconcello === ID_NARON || /^nar[oó]n$/i.test(String(a.nomeConcello || '').trim())) && +a.idNivel >= 1)
      .map(a => ({ nivel: Math.min(3, +a.idNivel), tipo_es: a.tipoalerta_es || '', tipo_gl: a.tipoalerta_gl || '', ini: norm(a.dataIni), fin: norm(a.dataFin) }))
      .filter(a => !a.fin || a.fin >= ahora)
      .filter(a => { const k = [a.nivel, a.tipo_es, a.ini, a.fin].join('|'); if (vistos.has(k)) return false; vistos.add(k); return true; })
      .sort((a, b) => b.nivel - a.nivel || a.ini.localeCompare(b.ini));
    res.status(200).send(JSON.stringify({ actualizado: ahora, fuente: 'MeteoGalicia', galicia, alertas }));
  } catch (e) {
    res.status(200).send(JSON.stringify({ actualizado: ahora, fuente: 'MeteoGalicia', galicia: 0, alertas: [], error: 'Fuente no disponible' }));
  }
};
