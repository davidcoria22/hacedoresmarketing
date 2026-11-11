# Agente WhatsApp (campaña)
Responde con `mensaje.txt` cuando alguien llega por el anuncio (Click-to-WhatsApp).
- Solo contesta mensajes que traen `referral` (el primero de cada chat que viene del anuncio), así que no repite ni responde a chats normales.
- Webhook: `/api/whatsapp` (código en `app-agentes/whatsapp.js`).
- Variables en Vercel: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET.
- Para cambiar el texto, edita `mensaje.txt` y sube el cambio.
