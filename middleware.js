// Protege /personal (variables en Vercel):
//   PERSONAL_USUARIO y PERSONAL_CLAVE -> usuario y contraseña del personal.
//   PERSONAL_LLAVE (opcional) -> acceso libre del administrador: abrir una vez /personal?llave=VALOR
//   en cada dispositivo deja ese navegador con acceso sin contraseña durante un año.
// Sin variables configuradas, nadie puede entrar.
export const config = { matcher: ['/personal', '/personal/:path*'] };

// ACCESO ABIERTO por ahora (lo pidió el administrador). Para volver a pedir usuario y contraseña,
// cambia ABIERTO a false y vuelve a publicar.
const ABIERTO = true;
const COOKIE = 'bn_admin';
const seguir = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

export default function middleware(request) {
  if (ABIERTO) return seguir();
  const usuario = process.env.PERSONAL_USUARIO, clave = process.env.PERSONAL_CLAVE, llave = process.env.PERSONAL_LLAVE;
  const url = new URL(request.url);

  if (llave) {
    // 1) enlace de administrador: guarda la llave en una cookie y limpia la dirección
    if (url.searchParams.get('llave') === llave) {
      return new Response(null, { status: 302, headers: {
        'Location': url.pathname,
        'Set-Cookie': `${COOKIE}=${encodeURIComponent(llave)}; Path=/personal; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
      } });
    }
    // 2) navegador del administrador ya reconocido
    const galletas = Object.fromEntries((request.headers.get('cookie') || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, v.join('=')]));
    if (galletas[COOKIE] && decodeURIComponent(galletas[COOKIE]) === llave) return seguir();
  }

  // 3) resto del personal: usuario y contraseña
  const auth = request.headers.get('authorization') || '';
  if (usuario && clave && auth.startsWith('Basic ')) {
    try {
      const [u, ...resto] = atob(auth.slice(6)).split(':');
      if (u === usuario && resto.join(':') === clave) return seguir();
    } catch (e) {}
  }
  return new Response('Acceso restringido al personal de Bombeiros Narón.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Personal Bombeiros Naron", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
