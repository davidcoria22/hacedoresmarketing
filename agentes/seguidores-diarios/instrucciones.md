# Instrucciones del agente: Seguidores diarios

Léelo completo antes de ejecutar. Este agente solo registra datos: no publica, no escribe en redes y no borra nada.

## Pasos en cada ejecución (9:00 am)

1. Leer `config.md` para obtener la lista de redes, la hoja de destino y la fuente de datos.
2. Obtener el total de seguidores de cada red a la fecha de hoy.
3. Calcular el delta: seguidores de hoy menos seguidores del día anterior, por red.
4. Revisar que los valores sean números enteros y que la fecha corresponda a hoy. Si algún dato falla, dejar esa celda vacía y anotarlo en el registro. No inventar valores.
5. Agregar una fila nueva en la hoja de destino con: Fecha, Twitter, Tw Delta, Instagram, Ins Delta, Facebook, FB Delta, YouTube, YT Delta, TikTok, TT Delta.
6. Escribir en `registro.csv` una línea con la fecha, el resultado (OK o ERROR) y cualquier nota.
7. Si hubo errores en alguna red, avisar al responsable antes de dar la ejecución por terminada.

## Reglas

- **X (Twitter):** no se lee automáticamente. En la columna de X escribe una celda vacía y en `registro.csv` pon "X pendiente manual". Nunca escribas valores inventados, aleatorios ni estimados en la hoja.
- Si una red no responde, deja su celda vacía y anótalo en el registro.
- Solo escribir en la hoja de destino y en `registro.csv`.
- No duplicar una fecha que ya existe en la hoja; si ya hay una fila de hoy, detenerse y avisar.
- Nunca guardar contraseñas, tokens ni claves en estos archivos.
- Cualquier cambio a este procedimiento requiere aprobación de David.
