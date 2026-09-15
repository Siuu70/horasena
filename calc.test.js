// Pruebas unitarias de calc.js — ejecutar con:  node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./calc.js');

const CFG_LV = { startDate: '2026-09-14', endDate: '2026-09-30', totalHours: 104, hoursPerDay: 8, workDays: [1, 2, 3, 4, 5], holidays: [] };
const CFG_LS = Object.assign({}, CFG_LV, { workDays: [1, 2, 3, 4, 5, 6] });

// ---------------------------------------------------------------------------
test('fechas: día de la semana, sumar días, formato', () => {
  assert.equal(C.dayOfWeek('2026-09-14'), 1); // lunes
  assert.equal(C.dayOfWeek('2026-09-26'), 6); // sábado
  assert.equal(C.addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(C.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(C.diffDays('2026-09-14', '2026-09-30'), 16);
  assert.equal(C.formatDateES('2026-09-15'), 'mar 15/09/2026');
  assert.equal(C.weekStart('2026-09-20'), '2026-09-14'); // domingo → lunes anterior
  assert.equal(C.weekStart('2026-09-14'), '2026-09-14');
  assert.ok(C.isValidISO('2026-02-28'));
  assert.ok(!C.isValidISO('2026-02-30'));
  assert.ok(!C.isValidISO('15/09/2026'));
});

test('horas entre dos horas del día', () => {
  assert.equal(C.hoursBetween('12:00', '20:00'), 8);
  assert.equal(C.hoursBetween('08:30', '10:00'), 1.5);
  assert.equal(C.hoursBetween('10:00', '08:00'), 0);
  assert.equal(C.hoursBetween('x', '08:00'), 0);
  assert.equal(C.sumHours([{ start: '12:00', end: '16:00' }, { hours: 3.5 }]), 7.5);
});

// ---------------------------------------------------------------------------
test('días hábiles L-V: el contrato tiene 13 días y 104 h esperadas', () => {
  const dias = C.businessDays('2026-09-14', '2026-09-30', C.normalizeConfig(CFG_LV));
  assert.equal(dias.length, 13);
  assert.equal(dias[0], '2026-09-14');
  assert.equal(dias[dias.length - 1], '2026-09-30');
  assert.ok(!dias.includes('2026-09-19') && !dias.includes('2026-09-26'));
  assert.equal(C.expectedHoursToDate(C.normalizeConfig(CFG_LV), '2026-09-30'), 104);
  assert.equal(C.expectedHoursToDate(C.normalizeConfig(CFG_LV), '2026-12-01'), 104); // tope
});

test('días hábiles L-S: 15 días, esperado limitado a 104', () => {
  const cfg = C.normalizeConfig(CFG_LS);
  assert.equal(C.countBusinessDays('2026-09-14', '2026-09-30', cfg), 15);
  assert.equal(C.expectedHoursToDate(cfg, '2026-09-30'), 104); // 15×8=120 pero tope 104
  assert.equal(C.expectedHoursToDate(cfg, '2026-09-19'), 48); // sábado 19 cuenta
});

test('festivos configurados no cuentan como hábiles', () => {
  const cfg = C.normalizeConfig(Object.assign({}, CFG_LV, { holidays: ['2026-09-15', '2026-09-16'] }));
  assert.equal(C.countBusinessDays('2026-09-14', '2026-09-30', cfg), 11);
  assert.ok(!C.isBusinessDay('2026-09-15', cfg));
  assert.equal(C.expectedHoursToDate(cfg, '2026-09-16'), 8);
});

test('rango vacío o antes del inicio', () => {
  const cfg = C.normalizeConfig(CFG_LV);
  assert.deepEqual(C.businessDays('2026-09-30', '2026-09-14', cfg), []);
  assert.equal(C.expectedHoursToDate(cfg, '2026-09-01'), 0);
  assert.equal(C.businessDaysRemaining(cfg, '2026-10-05').length, 0);
  assert.equal(C.businessDaysRemaining(cfg, '2026-09-01').length, 13); // antes de iniciar quedan todos
});

test('festivos de Colombia 2026 (ley Emiliani)', () => {
  const f = C.colombianHolidays(2026).map(h => h.date);
  assert.equal(C.easterSunday(2026), '2026-04-05');
  assert.deepEqual(f, [
    '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18',
    '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12',
    '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
  ]);
  assert.ok(!f.some(d => d.startsWith('2026-09')), 'septiembre 2026 no tiene festivos');
  assert.equal(C.colombianHolidays(2025).length, 18);
});

// ---------------------------------------------------------------------------
test('criterio de aceptación: 15/09 con 8 h registradas', () => {
  const entries = [{ id: '1', date: '2026-09-14', start: '12:00', end: '20:00', ficha: '3536507', activity: 'formacion' }];
  const s = C.summarize({ config: CFG_LV, entries, sessions: [], today: '2026-09-15' });
  assert.equal(s.cumplidas, 8);
  assert.equal(s.faltantes, 96);
  assert.equal(s.esperado, 16);
  assert.equal(s.diasHabilesTotales, 13);
  assert.equal(s.diasHabilesTranscurridos, 2);
  assert.equal(s.diasHabilesRestantes, 12); // del 15 al 30 incluyendo hoy
  assert.equal(s.promedioNecesario, 8);
  assert.equal(s.porcentaje, 7.7);
  assert.equal(s.diferencia, -8);
  const alerts = C.buildAlerts({ config: CFG_LV, entries, sessions: [], today: '2026-09-15' });
  assert.ok(alerts.some(a => a.code === 'atraso' && a.level === 'rojo'), 'debe alertar atraso');
  assert.ok(!alerts.some(a => a.code === 'dia_sin_registro'), 'el 14 sí tiene registro');
});

test('al día: sin atraso genera alerta verde', () => {
  const entries = [
    { id: '1', date: '2026-09-14', start: '12:00', end: '20:00' },
    { id: '2', date: '2026-09-15', start: '12:00', end: '20:00' },
  ];
  const alerts = C.buildAlerts({ config: CFG_LV, entries, sessions: [], today: '2026-09-15' });
  assert.ok(!alerts.some(a => a.code === 'atraso'));
  assert.ok(alerts.some(a => a.code === 'al_dia' && a.level === 'verde'));
});

test('registros fuera del contrato no cuentan', () => {
  const entries = [{ id: '1', date: '2026-10-05', start: '12:00', end: '20:00' }];
  const s = C.summarize({ config: CFG_LV, entries, sessions: [], today: '2026-09-15' });
  assert.equal(s.cumplidas, 0);
  assert.equal(s.horasFueraDeContrato, 8);
});

test('día hábil pasado sin registro', () => {
  const entries = [{ id: '1', date: '2026-09-15', start: '12:00', end: '20:00' }];
  const alerts = C.buildAlerts({ config: CFG_LV, entries, sessions: [], today: '2026-09-16' });
  const a = alerts.find(x => x.code === 'dia_sin_registro');
  assert.ok(a && a.level === 'amarillo');
  assert.deepEqual(a.dates, ['2026-09-14']); // hoy (16) no se reporta todavía
});

test('programación insuficiente y sobreprogramación', () => {
  const cfg = CFG_LV;
  const pocas = [C.makeSession({ date: '2026-09-15', start: '12:00', end: '20:00' })];
  let alerts = C.buildAlerts({ config: cfg, entries: [], sessions: pocas, today: '2026-09-14' });
  assert.ok(alerts.some(a => a.code === 'programacion_insuficiente'));
  assert.ok(!alerts.some(a => a.code === 'sobreprogramacion_total'));

  const muchas = C.businessDays('2026-09-14', '2026-09-30', C.normalizeConfig(cfg))
    .map(d => C.makeSession({ date: d, start: '12:00', end: '20:00' }));
  muchas.push(C.makeSession({ date: '2026-09-14', start: '08:00', end: '11:00' })); // 107 h y 11 h el 14
  alerts = C.buildAlerts({ config: cfg, entries: [], sessions: muchas, today: '2026-09-14' });
  assert.ok(alerts.some(a => a.code === 'sobreprogramacion_total' && a.level === 'rojo'));
  const dia = alerts.find(a => a.code === 'sobreprogramacion_dia');
  assert.ok(dia && dia.dates.includes('2026-09-14'));
  assert.ok(!alerts.some(a => a.code === 'programacion_insuficiente'));
});

test('cruce de horarios entre sesiones', () => {
  const sessions = [
    C.makeSession({ date: '2026-09-15', start: '12:00', end: '16:00' }),
    C.makeSession({ date: '2026-09-15', start: '15:00', end: '18:00' }),
    C.makeSession({ date: '2026-09-16', start: '12:00', end: '14:00' }),
    C.makeSession({ date: '2026-09-16', start: '14:00', end: '16:00' }), // contigua, no se cruza
  ];
  const alerts = C.buildAlerts({ config: CFG_LV, entries: [], sessions, today: '2026-09-14' });
  const a = alerts.find(x => x.code === 'cruce_horarios');
  assert.ok(a && a.level === 'rojo');
  assert.ok(a.detail.includes('15/09/2026') && !a.detail.includes('16/09/2026'));
});

test('sesión en fin de semana o festivo', () => {
  const sessions = [
    C.makeSession({ date: '2026-09-26', start: '12:00', end: '20:00' }), // sábado
    C.makeSession({ date: '2026-09-21', start: '12:00', end: '20:00' }), // lunes
  ];
  let alerts = C.buildAlerts({ config: CFG_LV, entries: [], sessions, today: '2026-09-14' });
  let a = alerts.find(x => x.code === 'sesion_no_habil');
  assert.deepEqual(a.dates, ['2026-09-26']);
  // con sábado hábil ya no alerta
  alerts = C.buildAlerts({ config: CFG_LS, entries: [], sessions, today: '2026-09-14' });
  assert.ok(!alerts.some(x => x.code === 'sesion_no_habil'));
  // festivo configurado
  alerts = C.buildAlerts({ config: Object.assign({}, CFG_LS, { holidays: ['2026-09-21'] }), entries: [], sessions, today: '2026-09-14' });
  a = alerts.find(x => x.code === 'sesion_no_habil');
  assert.ok(a.detail.includes('(festivo)'));
});

test('fin de contrato cercano y ritmo superior a 8 h', () => {
  const entries = [{ id: '1', date: '2026-09-14', start: '12:00', end: '20:00' }];
  const alerts = C.buildAlerts({ config: CFG_LV, entries, sessions: [], today: '2026-09-28' });
  assert.ok(alerts.some(a => a.code === 'fin_cercano' && a.level === 'rojo'));
  const r = alerts.find(a => a.code === 'ritmo_superior');
  assert.ok(r, 'faltan 96 h en 3 días → 32 h/día');
  const s = C.summarize({ config: CFG_LV, entries, sessions: [], today: '2026-09-28' });
  assert.equal(s.promedioNecesario, 32);
});

test('meta cumplida y contrato finalizado', () => {
  const full = C.businessDays('2026-09-14', '2026-09-30', C.normalizeConfig(CFG_LV))
    .map(d => ({ id: d, date: d, start: '12:00', end: '20:00' }));
  let alerts = C.buildAlerts({ config: CFG_LV, entries: full, sessions: [], today: '2026-09-30' });
  assert.ok(alerts.some(a => a.code === 'meta_cumplida' && a.level === 'verde'));
  assert.ok(!alerts.some(a => a.level === 'rojo'));
  alerts = C.buildAlerts({ config: CFG_LV, entries: full.slice(0, 5), sessions: [], today: '2026-10-10' });
  assert.ok(alerts.some(a => a.code === 'contrato_incompleto'));
  assert.ok(!alerts.some(a => a.code === 'fin_cercano'));
});

test('alertas ordenadas: rojo, amarillo, verde', () => {
  const alerts = C.buildAlerts({ config: CFG_LV, entries: [], sessions: [], today: '2026-09-16' });
  const niveles = alerts.map(a => a.level);
  const orden = { rojo: 0, amarillo: 1, verde: 2 };
  for (let i = 1; i < niveles.length; i++) assert.ok(orden[niveles[i - 1]] <= orden[niveles[i]]);
});

// ---------------------------------------------------------------------------
test('CSV: encabezados flexibles, separador ; y fechas DD/MM/YYYY', () => {
  const csv = 'fecha;hora_inicio;hora_fin;ficha;competencia;rap;actividad\n' +
    '15/09/2026;12:00;20:00;3536507;Establecer requisitos;RAP 04;formacion\n' +
    '2026-09-18;12:00;16:00;3536507;"Diseñar; la solución";;otra\n' +
    '99/99/2026;12:00;16:00;;;;\n' +
    '16/09/2026;18:00;12:00;;;;\n';
  const { sessions, errors } = C.parseCSV(csv);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].date, '2026-09-15');
  assert.equal(sessions[0].hours, 8);
  assert.equal(sessions[0].rap, 'RAP 04');
  assert.equal(sessions[1].competencia, 'Diseñar; la solución');
  assert.equal(sessions[1].activity, 'otra');
  assert.equal(errors.length, 2);
  assert.ok(C.parseCSV('nada,aqui\n1,2').errors.length > 0);
});

