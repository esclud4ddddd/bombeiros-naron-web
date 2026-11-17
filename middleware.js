// Protege /personal con usuario y contraseña (variables PERSONAL_USUARIO y PERSONAL_CLAVE en Vercel).
// Sin esas variables configuradas, nadie puede entrar.
export const config = { matcher: ['/personal', '/personal/:path*'] };

export default function middleware(request) {
  const usuario = process.env.PERSONAL_USUARIO, clave = process.env.PERSONAL_CLAVE;
  const auth = request.headers.get('authorization') || '';
  if (usuario && clave && auth.startsWith('Basic ')) {
    try {
      const [u, ...resto] = atob(auth.slice(6)).split(':');
      if (u === usuario && resto.join(':') === clave) {
        return new Response(null, { headers: { 'x-middleware-next': '1' } });
      }
    } catch (e) {}
  }
  return new Response('Acceso restringido al personal de Bombeiros Narón.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Personal Bombeiros Naron", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
