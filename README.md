# Control de horas — Contrato SENA (ficha 3536507)

Aplicación de una sola página para controlar el cumplimiento de las horas del contrato
y la programación de la ficha. Sin dependencias ni instalación: HTML + CSS + JavaScript puro.

## Cómo ejecutarla

**Opción 1 (la más simple):** doble clic en `index.html`. Se abre en el navegador y funciona.

**Opción 2 (recomendada si vas a importar el `.xlsx`):** servir la carpeta con un servidor local,
porque algunos navegadores restringen la lectura de archivos desde `file://`:

```bash
cd "control-horas"
python3 -m http.server 8000
# abrir http://localhost:8000
```

Los datos se guardan en el `localStorage` del navegador. Usa **Configuración → Exportar respaldo JSON**
antes de cambiar de equipo o limpiar el navegador.

## Cómo correr las pruebas

Requiere Node.js 18 o superior (aquí se probó con la v22):

```bash
cd "control-horas"
node --test
```

Ejecuta las 32 pruebas de `calc.test.js` (días hábiles, horas esperadas, alertas, importación CSV,
importación del cronograma real guardado en `test-fixtures/cronograma_grid.json`).

## Uso rápido

1. **Configuración**: verifica fechas del contrato (14/09/2026 → 30/09/2026), 104 h, 8 h/día,
   días hábiles y festivos. El botón *Agregar festivos de Colombia del año* calcula los festivos
   con la ley Emiliani (Semana Santa incluida). El campo *Simular "hoy"* sirve para probar escenarios.
2. **Programación**: la primera vez la app carga sola tus 47 sesiones del cronograma; si las borras, puedes volver con *Cargar programación incluida* (las 47 sesiones de RONALDO BALLESTEROS
   extraídas del cronograma `(12)` del 22/09/2026), o importa el `.xlsx` del cronograma (se filtra por
   el nombre configurado). Al importar con *Reemplazar* se sustituye todo el cronograma (todos los meses); si marcas
   *Solo fechas dentro del contrato* (desmarcado por defecto) solo se sustituye el contrato y se conservan los demás meses y las sesiones que coinciden en
   fecha y horario mantienen su estado (cumplida / parcial) y sus registros o un CSV con columnas `fecha, hora_inicio, hora_fin, ficha, competencia, rap, actividad`.
   Marca cada sesión como cumplida / parcial / no cumplida; *Registrar N h* crea el registro de horas
   directamente desde la sesión.
   **Formaciones complementarias**: además de la ficha principal (Configuración → *Ficha principal*), la app maneja
   las fichas complementarias donde aparece tu nombre. Ya vienen incluidas las de `3626326` (Mantenimiento de equipos
   de aire acondicionado y refrigeración, 6 sesiones) y `3622710` (Operaciones comerciales, 2 sesiones); si ya tenías datos,
   el calendario y la pestaña Programación muestran el botón *Agregar formaciones complementarias*. Para una nueva,
   importa su `.xlsx` (puedes elegir varios a la vez): la ficha se toma del nombre del archivo, solo se toman las franjas
   con tu nombre y cada archivo solo reemplaza las sesiones de su ficha. En el calendario se marcan con ◆ y color morado;
   en Programación hay filtro por ficha y total de horas por ficha. Todas cuentan para las horas del contrato.
3. **Registro**: anota las horas por día (fecha, inicio, fin, ficha, actividad, observaciones), edítalas
   o elimínalas. *Marcar día completo* registra las sesiones programadas de ese día (o 8 h desde la
   hora de inicio por defecto si no hay programación).
4. **Panel**: horas cumplidas / faltantes / esperadas a hoy, programadas, días hábiles restantes,
   promedio necesario, barras de avance real vs. esperado, un calendario mensual (colores por estado del día,
   cada sesión programada con su horario y competencia, ✓ horas registradas; tocar un día abre el registro con esa fecha) y las alertas (rojo / amarillo / verde).
   Todo se recalcula al guardar, editar o importar.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | Interfaz (4 pestañas: Panel, Registro, Programación, Configuración) |
| `styles.css` | Estilos, adaptables a celular |
| `calc.js` | Toda la lógica de cálculo, pura (sin DOM): días hábiles, horas esperadas, resumen, alertas, festivos, parseo CSV y del cronograma. Funciona en navegador y en Node |
| `calc.test.js` | Pruebas unitarias (`node --test`) |
| `app.js` | Estado, `localStorage`, render y eventos de la interfaz |
| `programacion_3536507.js` | Programación precargada extraída del cronograma (12) |
| `programacion_complementarias.js` | Sesiones precargadas de las formaciones complementarias (3626326 y 3622710) |
| `version.sh`, `version.json` | Versión de los archivos para que el navegador no use copias viejas |
| `test-fixtures/cronograma_grid.json` | Cuadrícula del cronograma real usada por las pruebas |

La única dependencia externa es SheetJS (CDN) para leer `.xlsx`; si no hay internet, el resto de la app
funciona igual (CSV y programación incluida no la necesitan).

## Actualización automática (GitHub Pages)

Cada commit pone una versión nueva (fecha y hora) en `index.html` y `version.json` mediante `version.sh`,
que corre solo gracias al hook `pre-commit`. Al abrir la página, se consulta `version.json` sin caché: si hay una
versión más nueva que la guardada por el navegador, la página se recarga sola y los archivos `?v=…` se descargan
de nuevo. En un equipo nuevo, después de clonar, instala el hook una vez con `sh version.sh --install`.

## Nota sobre los días hábiles

El cronograma (12) programa sesiones también los sábados (p. ej. 26/09/2026), por eso la configuración
por defecto cuenta lunes a sábado (15 días hábiles en el contrato; el esperado se limita a 104 h).
Si tu contrato se mide solo de lunes a viernes (13 días × 8 h = 104 h), desmarca *Sábado* en
Configuración → Días hábiles; ambos escenarios están cubiertos por las pruebas.