test('cellToISO acepta Date, serial de Excel y texto; rechaza la ficha', () => {
  assert.equal(C.cellToISO(new Date(2026, 8, 15)), '2026-09-15');
  assert.equal(C.cellToISO(46280), '2026-09-15');
  assert.equal(C.cellToISO('15/09/2026'), '2026-09-15');
  assert.equal(C.cellToISO('2026-09-15 00:00:00'), '2026-09-15');
  assert.equal(C.cellToISO(3536507), null);
  assert.equal(C.cellToISO('Lunes'), null);
  assert.equal(C.normalizeTime(0.5), '12:00');
  assert.equal(C.normalizeTime('9:05'), '09:05');
});

test('cronograma sintético: fusiona franjas y separa textos distintos', () => {
  const grid = [
    ['HORARIO', 'Lunes', 'Martes'],
    [null, '2026-09-14', '2026-09-15'],
    ['12:00 - 13:00', 'OTRO - Ética', 'RONALDO BALLESTEROS - Requisitos / RAP 04'],
    ['13:00 - 14:00', null, 'RONALDO BALLESTEROS - Requisitos / RAP 04'],
    ['14:00 - 15:00', null, 'RONALDO BALLESTEROS - Diseño'],
    ['15:00 - 16:00', null, null],
    ['16:00 - 17:00', null, 'RONALDO BALLESTEROS - Diseño'],
  ];
  const { sessions } = C.parseCronogramaGrid(grid, 'Ronaldo Ballesteros', { ficha: '3536507' });
  assert.equal(sessions.length, 3);
  assert.deepEqual(sessions.map(s => [s.start, s.end, s.competencia, s.rap]), [
    ['12:00', '14:00', 'Requisitos', 'RAP 04'],
    ['14:00', '15:00', 'Diseño', ''],
    ['16:00', '17:00', 'Diseño', ''],
  ]);
  assert.equal(sessions[0].ficha, '3536507');
  assert.ok(C.parseCronogramaGrid(grid, 'Nadie').errors.length === 1);
});

