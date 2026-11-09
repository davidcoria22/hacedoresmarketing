# Agente: Publicaciones y comentarios

Muestra en el panel el último post de cada red (Instagram, Facebook, TikTok y X) junto con sus comentarios.

- **Instagram y Facebook:** se leen solos con la API de Meta cada vez que tocas el icono (se guardan 5 minutos para no gastar consultas).
- **Comentarios de Facebook:** requieren el permiso `pages_read_user_content` en el token. Si falta, el panel lo avisa.
- **TikTok y X:** no tienen lectura automática. Su último post y comentarios se toman de `ultimos-posts.json` (se llena a mano o con una captura desde el navegador).
- Solo lee; nunca publica, responde ni borra nada.
