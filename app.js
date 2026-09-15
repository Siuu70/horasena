/* app.js — estado, persistencia en localStorage y render de la interfaz. La lógica de cálculo vive en calc.js. */
(function () {
  'use strict';
  const C = window.Calc;
  const STORAGE_KEY = 'control-horas-sena-v1';
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------
  let state = load();
  // Primera vez (sin datos guardados): cargar la programación del cronograma para que el calendario ya la muestre.
  if (!localStorage.getItem(STORAGE_KEY) && !state.sessions.length && window.PROGRAMACION_PRECARGADA) {
    state.sessions = window.PROGRAMACION_PRECARGADA.map(x => C.makeSession(Object.assign({}, x)));
  }

  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { data = null; }
    return sanitize(data);
  }

  function sanitize(data) {
    data = data && typeof data === 'object' ? data : {};
    return {
      config: C.normalizeConfig(data.config),
      entries: Array.isArray(data.entries) ? data.entries.filter(e => e && C.isValidISO(e.date)) : [],
      sessions: Array.isArray(data.sessions) ? data.sessions.filter(s => s && C.isValidISO(s.date)).map(s => C.makeSession(Object.assign({}, s, { id: s.id || C.uid(), status: s.status || 'pendiente' }))) : [],
    };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.warn('No se pudo guardar', e); }
    renderAll();
  }

  function today() { return state.config.simulatedToday || C.todayISO(state.config.timeZone); }
  const cfg = () => state.config;
  const fmt = C.formatDateES;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function msg(id, text, ok) { const el = $(id); el.innerHTML = text ? `<div class="msg ${ok ? 'ok' : 'err'}">${esc(text)}</div>` : ''; }

  // ---------------------------------------------------------------------------
  // Pestañas
  // ---------------------------------------------------------------------------
  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('section.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + b.dataset.tab));
    window.scrollTo(0, 0);
  }));

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------
  function stat(label, value, sub) {
    return `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub || '')}</div></div>`;
  }

  function renderPanel() {
    const t = today();
    const s = C.summarize({ config: cfg(), entries: state.entries, sessions: state.sessions, today: t });
    const c = cfg();
    $('header-sub').textContent = `Ficha ${c.ficha || '—'} · ${c.instructorName || ''} · ${fmt(c.startDate)} → ${fmt(c.endDate)}`;
    $('panel-fecha').textContent = `Hoy: ${fmt(t, true)}${c.simulatedToday ? ' (fecha simulada)' : ''} · Estado: ${{ no_iniciado: 'contrato no iniciado', en_curso: 'contrato en curso', finalizado: 'contrato finalizado' }[s.estadoContrato]}`;
    $('stats').innerHTML = [
      stat('Horas cumplidas', s.cumplidas + ' h', `de ${c.totalHours} h (${s.porcentaje}%)`),
      stat('Horas faltantes', s.faltantes + ' h', s.horasFueraDeContrato ? `+${s.horasFueraDeContrato} h registradas fuera del contrato` : ''),
      stat('Programadas (contrato)', s.programadasTotal + ' h', `${s.programadasPendientes} h pendientes desde hoy`),
      stat('Días hábiles', `${s.diasHabilesRestantes} restantes`, `de ${s.diasHabilesTotales} en total (${s.diasHabilesTranscurridos} transcurridos)`),
      stat('Promedio necesario', s.promedioNecesario == null ? '—' : s.promedioNecesario + ' h/día', s.promedioNecesario != null && s.promedioNecesario > c.hoursPerDay ? `supera las ${c.hoursPerDay} h/día` : 'para llegar a la meta'),
    ].join('');
    $('lbl-real').textContent = `${s.cumplidas} h (${s.porcentaje}%)`;
    $('lbl-total').textContent = `Meta ${c.totalHours} h`;
    const sem = C.semaforo(s.porcentaje);
    const bar = $('bar-real');
    bar.style.width = s.porcentaje + '%';
    bar.className = 'sem-' + sem.level;
    $('lbl-sem').innerHTML = `<span class="badge ${sem.level}">${sem.icon} ${esc(sem.label)}</span>`;

    const alerts = C.buildAlerts({ config: c, entries: state.entries, sessions: state.sessions, today: t });
    $('alertas').innerHTML = alerts.length ? alerts.map(a => `<div class="alert ${a.level}"><div class="t">${esc(a.title)}</div><div class="d">${esc(a.detail)}</div></div>`).join('') : '<p class="muted">Sin alertas.</p>';
  }


  // ---------------------------------------------------------------------------
  // Calendario del panel
  // ---------------------------------------------------------------------------
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  let calYM = null; // {y, m} del mes mostrado

  function calShift(n) {
    calYM.m += n;
    if (calYM.m < 1) { calYM.m = 12; calYM.y--; }
    if (calYM.m > 12) { calYM.m = 1; calYM.y++; }
    renderCalendario();
  }

  function renderCalendario() {
    const t = today();
    if (!calYM) calYM = { y: +t.slice(0, 4), m: +t.slice(5, 7) };
    const cal = C.calendarMonth(calYM.y, calYM.m, { config: cfg(), entries: state.entries, sessions: state.sessions, today: t });
    const sesPorDia = C.groupByDate(state.sessions);
    const corto = comp => { const w = String(comp || '').trim().split(/\s+/)[0] || 'Sesión'; return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); };
    $('cal-title').textContent = `${MESES[cal.month - 1]} ${cal.year}`;
    const head = [1, 2, 3, 4, 5, 6, 0].map(d => `<div class="dow">${C.DIAS_ES[d]}</div>`).join('');
    const cells = cal.weeks.flat().map(c => {
      if (!c) return '<div class="day vacio"></div>';
      const ses = (sesPorDia[c.date] || []).slice().sort((a, b) => a.start.localeCompare(b.start));
      const lineas = ses.map(x => `<span class="h ses ${x.status}">${esc(x.start.replace(':00', ''))}–${esc(x.end.replace(':00', ''))} ${esc(corto(x.competencia))}</span>`);
      if (c.registradas) lineas.push(`<span class="h reg">✓ ${c.registradas} h reg.</span>`);
      if (c.festivo) lineas.push('<span class="h">festivo</span>');
      const cls = ['day', c.estado, c.hoy ? 'hoy' : '', ses.length ? 'con-sesion' : ''].join(' ');
      const title = [fmt(c.date, true)].concat(ses.map(x => `${x.start}–${x.end} ${x.competencia}${x.rap ? ' / ' + x.rap : ''} (${x.hours} h, ${x.status})`), [`${c.registradas} h registradas`]).join('\n');
      return `<div class="${cls}" data-date="${c.estado === 'fuera' ? '' : c.date}" title="${esc(title)}"><span class="n">${c.day}${c.programadas ? ` <small>P ${c.programadas} h</small>` : ''}</span>${lineas.join('')}</div>`;
    }).join('');
    $('calendario').innerHTML = head + cells;
  }
  $('cal-prev').addEventListener('click', () => calShift(-1));
  $('cal-next').addEventListener('click', () => calShift(1));
  $('cal-hoy').addEventListener('click', () => { calYM = null; renderCalendario(); });
  $('calendario').addEventListener('click', ev => {
    const d = ev.target.closest('.day'); if (!d || !d.dataset.date) return;
    resetForm(); $('e-date').value = d.dataset.date; $('q-date').value = d.dataset.date;
    document.querySelector('nav button[data-tab="registro"]').click();
    $('e-start').focus();
  });

  // ---------------------------------------------------------------------------
  // Registro de horas
  // ---------------------------------------------------------------------------
  function resetForm() {
    $('e-id').value = '';
    $('e-date').value = today();
    $('e-start').value = cfg().defaultStart || '12:00';
    $('e-end').value = '20:00';
    $('e-ficha').value = cfg().ficha || '';
    $('e-activity').value = 'formacion';
    $('e-obs').value = '';
    $('form-title').textContent = 'Registrar horas';
    $('btn-guardar').textContent = 'Guardar registro';
    $('btn-cancelar').classList.add('hidden');
    updateHorasPreview();
  }

  function updateHorasPreview() {
    const h = C.hoursBetween($('e-start').value, $('e-end').value);
    $('e-horas').textContent = h ? `= ${h} h` : '';
  }
  ['e-start', 'e-end'].forEach(id => $(id).addEventListener('input', updateHorasPreview));

  $('form-registro').addEventListener('submit', ev => {
    ev.preventDefault();
    const e = {
      id: $('e-id').value || C.uid(), date: $('e-date').value, start: $('e-start').value, end: $('e-end').value,
      ficha: $('e-ficha').value.trim(), activity: $('e-activity').value, obs: $('e-obs').value.trim(),
    };
    const errors = C.validateEntry(e);
    if (errors.length) { msg('form-msg', errors.join('. '), false); return; }
    const idx = state.entries.findIndex(x => x.id === e.id);
    if (idx >= 0) { e.sessionId = state.entries[idx].sessionId; state.entries[idx] = e; } else state.entries.push(e);
    save();
    msg('form-msg', `Registro guardado: ${fmt(e.date)} ${e.start}–${e.end} (${C.hoursOf(e)} h)`, true);
    resetForm();
  });

  $('btn-cancelar').addEventListener('click', () => { resetForm(); msg('form-msg', ''); });

  function editEntry(id) {
    const e = state.entries.find(x => x.id === id); if (!e) return;
    $('e-id').value = e.id; $('e-date').value = e.date; $('e-start').value = e.start; $('e-end').value = e.end;
    $('e-ficha').value = e.ficha || ''; $('e-activity').value = e.activity || 'formacion'; $('e-obs').value = e.obs || '';
    $('form-title').textContent = 'Editar registro'; $('btn-guardar').textContent = 'Actualizar';
    $('btn-cancelar').classList.remove('hidden'); updateHorasPreview();
    window.scrollTo(0, 0);
  }

  function deleteEntry(id) {
    const e = state.entries.find(x => x.id === id); if (!e) return;
    if (!confirm(`¿Eliminar el registro del ${fmt(e.date)} ${e.start}–${e.end}?`)) return;
    state.entries = state.entries.filter(x => x.id !== id);
    state.sessions.forEach(s => { if (s.id === e.sessionId && s.status === 'cumplida') s.status = 'pendiente'; });
    save();
  }

  /** Marca un día completo: registra sus sesiones programadas o un día por defecto. */
  function markFullDay(date) {
    if (!C.isValidISO(date)) { msg('q-msg', 'Selecciona una fecha', false); return; }
    const c = cfg();
    const sesiones = state.sessions.filter(s => s.date === date);
    const nuevos = [];
    if (sesiones.length) {
      sesiones.forEach(s => {
        if (state.entries.some(e => e.sessionId === s.id)) return;
        nuevos.push(C.entryFromSession(s, c)); s.status = 'cumplida';
      });
      if (!nuevos.length) { msg('q-msg', 'Las sesiones de ese día ya están registradas', false); return; }
    } else {
      if (state.entries.some(e => e.date === date)) { msg('q-msg', 'Ese día ya tiene registros; edítalos en la tabla', false); return; }
      nuevos.push(C.fullDayEntry(date, c));
    }
    state.entries.push(...nuevos);
    save();
    msg('q-msg', `Registradas ${C.sumHours(nuevos)} h el ${fmt(date)}`, true);
  }
  $('btn-dia-completo').addEventListener('click', () => markFullDay($('q-date').value));

  function renderRegistros() {
    const t = today();
    const list = state.entries.slice().sort((a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start));
    const tbody = $('tabla-registros').querySelector('tbody');
    tbody.innerHTML = list.map(e => `
      <tr class="${e.date === t ? 'hoy' : ''}">
        <td>${esc(fmt(e.date))}${C.inContract(e.date, cfg()) ? '' : ' <span class="badge gris">fuera del contrato</span>'}</td>
        <td>${esc(e.start)}–${esc(e.end)}</td>
        <td><strong>${C.hoursOf(e)}</strong></td>
        <td>${esc(e.ficha)}</td>
        <td>${e.activity === 'otra' ? 'Otra actividad' : 'Formación directa'}</td>
        <td>${esc(e.obs)}</td>
        <td style="white-space:nowrap"><button class="btn sec sm" data-edit="${e.id}">Editar</button> <button class="btn danger sm" data-del="${e.id}">Eliminar</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">Sin registros todavía.</td></tr>';
    $('reg-total').textContent = list.length ? `· ${list.length} registros · ${C.sumHours(list)} h` : '';
    $('q-hpd').textContent = cfg().hoursPerDay;
    if (!$('q-date').value) $('q-date').value = t;
  }
  $('tabla-registros').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.edit) editEntry(b.dataset.edit);
    if (b.dataset.del) deleteEntry(b.dataset.del);
  });

  // ---------------------------------------------------------------------------
  // Programación
  // ---------------------------------------------------------------------------
  function importSessions(nuevas, origen) {
    const c = cfg();
    if ($('imp-solo-contrato').checked) nuevas = nuevas.filter(s => C.inContract(s.date, c));
    if (!nuevas.length) { msg('imp-msg', `No hay sesiones para importar desde ${origen} (revisa el filtro "solo contrato" y el nombre configurado).`, false); return; }
    if ($('imp-reemplazar').checked) state.sessions = nuevas;
    else {
      const existe = s => state.sessions.some(x => x.date === s.date && x.start === s.start && x.end === s.end);
      nuevas = nuevas.filter(s => !existe(s));
      state.sessions.push(...nuevas);
    }
    save();
    msg('imp-msg', `Importadas ${nuevas.length} sesiones (${C.sumHours(nuevas)} h) desde ${origen}.`, true);
  }

  $('file-xlsx').addEventListener('change', ev => {
    const f = ev.target.files[0]; if (!f) return;
    if (typeof XLSX === 'undefined') { msg('imp-msg', 'No se pudo cargar la librería para leer Excel (requiere internet la primera vez). Usa CSV o la programación incluida.', false); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
        C.fillMerges(grid, ws['!merges']);
        const { sessions, errors } = C.parseCronogramaGrid(grid, cfg().instructorName, { ficha: cfg().ficha });
        if (errors.length) { msg('imp-msg', errors.join('. '), false); return; }
        importSessions(sessions, f.name);
      } catch (err) { msg('imp-msg', 'Error leyendo el archivo: ' + err.message, false); }
      ev.target.value = '';
    };
    reader.readAsArrayBuffer(f);
  });

  $('file-csv').addEventListener('change', ev => {
    const f = ev.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = e => {
      const { sessions, errors } = C.parseCSV(e.target.result, { ficha: cfg().ficha });
      if (!sessions.length) { msg('imp-msg', errors.join('. ') || 'Sin sesiones', false); return; }
      importSessions(sessions, f.name);
      if (errors.length) $('imp-msg').innerHTML += `<div class="msg err">${esc(errors.length + ' líneas omitidas: ' + errors.slice(0, 5).join('; '))}</div>`;
      ev.target.value = '';
    };
    reader.readAsText(f, 'utf-8');
  });

  $('btn-precargada').addEventListener('click', () => {
    const pre = (window.PROGRAMACION_PRECARGADA || []).map(s => C.makeSession(Object.assign({}, s)));
    importSessions(pre, 'la programación incluida');
  });

  $('form-sesion').addEventListener('submit', ev => {
    ev.preventDefault();
    const parsed = C.parseCellText('X - ' + $('s-comp').value.trim());
    const s = C.makeSession({ date: $('s-date').value, start: $('s-start').value, end: $('s-end').value, ficha: cfg().ficha, competencia: parsed.competencia, rap: parsed.rap });
    const errors = C.validateEntry(s);
    if (errors.length) { msg('imp-msg', errors.join('. '), false); return; }
    state.sessions.push(s); save();
    $('s-comp').value = '';
  });

  $('btn-borrar-prog').addEventListener('click', () => {
    if (!state.sessions.length || !confirm('¿Borrar toda la programación importada? Los registros de horas se conservan.')) return;
    state.sessions = []; save();
  });

  function setStatus(id, status) {
    const s = state.sessions.find(x => x.id === id); if (!s) return;
    s.status = status;
    if (status === 'cumplida' && !state.entries.some(e => e.sessionId === s.id)) state.entries.push(C.entryFromSession(s, cfg()));
    save();
  }

  function renderProgramacion() {
    const t = today(); const c = cfg();
    let list = state.sessions.slice().sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    if ($('ver-solo-contrato').checked) list = list.filter(s => C.inContract(s.date, c));
    $('prog-total').textContent = list.length ? `${list.length} sesiones · ${C.sumHours(list)} h` : 'Sin programación';
    if (!list.length) { $('tabla-programacion').innerHTML = '<p class="muted">Importa el cronograma, un CSV o carga la programación incluida.</p>'; return; }
    const byWeek = {};
    list.forEach(s => { const w = C.weekStart(s.date); (byWeek[w] = byWeek[w] || []).push(s); });
    const estados = { pendiente: 'Pendiente', cumplida: 'Cumplida', parcial: 'Parcial', no_cumplida: 'No cumplida' };
    const badge = { pendiente: 'gris', cumplida: 'verde', parcial: 'amarillo', no_cumplida: 'rojo' };
    $('tabla-programacion').innerHTML = Object.keys(byWeek).sort().map(w => {
      const rows = byWeek[w].map(s => {
        const registrada = state.entries.some(e => e.sessionId === s.id);
        const pasadaSin = s.date < t && s.status === 'pendiente';
        const noHabil = !C.isBusinessDay(s.date, c);
        return `<tr class="${s.date === t ? 'hoy' : pasadaSin ? 'pasado-sin' : ''}">
          <td>${esc(fmt(s.date))}${noHabil ? ' <span class="badge amarillo">no hábil</span>' : ''}</td>
          <td>${esc(s.start)}–${esc(s.end)}</td>
          <td><strong>${s.hours}</strong></td>
          <td>${esc(s.competencia)}${s.rap ? `<br><span class="muted">${esc(s.rap)}</span>` : ''}</td>
          <td><select data-status="${s.id}">${Object.keys(estados).map(k => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${estados[k]}</option>`).join('')}</select>
              <div style="margin-top:4px"><span class="badge ${badge[s.status]}">${estados[s.status]}</span>${registrada ? ' <span class="badge verde">registrada</span>' : ''}</div></td>
          <td style="white-space:nowrap">${registrada ? '' : `<button class="btn sec sm" data-registrar="${s.id}">Registrar ${s.hours} h</button> `}<button class="btn danger sm" data-delses="${s.id}">✕</button></td>
        </tr>`;
      }).join('');
      return `<div class="semana">Semana del ${fmt(w)} al ${fmt(C.addDays(w, 6))} · ${C.sumHours(byWeek[w])} h</div>
        <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Horario</th><th>Horas</th><th>Competencia / RAP</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join('');
  }
  $('ver-solo-contrato').addEventListener('change', renderProgramacion);
  $('tabla-programacion').addEventListener('change', ev => { if (ev.target.dataset.status) setStatus(ev.target.dataset.status, ev.target.value); });
  $('tabla-programacion').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.registrar) setStatus(b.dataset.registrar, 'cumplida');
    if (b.dataset.delses) { state.sessions = state.sessions.filter(s => s.id !== b.dataset.delses); save(); }
  });

  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------
  function renderConfig() {
    const c = cfg();
    $('c-start').value = c.startDate; $('c-end').value = c.endDate; $('c-total').value = c.totalHours; $('c-hpd').value = c.hoursPerDay;
    $('c-defstart').value = c.defaultStart || '12:00'; $('c-name').value = c.instructorName || ''; $('c-ficha').value = c.ficha || '';
    $('c-today').value = c.simulatedToday || '';
    $('c-workdays').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" value="${d}" ${c.workDays.includes(d) ? 'checked' : ''}> ${C.DIAS_ES_LARGO[d]}</label>`).join('');
    $('c-holidays').value = c.holidays.join('\n');
    if (!$('c-year').value) $('c-year').value = c.startDate.slice(0, 4);
  }

  $('btn-festivos').addEventListener('click', () => {
    const y = parseInt($('c-year').value, 10); if (!y) return;
    const actuales = $('c-holidays').value.split(/\s+/).filter(Boolean);
    const nuevos = C.colombianHolidays(y).map(h => h.date).filter(d => !actuales.includes(d));
    $('c-holidays').value = actuales.concat(nuevos).sort().join('\n');
  });

  $('form-config').addEventListener('submit', ev => {
    ev.preventDefault();
    const workDays = Array.from($('c-workdays').querySelectorAll('input:checked')).map(i => +i.value);
    const holidays = $('c-holidays').value.split(/\s+/).filter(Boolean);
    const malos = holidays.filter(h => !C.isValidISO(h));
    if (malos.length) { $('c-msg').innerHTML = `<span class="badge rojo">Festivos inválidos: ${esc(malos.join(', '))}</span>`; return; }
    if ($('c-end').value < $('c-start').value) { $('c-msg').innerHTML = '<span class="badge rojo">La fecha fin es anterior al inicio</span>'; return; }
    if (!workDays.length) { $('c-msg').innerHTML = '<span class="badge rojo">Marca al menos un día hábil</span>'; return; }
    state.config = C.normalizeConfig({
      startDate: $('c-start').value, endDate: $('c-end').value, totalHours: $('c-total').value, hoursPerDay: $('c-hpd').value,
      defaultStart: $('c-defstart').value || '12:00', instructorName: $('c-name').value.trim(), ficha: $('c-ficha').value.trim(),
      simulatedToday: $('c-today').value || '', workDays, holidays, timeZone: 'America/Bogota',
    });
    save();
    $('c-msg').innerHTML = '<span class="badge verde">Configuración guardada</span>';
  });

  // ---------------------------------------------------------------------------
  // Respaldo
  // ---------------------------------------------------------------------------
  $('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(Object.assign({ exportadoEl: new Date().toISOString(), version: 1 }, state), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `control-horas-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('file-backup').addEventListener('change', ev => {
    const f = ev.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || typeof data !== 'object' || (!data.config && !data.entries && !data.sessions)) throw new Error('El archivo no parece un respaldo de esta app');
        state = sanitize(data); save(); renderConfig();
        msg('backup-msg', `Respaldo restaurado: ${state.entries.length} registros, ${state.sessions.length} sesiones.`, true);
      } catch (err) { msg('backup-msg', 'No se pudo importar: ' + err.message, false); }
      ev.target.value = '';
    };
    reader.readAsText(f, 'utf-8');
  });

  $('btn-reset').addEventListener('click', () => {
    if (!confirm('¿Borrar TODOS los datos (registros, programación y configuración)? Esta acción no se puede deshacer.')) return;
    localStorage.removeItem(STORAGE_KEY); state = sanitize(null); save(); renderConfig(); resetForm();
  });

  // ---------------------------------------------------------------------------
  function renderAll() { renderPanel(); renderCalendario(); renderRegistros(); renderProgramacion(); }
  renderConfig(); resetForm(); renderAll();
})();
