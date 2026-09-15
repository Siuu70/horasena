/*
 * calc.js — Lógica pura de cálculo para el control de horas del contrato SENA.
 *
 * No toca el DOM ni localStorage. Funciona en el navegador (window.Calc)
 * y en Node (require('./calc.js')) para poder probarla con `node --test`.
 *
 * Convenciones:
 *  - Las fechas siempre son cadenas ISO 'YYYY-MM-DD' (sin objetos Date con zona horaria).
 *  - Las horas del día son cadenas 'HH:MM'.
 *  - Día de la semana: 0=domingo, 1=lunes … 6=sábado (igual que Date.getDay()).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Fechas
  // ---------------------------------------------------------------------------
  const DIAS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const DIAS_ES_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function toISO(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  function isValidISO(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }

  function utcOf(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function dayOfWeek(iso) { return utcOf(iso).getUTCDay(); }

  function addDays(iso, n) {
    const t = utcOf(iso);
    t.setUTCDate(t.getUTCDate() + n);
    return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  function diffDays(a, b) { return Math.round((utcOf(b) - utcOf(a)) / 86400000); }

  function minISO(a, b) { return a < b ? a : b; }
  function maxISO(a, b) { return a > b ? a : b; }

  /** Fecha de hoy en la zona horaria indicada (por defecto America/Bogota). */
  function todayISO(timeZone) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZone || 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
    } catch (e) {
      const t = new Date();
      return toISO(t.getFullYear(), t.getMonth() + 1, t.getDate());
    }
  }

  /** 'mar 15/09/2026' */
  function formatDateES(iso, largo) {
    if (!isValidISO(iso)) return iso || '';
    const [y, m, d] = iso.split('-');
    const dow = dayOfWeek(iso);
    return (largo ? DIAS_ES_LARGO[dow] : DIAS_ES[dow]) + ' ' + d + '/' + m + '/' + y;
  }

  /** Lunes de la semana a la que pertenece la fecha. */
  function weekStart(iso) {
    const dow = dayOfWeek(iso);
    return addDays(iso, dow === 0 ? -6 : 1 - dow);
  }

  // ---------------------------------------------------------------------------
  // Horas del día
  // ---------------------------------------------------------------------------
  function isValidTime(t) { return typeof t === 'string' && /^\d{2}:\d{2}$/.test(t) && +t.slice(0, 2) < 24 && +t.slice(3) < 60; }
  function timeToMinutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

  /** Horas decimales entre dos 'HH:MM'. Devuelve 0 si el rango es inválido. */
  function hoursBetween(start, end) {
    if (!isValidTime(start) || !isValidTime(end)) return 0;
    const mins = timeToMinutes(end) - timeToMinutes(start);
    return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  // ---------------------------------------------------------------------------
  // Festivos de Colombia (Ley 51 de 1983, "ley Emiliani")
  // ---------------------------------------------------------------------------
  function easterSunday(y) { // algoritmo de Meeus/Jones/Butcher
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31),
      day = ((h + l - 7 * m + 114) % 31) + 1;
    return toISO(y, month, day);
  }

  function nextMonday(iso) { // si ya es lunes se queda igual
    const dow = dayOfWeek(iso);
    return dow === 1 ? iso : addDays(iso, (8 - dow) % 7);
  }

  /** Lista [{date, name}] de festivos nacionales de Colombia para un año. */
  function colombianHolidays(y) {
    const easter = easterSunday(y);
    const fixed = [
      [1, 1, 'Año Nuevo'], [5, 1, 'Día del Trabajo'], [7, 20, 'Independencia'],
      [8, 7, 'Batalla de Boyacá'], [12, 8, 'Inmaculada Concepción'], [12, 25, 'Navidad'],
    ];
    const emiliani = [ // se trasladan al lunes siguiente
      [1, 6, 'Reyes Magos'], [3, 19, 'San José'], [6, 29, 'San Pedro y San Pablo'],
      [8, 15, 'Asunción de la Virgen'], [10, 12, 'Día de la Raza'], [11, 1, 'Todos los Santos'],
      [11, 11, 'Independencia de Cartagena'],
    ];
    const list = [];
    fixed.forEach(([m, d, name]) => list.push({ date: toISO(y, m, d), name }));
    emiliani.forEach(([m, d, name]) => list.push({ date: nextMonday(toISO(y, m, d)), name }));
    list.push({ date: addDays(easter, -3), name: 'Jueves Santo' });
    list.push({ date: addDays(easter, -2), name: 'Viernes Santo' });
    list.push({ date: nextMonday(addDays(easter, 39)), name: 'Ascensión del Señor' });
    list.push({ date: nextMonday(addDays(easter, 60)), name: 'Corpus Christi' });
    list.push({ date: nextMonday(addDays(easter, 68)), name: 'Sagrado Corazón' });
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------
  const DEFAULT_CONFIG = Object.freeze({
    startDate: '2026-09-14',
    endDate: '2026-09-30',
    totalHours: 104,
    hoursPerDay: 8,
    workDays: [1, 2, 3, 4, 5, 6],   // lunes a sábado (confirmado por el usuario)
    holidays: [],                   // ['YYYY-MM-DD', ...]
    timeZone: 'America/Bogota',
    instructorName: 'RONALDO BALLESTEROS',
    ficha: '3536507',
    defaultStart: '12:00',          // hora de inicio por defecto para "día completo" sin programación
    simulatedToday: '',             // si se llena, la app usa esta fecha como "hoy"
  });

  function normalizeConfig(cfg) {
    const c = Object.assign({}, DEFAULT_CONFIG, cfg || {});
    c.totalHours = Number(c.totalHours) || 0;
    c.hoursPerDay = Number(c.hoursPerDay) || 0;
    c.workDays = Array.isArray(c.workDays) ? c.workDays.map(Number).filter(d => d >= 0 && d <= 6) : DEFAULT_CONFIG.workDays.slice();
    c.holidays = Array.isArray(c.holidays) ? c.holidays.filter(isValidISO) : [];
    return c;
  }

  // ---------------------------------------------------------------------------
  // Días hábiles
  // ---------------------------------------------------------------------------
  function isHoliday(iso, cfg) { return (cfg.holidays || []).indexOf(iso) !== -1; }

  function isBusinessDay(iso, cfg) {
    return cfg.workDays.indexOf(dayOfWeek(iso)) !== -1 && !isHoliday(iso, cfg);
  }

  /** Lista de días hábiles entre start y end, ambos inclusive. Vacía si end < start. */
  function businessDays(start, end, cfg) {
    const out = [];
    if (!isValidISO(start) || !isValidISO(end) || end < start) return out;
    for (let d = start; d <= end; d = addDays(d, 1)) if (isBusinessDay(d, cfg)) out.push(d);
    return out;
  }

  function countBusinessDays(start, end, cfg) { return businessDays(start, end, cfg).length; }

  /** Días hábiles del contrato ya transcurridos, incluyendo hoy. */
  function businessDaysElapsed(cfg, today) {
    if (today < cfg.startDate) return [];
    return businessDays(cfg.startDate, minISO(today, cfg.endDate), cfg);
  }

  /** Días hábiles que quedan, incluyendo hoy (hoy todavía se puede trabajar). */
  function businessDaysRemaining(cfg, today) {
    if (today > cfg.endDate) return [];
    return businessDays(maxISO(today, cfg.startDate), cfg.endDate, cfg);
  }

  /** Horas que deberían estar cumplidas a la fecha: hoursPerDay × días hábiles transcurridos, tope totalHours. */
  function expectedHoursToDate(cfg, today) {
    return Math.min(cfg.totalHours, businessDaysElapsed(cfg, today).length * cfg.hoursPerDay);
  }

  // ---------------------------------------------------------------------------
  // Registros y sesiones
  // ---------------------------------------------------------------------------
  /** Horas de un registro o sesión: usa .hours si existe, si no las calcula de start/end. */
  function hoursOf(item) {
    if (item.hours != null && !isNaN(Number(item.hours))) return Number(item.hours);
    return hoursBetween(item.start, item.end);
  }

  function sumHours(items) { return round1(items.reduce((s, it) => s + hoursOf(it), 0)); }

  function inContract(iso, cfg) { return iso >= cfg.startDate && iso <= cfg.endDate; }

  /** ¿Se cruzan dos intervalos [start,end) del mismo día? */
  function overlaps(a, b) {
    if (a.date !== b.date) return false;
    return timeToMinutes(a.start) < timeToMinutes(b.end) && timeToMinutes(b.start) < timeToMinutes(a.end);
  }

  function groupByDate(items) {
    const map = {};
    items.forEach(it => { (map[it.date] = map[it.date] || []).push(it); });
    return map;
  }

  // ---------------------------------------------------------------------------
  // Resumen del panel
  // ---------------------------------------------------------------------------
  function summarize({ config, entries = [], sessions = [], today }) {
    const cfg = normalizeConfig(config);
    today = today || todayISO(cfg.timeZone);

    const entriesIn = entries.filter(e => inContract(e.date, cfg));
    const sessionsIn = sessions.filter(s => inContract(s.date, cfg));

    const cumplidas = sumHours(entriesIn);
    const faltantes = round1(Math.max(0, cfg.totalHours - cumplidas));
    const programadasTotal = sumHours(sessionsIn);
    const programadasPendientes = sumHours(sessionsIn.filter(s => s.date >= today && s.status !== 'cumplida'));

    const elapsed = businessDaysElapsed(cfg, today);
    const remaining = businessDaysRemaining(cfg, today);
    const esperado = expectedHoursToDate(cfg, today);
    const totalBusinessDays = countBusinessDays(cfg.startDate, cfg.endDate, cfg);
    const promedioNecesario = remaining.length ? round1(faltantes / remaining.length) : null;

    return {
      today,
      cumplidas,
      faltantes,
      programadasTotal,
      programadasPendientes,
      diasHabilesTotales: totalBusinessDays,
      diasHabilesTranscurridos: elapsed.length,
      diasHabilesRestantes: remaining.length,
      promedioNecesario,
      porcentaje: cfg.totalHours ? Math.min(100, round1((cumplidas / cfg.totalHours) * 100)) : 0,
      esperado,
      porcentajeEsperado: cfg.totalHours ? round1((esperado / cfg.totalHours) * 100) : 0,
      diferencia: round1(cumplidas - esperado),
      horasFueraDeContrato: round1(sumHours(entries) - cumplidas),
      estadoContrato: today < cfg.startDate ? 'no_iniciado' : today > cfg.endDate ? 'finalizado' : 'en_curso',
    };
  }


  // ---------------------------------------------------------------------------
  // Calendario mensual
  // ---------------------------------------------------------------------------
  /**
   * Celdas de un mes (year, month 1-12) para pintar un calendario que empieza en lunes.
   * Devuelve {year, month, weeks:[[cell×7]]}; cell = null (relleno) o
   * {date, day, dow, habil, festivo, enContrato, hoy, registradas, programadas, estado}
   * estado: 'registrado' | 'parcial' | 'sin_registro' | 'programado' | 'libre' | 'no_habil' | 'fuera'
   */
  function calendarMonth(year, month, { config, entries = [], sessions = [], today }) {
    const cfg = normalizeConfig(config);
    today = today || todayISO(cfg.timeZone);
    const regPorDia = groupByDate(entries), sesPorDia = groupByDate(sessions);
    const first = toISO(year, month, 1);
    const weeks = [];
    let week = new Array((dayOfWeek(first) + 6) % 7).fill(null);
    for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) {
      const registradas = sumHours(regPorDia[d] || []), programadas = sumHours(sesPorDia[d] || []);
      const habil = isBusinessDay(d, cfg), enContrato = inContract(d, cfg);
      let estado;
      if (!enContrato) estado = 'fuera';
      else if (registradas >= cfg.hoursPerDay) estado = 'registrado';
      else if (registradas > 0) estado = 'parcial';
      else if (!habil) estado = 'no_habil';
      else if (d < today) estado = 'sin_registro';
      else if (programadas > 0) estado = 'programado';
      else estado = 'libre';
      week.push({ date: d, day: +d.slice(8), dow: dayOfWeek(d), habil, festivo: isHoliday(d, cfg), enContrato, hoy: d === today, registradas, programadas, estado });
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }
    return { year, month, weeks };
  }

  // ---------------------------------------------------------------------------
  // Alertas
  // ---------------------------------------------------------------------------
  /**
   * Devuelve [{code, level:'rojo'|'amarillo'|'verde', title, detail}] ordenadas por gravedad.
   */
  function buildAlerts({ config, entries = [], sessions = [], today }) {
    const cfg = normalizeConfig(config);
    today = today || todayISO(cfg.timeZone);
    const s = summarize({ config: cfg, entries, sessions, today });
    const alerts = [];
    const fmt = d => formatDateES(d);
    const sessionsIn = sessions.filter(x => inContract(x.date, cfg));

    // 1. Atraso vs. esperado
    if (s.estadoContrato !== 'no_iniciado' && s.cumplidas < s.esperado) {
      alerts.push({
        code: 'atraso', level: 'rojo', title: 'Atraso frente a lo esperado',
        detail: `Llevas ${s.cumplidas} h y a hoy deberías tener ${s.esperado} h (faltan ${round1(s.esperado - s.cumplidas)} h de ritmo).`,
      });
    }

    // 2. Días hábiles pasados sin registro (antes de hoy)
    const byDate = groupByDate(entries);
    const sinRegistro = businessDaysElapsed(cfg, today).filter(d => d < today && !byDate[d]);
    if (sinRegistro.length) {
      alerts.push({
        code: 'dia_sin_registro', level: 'amarillo', title: 'Días hábiles sin horas registradas',
        detail: sinRegistro.map(fmt).join(', '), dates: sinRegistro,
      });
    }

    // 3. Programación insuficiente
    if (sessionsIn.length && s.programadasTotal < cfg.totalHours) {
      alerts.push({
        code: 'programacion_insuficiente', level: 'amarillo', title: 'La programación no alcanza la meta',
        detail: `Hay ${s.programadasTotal} h programadas dentro del contrato y la meta es ${cfg.totalHours} h (faltan ${round1(cfg.totalHours - s.programadasTotal)} h por programar o registrar como otra actividad).`,
      });
    }
    if (!sessionsIn.length && s.estadoContrato !== 'finalizado') {
      alerts.push({ code: 'sin_programacion', level: 'amarillo', title: 'No hay programación importada', detail: 'Importa el cronograma o un CSV en la pestaña Programación.' });
    }

    // 4. Sobreprogramación total y por día
    if (s.programadasTotal > cfg.totalHours) {
      alerts.push({
        code: 'sobreprogramacion_total', level: 'rojo', title: 'Sobreprogramación del contrato',
        detail: `Hay ${s.programadasTotal} h programadas y el contrato es de ${cfg.totalHours} h.`,
      });
    }
    const sesPorDia = groupByDate(sessionsIn);
    const diasExcedidos = Object.keys(sesPorDia).filter(d => sumHours(sesPorDia[d]) > cfg.hoursPerDay).sort();
    if (diasExcedidos.length) {
      alerts.push({
        code: 'sobreprogramacion_dia', level: 'rojo', title: `Más de ${cfg.hoursPerDay} h programadas en un día`,
        detail: diasExcedidos.map(d => `${fmt(d)} (${sumHours(sesPorDia[d])} h)`).join(', '), dates: diasExcedidos,
      });
    }
    const regPorDia = groupByDate(entries.filter(e => inContract(e.date, cfg)));
    const diasRegExcedidos = Object.keys(regPorDia).filter(d => sumHours(regPorDia[d]) > cfg.hoursPerDay).sort();
    if (diasRegExcedidos.length) {
      alerts.push({
        code: 'registro_excede_dia', level: 'amarillo', title: `Más de ${cfg.hoursPerDay} h registradas en un día`,
        detail: diasRegExcedidos.map(d => `${fmt(d)} (${sumHours(regPorDia[d])} h)`).join(', '), dates: diasRegExcedidos,
      });
    }

    // 5. Cruce de horarios entre sesiones programadas
    const cruces = [];
    Object.keys(sesPorDia).forEach(d => {
      const list = sesPorDia[d];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        if (overlaps(list[i], list[j])) cruces.push(`${fmt(d)} ${list[i].start}-${list[i].end} ↔ ${list[j].start}-${list[j].end}`);
      }
    });
    if (cruces.length) {
      alerts.push({ code: 'cruce_horarios', level: 'rojo', title: 'Cruce de horarios en la programación', detail: cruces.join('; ') });
    }

    // 6. Sesión en día no hábil (fin de semana según configuración, o festivo)
    const noHabiles = sessionsIn.filter(x => !isBusinessDay(x.date, cfg)).map(x => x.date);
    const noHabilesUnicos = noHabiles.filter((d, i) => noHabiles.indexOf(d) === i).sort();
    if (noHabilesUnicos.length) {
      alerts.push({
        code: 'sesion_no_habil', level: 'amarillo', title: 'Sesiones programadas en día no hábil o festivo',
        detail: noHabilesUnicos.map(d => fmt(d) + (isHoliday(d, cfg) ? ' (festivo)' : '')).join(', '), dates: noHabilesUnicos,
      });
    }

    // 7. Fin de contrato cercano con horas pendientes
    if (s.estadoContrato === 'en_curso' && s.faltantes > 0 && s.diasHabilesRestantes <= 3) {
      alerts.push({
        code: 'fin_cercano', level: 'rojo', title: 'Fin de contrato cercano',
        detail: `Quedan ${s.diasHabilesRestantes} día(s) hábil(es) y faltan ${s.faltantes} h.`,
      });
    }

    // 8. Ritmo necesario superior a las horas por día
    if (s.estadoContrato === 'en_curso' && s.promedioNecesario != null && s.promedioNecesario > cfg.hoursPerDay) {
      alerts.push({
        code: 'ritmo_superior', level: 'rojo', title: 'Ya no alcanza con el ritmo normal',
        detail: `Necesitas ${s.promedioNecesario} h por día hábil y el máximo es ${cfg.hoursPerDay} h.`,
      });
    }
    if (s.estadoContrato === 'finalizado' && s.faltantes > 0) {
      alerts.push({ code: 'contrato_incompleto', level: 'rojo', title: 'Contrato finalizado sin completar horas', detail: `Faltaron ${s.faltantes} h.` });
    }

    // Verde
    if (s.faltantes <= 0) {
      alerts.push({ code: 'meta_cumplida', level: 'verde', title: 'Meta cumplida', detail: `Registraste ${s.cumplidas} h de ${cfg.totalHours} h.` });
    } else if (s.estadoContrato === 'en_curso' && s.cumplidas >= s.esperado) {
      alerts.push({ code: 'al_dia', level: 'verde', title: 'Vas al día', detail: `Llevas ${s.cumplidas} h; lo esperado a hoy es ${s.esperado} h.` });
    } else if (s.estadoContrato === 'no_iniciado') {
      alerts.push({ code: 'no_iniciado', level: 'verde', title: 'El contrato aún no inicia', detail: `Inicia el ${fmt(cfg.startDate)}.` });
    }

    const orden = { rojo: 0, amarillo: 1, verde: 2 };
    return alerts.sort((a, b) => orden[a.level] - orden[b.level]);
  }

  // ---------------------------------------------------------------------------
  // Importación: CSV
  // ---------------------------------------------------------------------------
  /** Convierte 'DD/MM/YYYY', 'YYYY-MM-DD', número serial de Excel o Date a ISO. */
  function cellToISO(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      return toISO(v.getFullYear(), v.getMonth() + 1, v.getDate()); // SheetJS crea Dates en hora local
    }
    if (typeof v === 'number') {
      if (v < 20000 || v > 80000) return null; // fuera de rango razonable (evita fichas como 3536507)
      const t = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    }
    const s = String(v).trim();
    if (isValidISO(s)) return s;
    let m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) { const iso = toISO(+m[3], +m[2], +m[1]); return isValidISO(iso) ? iso : null; }
    m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (m) { const iso = toISO(+m[1], +m[2], +m[3]); return isValidISO(iso) ? iso : null; }
    return null;
  }

  function normalizeTime(v) {
    if (v == null) return null;
    if (v instanceof Date) return pad(v.getHours()) + ':' + pad(v.getMinutes());
    if (typeof v === 'number' && v >= 0 && v < 1) { const mins = Math.round(v * 24 * 60); return pad(Math.floor(mins / 60)) + ':' + pad(mins % 60); }
    const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
    return m ? pad(+m[1]) + ':' + m[2] : null;
  }

  function splitCSVLine(line, sep) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim());
  }

  const CSV_ALIASES = {
    date: ['fecha', 'date', 'dia', 'día'],
    start: ['hora_inicio', 'inicio', 'hora inicio', 'start', 'desde'],
    end: ['hora_fin', 'fin', 'hora fin', 'end', 'hasta'],
    ficha: ['ficha', 'grupo'],
    competencia: ['competencia', 'competency', 'programa'],
    rap: ['rap', 'resultado', 'resultado_aprendizaje', 'resultado de aprendizaje', 'nota'],
    activity: ['actividad', 'activity', 'tipo'],
    ambiente: ['ambiente', 'aula', 'lugar'],
  };

  /**
   * Lee un CSV con encabezados (fecha, hora_inicio, hora_fin, ficha, competencia, rap, actividad, ambiente).
   * Separador ',' o ';'. Devuelve {sessions, errors}.
   */
  function parseCSV(text, opts) {
    opts = opts || {};
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
    if (!lines.length) return { sessions: [], errors: ['Archivo vacío'] };
    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    const header = splitCSVLine(lines[0], sep).map(h => h.toLowerCase().replace(/^"|"$/g, ''));
    const idx = {};
    Object.keys(CSV_ALIASES).forEach(k => { idx[k] = header.findIndex(h => CSV_ALIASES[k].indexOf(h) !== -1); });
    const errors = [];
    if (idx.date < 0) errors.push('No se encontró la columna "fecha"');
    if (idx.start < 0 || idx.end < 0) errors.push('Faltan las columnas "hora_inicio" / "hora_fin"');
    if (errors.length) return { sessions: [], errors };
    const sessions = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i], sep);
      const get = k => (idx[k] >= 0 ? cols[idx[k]] : '') || '';
      const date = cellToISO(get('date')), start = normalizeTime(get('start')), end = normalizeTime(get('end'));
      if (!date || !start || !end) { errors.push(`Línea ${i + 1}: fecha u hora inválida`); continue; }
      if (hoursBetween(start, end) <= 0) { errors.push(`Línea ${i + 1}: la hora fin debe ser mayor a la de inicio`); continue; }
      sessions.push(makeSession({
        date, start, end, ficha: get('ficha') || opts.ficha || '', competencia: get('competencia'),
        rap: get('rap'), activity: /otra/i.test(get('activity')) ? 'otra' : 'formacion', ambiente: get('ambiente'),
      }));
    }
    return { sessions, errors };
  }

  function makeSession(s) {
    return Object.assign({ id: uid(), status: 'pendiente', activity: 'formacion', ficha: '', competencia: '', rap: '', ambiente: '' }, s, { hours: hoursBetween(s.start, s.end) });
  }

  // ---------------------------------------------------------------------------
  // Importación: cuadrícula del cronograma SENA ("PROGRAMADOR SESIONES FORMATIVAS")
  // ---------------------------------------------------------------------------
  const TIME_LABEL = /^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/;

  /**
   * grid: matriz [fila][columna] con las celdas combinadas ya rellenadas con su valor ancla.
   * Estructura esperada: columna 0 con etiquetas 'HH:MM - HH:MM'; filas cabecera con fechas
   * (Date, serial o texto) encima de cada bloque de franjas; celdas 'NOMBRE - Competencia / nota'.
   * Devuelve las sesiones del instructor, fusionando franjas consecutivas del mismo día y texto.
   */
  function parseCronogramaGrid(grid, instructorName, opts) {
    opts = opts || {};
    const name = String(instructorName || '').trim().toLowerCase();
    if (!name) return { sessions: [], errors: ['Indica el nombre del instructor tal como aparece en el cronograma'] };
    const slots = []; // {date, start, end, text}
    const dateAbove = []; // por columna: última fecha vista
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r] || [];
      const label = typeof row[0] === 'string' ? row[0].match(TIME_LABEL) : null;
      for (let c = 1; c < row.length; c++) {
        const v = row[c];
        const iso = cellToISO(v);
        if (iso && !(typeof v === 'string' && /[a-záéíóú]/i.test(v))) { dateAbove[c] = iso; continue; }
        if (label && typeof v === 'string' && v.toLowerCase().indexOf(name) !== -1 && dateAbove[c]) {
          slots.push({ date: dateAbove[c], start: normalizeTime(label[1]), end: normalizeTime(label[2]), text: v.trim() });
        }
      }
    }
    slots.sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.start) - timeToMinutes(b.start));
    const sessions = [];
    let cur = null;
    slots.forEach(sl => {
      if (cur && cur.date === sl.date && cur.text === sl.text && cur.end === sl.start) { cur.end = sl.end; return; }
      cur = { date: sl.date, start: sl.start, end: sl.end, text: sl.text };
      sessions.push(cur);
    });
    const out = sessions.map(s => {
      const parsed = parseCellText(s.text);
      return makeSession({ date: s.date, start: s.start, end: s.end, ficha: opts.ficha || '', competencia: parsed.competencia, rap: parsed.rap, ambiente: '' });
    });
    return { sessions: out, errors: out.length ? [] : ['No se encontraron sesiones para "' + instructorName + '"'] };
  }

  /** 'NOMBRE - Competencia / nota' → {competencia, rap} */
  function parseCellText(text) {
    let rest = String(text || '');
    const i = rest.indexOf(' - ');
    if (i >= 0) rest = rest.slice(i + 3);
    const j = rest.indexOf(' / ');
    if (j >= 0) return { competencia: rest.slice(0, j).trim(), rap: rest.slice(j + 3).trim() };
    return { competencia: rest.trim(), rap: '' };
  }

  /** Rellena en una matriz los rangos combinados [{s:{r,c}, e:{r,c}}] (formato SheetJS). */
  function fillMerges(grid, merges) {
    (merges || []).forEach(m => {
      const v = (grid[m.s.r] || [])[m.s.c];
      for (let r = m.s.r; r <= m.e.r; r++) {
        grid[r] = grid[r] || [];
        for (let c = m.s.c; c <= m.e.c; c++) if (grid[r][c] == null) grid[r][c] = v;
      }
    });
    return grid;
  }

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /** Crea un registro de horas a partir de una sesión programada (o de un día completo por defecto). */
  function entryFromSession(session, cfg) {
    cfg = normalizeConfig(cfg);
    if (session) {
      return { id: uid(), date: session.date, start: session.start, end: session.end, ficha: session.ficha || cfg.ficha, activity: session.activity || 'formacion', obs: session.competencia ? 'Según programación: ' + session.competencia + (session.rap ? ' / ' + session.rap : '') : '', sessionId: session.id };
    }
    return null;
  }

  function fullDayEntry(date, cfg) {
    cfg = normalizeConfig(cfg);
    const startMin = timeToMinutes(cfg.defaultStart || '12:00');
    const endMin = Math.min(24 * 60 - 1, startMin + cfg.hoursPerDay * 60);
    return { id: uid(), date, start: pad(Math.floor(startMin / 60)) + ':' + pad(startMin % 60), end: pad(Math.floor(endMin / 60)) + ':' + pad(endMin % 60), ficha: cfg.ficha, activity: 'formacion', obs: 'Día completo (' + cfg.hoursPerDay + ' h)' };
  }

  function validateEntry(e) {
    const errors = [];
    if (!isValidISO(e.date)) errors.push('Fecha inválida');
    if (!isValidTime(e.start) || !isValidTime(e.end)) errors.push('Hora inválida (formato HH:MM)');
    else if (hoursBetween(e.start, e.end) <= 0) errors.push('La hora fin debe ser mayor que la hora inicio');
    return errors;
  }

  return {
    DEFAULT_CONFIG, DIAS_ES, DIAS_ES_LARGO,
    isValidISO, isValidTime, dayOfWeek, addDays, diffDays, todayISO, formatDateES, weekStart,
    timeToMinutes, hoursBetween, hoursOf, sumHours, round1,
    easterSunday, nextMonday, colombianHolidays,
    normalizeConfig, isHoliday, isBusinessDay, businessDays, countBusinessDays,
    businessDaysElapsed, businessDaysRemaining, expectedHoursToDate,
    inContract, overlaps, groupByDate, summarize, buildAlerts, calendarMonth,
    cellToISO, normalizeTime, parseCSV, parseCronogramaGrid, parseCellText, fillMerges, makeSession,
    uid, entryFromSession, fullDayEntry, validateEntry,
  };
});
