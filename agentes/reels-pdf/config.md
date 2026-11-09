# Configuración: Agente de Reels y PDF

- **Modo:** PRUEBA (no envía nada). Cambiar a ENVÍO solo cuando la app tenga Acceso Avanzado y el usuario lo confirme.
- **Cuenta de Instagram:** hacedorescom (ID en `credenciales.env`, variable INSTAGRAM_USER_ID).
- **Reel:** PENDIENTE (ID del reel o enlace).
- **Palabra clave:** PENDIENTE (por ejemplo "PDF").
- **Enlace del PDF:** PENDIENTE.
- **Respuesta pública (paso 2):** "¡Te escribimos por privado! 📩"
- **Mensaje privado (paso 3):** PENDIENTE de redactar. Debe pedir que siga la cuenta y responda "listo".
- **Mensaje con el PDF (paso 5):** PENDIENTE de redactar. Debe incluir el enlace.
- **Horario de revisión:** PENDIENTE (cada cuántos minutos revisar comentarios).

## Seguimiento
Pendiente de decisión. Opciones:
- Verificar con la API si la persona sigue la cuenta (confirmar primero en la documentación de Meta el campo exacto que lo indica).
- Confiar en su respuesta "listo" y no verificar.

## Límites conocidos
- Respuesta privada: solo una por comentario y dentro de los 7 días.
- Mensajes siguientes: solo dentro de las 24 horas posteriores a la respuesta de la persona.
- Si la persona no sigue la cuenta, la respuesta puede llegar a la carpeta de solicitudes en vez de a la bandeja principal.
