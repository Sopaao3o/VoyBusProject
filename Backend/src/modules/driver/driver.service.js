// VEH-03: cumplimiento de turnos y registro del estado del vehículo (vista del conductor).
const { badRequest, notFound, conflict, HttpError } = require('../../utils/httpErrors');

const ESTADOS_CONDUCTOR = ['operativo', 'operativo_con_observaciones', 'fuera_de_servicio'];
const TIPOS_INCIDENCIA = ['vehiculo', 'recorrido'];

/** Compara una hora planificada con la real usando el margen (minutos). */
function evaluar(planificado, real, margen, esTermino) {
  if (!real) return null;
  const minutos = Math.round((Date.parse(real) - Date.parse(planificado)) / 60000);
  let estado = 'a_tiempo';
  if (minutos > margen) estado = 'atraso';
  else if (esTermino && minutos < -margen) estado = 'termino_anticipado';
  return { minutos, estado };
}

function createDriverService(db, { ahora = () => new Date() } = {}) {
  const qMargen = db.prepare('SELECT margen_tolerancia_min AS m FROM configuracion_sistema WHERE id = 1');
  const qUsuario = db.prepare('SELECT id, rol, estado FROM usuarios WHERE id = ?');
  const qTurno = db.prepare('SELECT * FROM turnos WHERE id = ?');
  const qVehiculo = db.prepare('SELECT * FROM vehiculos WHERE id = ?');
  const qViaje = db.prepare('SELECT * FROM viajes WHERE id = ?');
  const qViajes = db.prepare(`
    SELECT vi.*, r.sentido, l.codigo AS linea_codigo, l.nombre AS linea_nombre
    FROM viajes vi JOIN recorridos r ON r.id = vi.recorrido_id JOIN lineas l ON l.id = r.linea_id
    WHERE vi.turno_id = ? ORDER BY vi.orden_en_turno`);
  const qTurnosConductor = db.prepare(`
    SELECT id FROM turnos WHERE conductor_id = @c AND (@dia IS NULL OR substr(inicio_planificado,1,10) = @dia)
    ORDER BY inicio_planificado`);

  const margen = () => qMargen.get().m;
  const ahoraISO = () => ahora().toISOString();

  /** Comprueba que quien consulta es un conductor habilitado. */
  function conductor(id) {
    const u = qUsuario.get(id);
    if (!u || u.rol !== 'conductor') throw new HttpError(403, 'Esta acción es solo para conductores');
    if (u.estado !== 'habilitado') throw new HttpError(403, 'Tu cuenta de conductor no está habilitada');
    return u;
  }

  /** Devuelve el turno solo si pertenece al conductor (si no, responde como si no existiera). */
  function turnoPropio(conductorId, turnoId) {
    const t = qTurno.get(turnoId);
    if (!t || t.conductor_id !== conductorId) throw notFound('El turno no existe');
    return t;
  }

  function viajePropio(conductorId, viajeId) {
    const v = qViaje.get(viajeId);
    if (!v) throw notFound('El viaje no existe');
    return { viaje: v, turno: turnoPropio(conductorId, v.turno_id) };
  }

  function detalle(turnoId) {
    const t = qTurno.get(turnoId);
    const m = margen();
    const v = qVehiculo.get(t.vehiculo_id);
    return {
      ...t,
      vehiculo: { identificador: v.identificador, patente: v.patente, estado_operativo: v.estado_operativo },
      margen_tolerancia_min: m,
      evaluacion: {
        inicio: evaluar(t.inicio_planificado, t.inicio_real, m, false),
        termino: evaluar(t.termino_planificado, t.termino_real, m, true),
      },
      viajes: qViajes.all(turnoId).map((x) => ({
        ...x,
        evaluacion: {
          inicio: evaluar(x.inicio_planificado, x.inicio_real, m, false),
          termino: evaluar(x.termino_planificado, x.termino_real, m, true),
        },
      })),
    };
  }

  /** Valida y registra un cambio de estado del vehículo hecho por el conductor. */
  function cambiarEstadoVehiculo(vehiculoId, conductorId, estado, descripcion) {
    if (!ESTADOS_CONDUCTOR.includes(estado)) {
      throw badRequest(`El estado debe ser uno de: ${ESTADOS_CONDUCTOR.join(', ')}`);
    }
    const texto = typeof descripcion === 'string' ? descripcion.trim() : '';
    if (estado !== 'operativo' && !texto) throw badRequest('Describe el problema del vehículo');
    const actual = qVehiculo.get(vehiculoId).estado_operativo;
    if (actual !== estado || estado !== 'operativo') {
      db.prepare(`INSERT INTO historial_estado_vehiculo (vehiculo_id, responsable_id, estado_anterior, estado_nuevo, motivo, fecha)
                  VALUES (?,?,?,?,?,?)`).run(vehiculoId, conductorId, actual, estado, texto || null, ahoraISO());
      db.prepare('UPDATE vehiculos SET estado_operativo = ? WHERE id = ?').run(estado, vehiculoId);
    }
    return estado;
  }

  const iniciarTurno = db.transaction((conductorId, turnoId, body) => {
    conductor(conductorId);
    const t = turnoPropio(conductorId, turnoId);
    if (t.estado !== 'programado') throw conflict('El turno ya fue iniciado o finalizado');
    const otro = db.prepare(`SELECT id FROM turnos WHERE conductor_id = ? AND estado = 'en_curso'`).get(conductorId);
    if (otro) throw conflict('Ya tienes un turno en curso; finalízalo antes de iniciar otro');
    const v = qVehiculo.get(t.vehiculo_id);
    if (!v.habilitado || v.estado_operativo === 'en_mantenimiento') {
      throw conflict('El vehículo no está disponible (mantenimiento o deshabilitado). Contacta al administrador');
    }
    const estado = cambiarEstadoVehiculo(t.vehiculo_id, conductorId, body?.estado_vehiculo, body?.descripcion);
    db.prepare(`UPDATE turnos SET estado='en_curso', inicio_real=?, estado_vehiculo_recibido=? WHERE id=?`)
      .run(ahoraISO(), estado, turnoId);
    return detalle(turnoId);
  });

  const finalizarTurno = db.transaction((conductorId, turnoId, body) => {
    conductor(conductorId);
    const t = turnoPropio(conductorId, turnoId);
    if (t.estado !== 'en_curso') throw conflict('Solo se puede finalizar un turno en curso');
    if (db.prepare(`SELECT id FROM viajes WHERE turno_id = ? AND estado = 'en_curso'`).get(turnoId)) {
      throw conflict('Hay un viaje en curso; finalízalo antes de cerrar el turno');
    }
    const estado = cambiarEstadoVehiculo(t.vehiculo_id, conductorId, body?.estado_vehiculo, body?.descripcion);
    db.prepare(`UPDATE turnos SET estado='finalizado', termino_real=?, estado_vehiculo_entregado=? WHERE id=?`)
      .run(ahoraISO(), estado, turnoId);
    return detalle(turnoId);
  });

  const iniciarViaje = db.transaction((conductorId, viajeId) => {
    conductor(conductorId);
    const { viaje, turno } = viajePropio(conductorId, viajeId);
    if (turno.estado !== 'en_curso') throw conflict('Primero debes iniciar el turno');
    if (viaje.estado !== 'programado') throw conflict('El viaje ya fue iniciado o finalizado');
    const v = qVehiculo.get(turno.vehiculo_id);
    if (v.estado_operativo === 'fuera_de_servicio' || v.estado_operativo === 'en_mantenimiento') {
      throw conflict('Un vehículo fuera de servicio no puede iniciar nuevos viajes');
    }
    const pendiente = db.prepare(`
      SELECT orden_en_turno FROM viajes WHERE turno_id = ? AND orden_en_turno < ? AND estado <> 'finalizado' LIMIT 1`)
      .get(turno.id, viaje.orden_en_turno);
    if (pendiente) throw conflict(`Primero debes finalizar el viaje ${pendiente.orden_en_turno}`);
    db.prepare(`UPDATE viajes SET estado='en_curso', inicio_real=? WHERE id=?`).run(ahoraISO(), viajeId);
    return detalle(turno.id);
  });

  const finalizarViaje = db.transaction((conductorId, viajeId) => {
    conductor(conductorId);
    const { viaje, turno } = viajePropio(conductorId, viajeId);
    if (viaje.estado !== 'en_curso') throw conflict('Solo se puede finalizar un viaje en curso');
    // Finalizar un viaje NO cierra el turno (el turno puede tener más viajes).
    db.prepare(`UPDATE viajes SET estado='finalizado', termino_real=? WHERE id=?`).run(ahoraISO(), viajeId);
    return detalle(turno.id);
  });

  /** Justificación de atraso / término anticipado. Las horas originales y reales no se tocan. */
  function justificar(tabla, fila, turnoId, texto) {
    const justificacion = typeof texto === 'string' ? texto.trim() : '';
    if (!justificacion) throw badRequest('La justificación no puede estar vacía');
    const m = margen();
    const hayDesviacion = [
      evaluar(fila.inicio_planificado, fila.inicio_real, m, false),
      evaluar(fila.termino_planificado, fila.termino_real, m, true),
    ].some((e) => e && e.estado !== 'a_tiempo');
    if (!hayDesviacion) throw conflict('No hay atraso ni término anticipado que justificar');
    db.prepare(`UPDATE ${tabla} SET justificacion_atraso = ? WHERE id = ?`).run(justificacion, fila.id);
    return detalle(turnoId);
  }

  return {
    listarTurnos(conductorId, { fecha } = {}) {
      conductor(conductorId);
      const dia = fecha ? new Date(`${fecha}T00:00:00Z`) : null;
      if (fecha && Number.isNaN(dia.getTime())) throw badRequest('fecha debe tener formato AAAA-MM-DD');
      return qTurnosConductor.all({ c: conductorId, dia: dia ? dia.toISOString().slice(0, 10) : null })
        .map((r) => detalle(r.id));
    },

    obtenerTurno(conductorId, turnoId) {
      conductor(conductorId);
      turnoPropio(conductorId, turnoId);
      return detalle(turnoId);
    },

    iniciarTurno,
    finalizarTurno,
    iniciarViaje,
    finalizarViaje,

    cambiarEstado: db.transaction((conductorId, turnoId, body) => {
      conductor(conductorId);
      const t = turnoPropio(conductorId, turnoId);
      if (t.estado !== 'en_curso') throw conflict('Solo se puede informar el estado durante un turno en curso');
      cambiarEstadoVehiculo(t.vehiculo_id, conductorId, body?.estado_vehiculo, body?.descripcion);
      return detalle(turnoId);
    }),

    registrarIncidencia(conductorId, turnoId, body) {
      conductor(conductorId);
      const t = turnoPropio(conductorId, turnoId);
      if (t.estado !== 'en_curso') throw conflict('Solo se pueden registrar incidencias durante un turno en curso');
      if (!TIPOS_INCIDENCIA.includes(body?.tipo)) throw badRequest(`tipo debe ser: ${TIPOS_INCIDENCIA.join(' o ')}`);
      const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : '';
      if (!descripcion) throw badRequest('La descripción es obligatoria');
      const id = db.prepare(`INSERT INTO incidencias (conductor_id, vehiculo_id, turno_id, tipo, descripcion, fecha)
                             VALUES (?,?,?,?,?,?)`)
        .run(conductorId, t.vehiculo_id, turnoId, body.tipo, descripcion, ahoraISO()).lastInsertRowid;
      return db.prepare('SELECT * FROM incidencias WHERE id = ?').get(id);
    },

    justificarTurno(conductorId, turnoId, body) {
      conductor(conductorId);
      return justificar('turnos', turnoPropio(conductorId, turnoId), turnoId, body?.justificacion);
    },

    justificarViaje(conductorId, viajeId, body) {
      conductor(conductorId);
      const { viaje, turno } = viajePropio(conductorId, viajeId);
      return justificar('viajes', viaje, turno.id, body?.justificacion);
    },

    // ── Consultas del administrador ──
    listarIncidencias({ turno_id: turnoId, vehiculo_id: vehiculoId } = {}) {
      return db.prepare(`
        SELECT i.*, u.nombre_visible AS conductor_nombre, v.identificador AS vehiculo_identificador
        FROM incidencias i JOIN usuarios u ON u.id = i.conductor_id JOIN vehiculos v ON v.id = i.vehiculo_id
        WHERE (@t IS NULL OR i.turno_id = @t) AND (@v IS NULL OR i.vehiculo_id = @v)
        ORDER BY i.fecha DESC, i.id DESC`).all({ t: turnoId ? Number(turnoId) : null, v: vehiculoId ? Number(vehiculoId) : null });
    },

    historialVehiculo(vehiculoId) {
      if (!qVehiculo.get(vehiculoId)) throw notFound('El vehículo no existe');
      return db.prepare(`
        SELECT h.*, u.nombre_visible AS responsable_nombre
        FROM historial_estado_vehiculo h JOIN usuarios u ON u.id = h.responsable_id
        WHERE h.vehiculo_id = ? ORDER BY h.fecha DESC, h.id DESC`).all(vehiculoId);
    },
  };
}

module.exports = { createDriverService };