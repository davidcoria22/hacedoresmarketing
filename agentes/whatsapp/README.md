# Agente WhatsApp (campaña)
Responde con `mensaje.txt` a quien llega por el anuncio (Click-to-WhatsApp), **5 minutos después** de su primer mensaje.
- Solo contesta mensajes que traen `referral` (el primero de cada chat que viene del anuncio): no repite ni responde a chats normales.
- Webhook: `/api/whatsapp` (código en `app-agentes/whatsapp.js`). Anota cada mensaje en la pestaña "Mensajes" de la hoja.
- El envío diferido se guarda en la pestaña "Pendientes". Un reloj externo (cron-job.org) llama cada minuto a `/api/whatsapp-pendientes` con la cabecera `x-cron-key`.
- Sin `WHATSAPP_CRON_SECRET` contesta al instante. `WHATSAPP_RETRASO_MIN` cambia los minutos (0 = al instante).
- Variables en Vercel: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_CRON_SECRET, PANEL_PASSWORD.
- Para cambiar el texto, edita `mensaje.txt` y sube el cambio.