test('fillMerges copia el valor ancla a todo el rango combinado', () => {
  const grid = [['a', null, null], [null, null, null]];
  C.fillMerges(grid, [{ s: { r: 0, c: 0 }, e: { r: 1, c: 2 } }]);
  assert.deepEqual(grid, [['a', 'a', 'a'], ['a', 'a', 'a']]);
});

test('cronograma real 3536507 (10): 47 días de 8 h, 5 dentro del contrato', () => {
  const grid = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-fixtures', 'cronograma_grid.json'), 'utf8'));
  const { sessions, errors } = C.parseCronogramaGrid(grid, 'RONALDO BALLESTEROS', { ficha: '3536507' });
  assert.deepEqual(errors, []);
  assert.equal(sessions.length, 47);
  assert.ok(sessions.every(s => s.hours === 8 && s.start === '12:00' && s.end === '20:00'));
  const cfg = C.normalizeConfig(CFG_LS);
  const sep = sessions.filter(s => C.inContract(s.date, cfg));
  assert.deepEqual(sep.map(s => s.date), ['2026-09-15', '2026-09-18', '2026-09-24', '2026-09-25', '2026-09-26']);
  assert.equal(sep[0].competencia.startsWith('Establecer requisitos'), true);
  assert.equal(sep[2].rap, 'EVALUAR RAP 01-02 Y 03');
  const s = C.summarize({ config: cfg, entries: [], sessions, today: '2026-09-14' });
  assert.equal(s.programadasTotal, 40);
  assert.equal(s.programadasPendientes, 40);
  const alerts = C.buildAlerts({ config: cfg, entries: [], sessions, today: '2026-09-14' });
  assert.ok(alerts.some(a => a.code === 'programacion_insuficiente'));
  assert.ok(!alerts.some(a => a.code === 'sesion_no_habil'), 'con L-S el sábado 26 es hábil');
  assert.ok(!alerts.some(a => a.code === 'cruce_horarios'));
});

