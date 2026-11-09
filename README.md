# Panel de agentes · Hacedores

Panel con una oficina 3D, gráfica de seguidores, último post por red con sus comentarios y chat con los agentes. El chat funciona **sin IA** (modo local, con respuestas basadas en los datos).

## Correr en tu computadora
```bash
cd app-agentes
node server.js
```
Abre http://localhost:3000. No necesita instalar nada (solo Node.js 18+).

Para conectar tus datos, crea `agentes/seguidores-diarios/credenciales.env` (no se sube a GitHub) con:
`YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN`, `INSTAGRAM_USER_ID`
y el archivo `agentes/seguidores-diarios/google-service-account.json` de tu cuenta de servicio de Google.

## Publicar en Vercel (solo lectura, sin IA)
Importa el repositorio en Vercel y define estas variables de entorno: las de arriba más `GOOGLE_SERVICE_ACCOUNT_JSON` (el contenido completo del JSON).
En línea el panel es de **solo lectura**: no escribe en la hoja, no permite cambiar ajustes y no usa la clave de IA.

> Nunca subas llaves, tokens ni el JSON de Google al repositorio.
