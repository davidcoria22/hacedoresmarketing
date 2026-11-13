# Acceso con cuenta de Google

El panel en línea pide entrar con Google. El acceso se activa solo cuando existen estas variables en Vercel
(Settings → Environment Variables). Mientras no existan, el sitio funciona como antes.

| Variable | Qué es |
|---|---|
| `GOOGLE_CLIENT_ID` | ID de cliente OAuth (Google Cloud → APIs y servicios → Credenciales) |
| `GOOGLE_CLIENT_SECRET` | Secreto de ese cliente |
| `AUTH_EMAILS` | Cuentas que pueden entrar, separadas por comas |
| `AUTH_DOMINIOS` | (opcional) dominios completos que pueden entrar, por ejemplo `hacedores.com` |
| `AUTH_SECRET` | (opcional) texto largo al azar para firmar la sesión |

Si no hay ninguna cuenta ni dominio autorizado, nadie puede entrar.

## Crear el cliente en Google Cloud
1. APIs y servicios → **Pantalla de consentimiento de OAuth**: tipo *Interno* si usan Google Workspace; si no, *Externo* y publícala (basta con los permisos básicos: correo, perfil y openid).
2. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
3. En **URI de redireccionamiento autorizados** agrega exactamente: `https://hacedoresmarketing.vercel.app/api/auth/callback`
   (si algún día usan otro dominio, agrega también `https://ESE-DOMINIO/api/auth/callback`).
4. Copia el ID y el secreto a las variables de Vercel y haz **Redeploy**.

## Qué se protege
Todo lo que está bajo `/api` (seguidores, agentes, publicaciones, mensajes, respuestas). Quedan abiertos, con su propia clave,
los avisos de WhatsApp y Meta y el reloj de envíos (`/api/whatsapp`, `/api/meta`, `/api/whatsapp-pendientes`).
La sesión dura 7 días y se cierra con el botón **Salir**.