test('registro rápido de día completo y validación', () => {
  const cfg = C.normalizeConfig(CFG_LS);
  const e = C.fullDayEntry('2026-09-16', cfg);
  assert.equal(e.start, '12:00'); assert.equal(e.end, '20:00');
  assert.equal(C.hoursOf(e), 8);
  const ses = C.makeSession({ date: '2026-09-15', start: '13:00', end: '17:00', competencia: 'X', rap: 'RAP 1' });
  const fromSes = C.entryFromSession(ses, cfg);
  assert.equal(fromSes.sessionId, ses.id);
  assert.equal(C.hoursOf(fromSes), 4);
  assert.deepEqual(C.validateEntry({ date: '2026-09-15', start: '12:00', end: '20:00' }), []);
  assert.ok(C.validateEntry({ date: 'hoy', start: '20:00', end: '12:00' }).length === 2);
});

// ---------------------------------------------------------------------------
test('calendario mensual: estados por día', () => {
  const cfg = C.normalizeConfig(CFG_LV);
  const cal = C.calendarMonth(2026, 9, {
    config: cfg, today: '2026-09-16',
    entries: [{ date: '2026-09-14', start: '12:00', end: '20:00' }, { date: '2026-09-16', start: '12:00', end: '15:00' }],
    sessions: [{ date: '2026-09-18', start: '12:00', end: '20:00' }],
  });
  const cells = cal.weeks.flat().filter(Boolean);
  const byDate = Object.fromEntries(cells.map(c => [c.date, c]));
  assert.equal(cells.length, 30);
  assert.equal(cal.weeks[0][0], null); // 1/09/2026 es martes → lunes vacío
  assert.equal(cal.weeks[0][1].day, 1);
  assert.equal(byDate['2026-09-10'].estado, 'fuera');
  assert.equal(byDate['2026-09-14'].estado, 'registrado');
  assert.equal(byDate['2026-09-15'].estado, 'sin_registro');
  assert.equal(byDate['2026-09-16'].estado, 'parcial');
  assert.ok(byDate['2026-09-16'].hoy);
  assert.equal(byDate['2026-09-17'].estado, 'libre');
  assert.equal(byDate['2026-09-18'].estado, 'programado');
  assert.equal(byDate['2026-09-18'].programadas, 8);
  assert.equal(byDate['2026-09-19'].estado, 'no_habil');
  assert.equal(byDate['2026-09-30'].estado, 'libre');
});

test('semáforo de avance: rojo < 33 %, amarillo 33-67 %, verde > 67 %', () => {
  assert.equal(C.semaforo(0).level, 'rojo');
  assert.equal(C.semaforo(0).label, 'Inicio');
  assert.equal(C.semaforo(7.7).level, 'rojo');
  assert.equal(C.semaforo(32.9).level, 'rojo');
  assert.equal(C.semaforo(33).level, 'amarillo');
  assert.equal(C.semaforo(50).level, 'amarillo');
  assert.equal(C.semaforo(67).level, 'amarillo');
  assert.equal(C.semaforo(67.1).level, 'verde');
  assert.equal(C.semaforo(100).label, 'Meta cumplida');
  assert.equal(C.semaforo('abc').level, 'rojo');
});
