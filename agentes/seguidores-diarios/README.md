# Agente de Seguidores Hacedores

Registra cada día los seguidores ganados en cada red social de Hacedores.

- **Redes:** Twitter (X), Instagram, Facebook, YouTube, TikTok
- **Frecuencia:** todos los días a las 9:00 am (hora de Ciudad de México)
- **Destino:** hoja de cálculo "Seguidores en Redes Sociales Hacedores y Maker Faire CDMX"
  (https://docs.google.com/spreadsheets/d/1mdIvmGRBiPWNzEM7ISccsalhKAmEdCbSnl5T1XkjgR4/edit)

## Archivos de esta carpeta

- `instrucciones.md`: pasos que sigue el agente en cada ejecución.
- `config.md`: datos de configuración (redes, hoja, horario, estado de accesos). No guarda contraseñas ni tokens.
- `registro.csv`: bitácora de cada ejecución (fecha, resultado, errores).

## Estado

Borrador. Pendiente de definir:
1. Cómo se obtienen los seguidores (ver `config.md`, sección "Fuente de datos").
2. Quién da acceso a cada red y dónde se guardan las credenciales.
3. Si la tarea se programa como tarea automática y en qué herramienta.
