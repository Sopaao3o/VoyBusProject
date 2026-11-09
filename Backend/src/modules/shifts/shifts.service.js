// ADM-03: gestión de turnos y asignaciones (lógica de negocio).
const { badRequest, notFound, conflict } = require('../../utils/httpErrors');

const VEHICULO_ASIGNABLE = ['operativo', 'operativo_con_observaciones'];

/** Convierte una fecha a ISO UTC ("2026-11-10T08:00:00.000Z"); lanza 400 si es inválida. */
function fechaISO(valor, campo) {
  if (typeof valor !== 'string' || Number.isNaN(Date.parse(valor))) {
    throw badRequest(`${campo} debe ser una fecha válida (ISO 8601)`);
  }
  return new Date(valor).toISOString();
}

function idPositivo(valor, campo) {
  if (!Number.isInteger(valor) || valor <= 0) throw badRequest(`${campo} es obligatorio`);
  return valor;
}

function createShiftsService(db) {
  const qConductor = db.prepare(`SELECT id, rol, estado, nombre_visible FROM usuarios WHERE id = ?`);
  const qVehiculo = db.prepare(`SELECT id, identificador, estado_operativo, habilitado FROM vehiculos WHERE id = ?`);
  const qRecorrido = db.prepare(`
    SELECT r.id, r.activo, l.estado_servicio
    FROM recorridos r JOIN lineas l ON l.id = r.linea_id WHERE r.id = ?`);
  const qSolape = (columna) =>
    db.prepare(`
      SELECT id FROM turnos
      WHERE ${columna} = @id AND id <> @excluir
        AND inicio_planificado < @fin AND termino_planificado > @inicio
      LIMIT 1`);
  const qSolapeConductor = qSolape('conductor_id');
  const qSolapeVehiculo = qSolape('vehiculo_id');
  const qTurno = db.prepare(`
    SELECT t.*, u.nombre_visible AS conductor_nombre, v.identificador AS vehiculo_identificador
    FROM turnos t
    JOIN usuarios u ON u.id = t.conductor_id
    JOIN vehiculos v ON v.id = t.vehiculo_id
    WHERE t.id = ?`);
  const qViajes = db.prepare(`
    SELECT vi.id, vi.orden_en_turno, vi.recorrido_id, vi.inicio_planificado, vi.termino_planificado, vi.estado,
           r.sentido, l.id AS linea_id, l.codigo AS linea_codigo, l.nombre AS linea_nombre
    FROM viajes vi
    JOIN recorridos r ON r.id = vi.recorrido_id
    JOIN lineas l ON l.id = r.linea_id
    WHERE vi.turno_id = ? ORDER BY vi.orden_en_turno`);

  function detalle(id) {
    const t = qTurno.get(id);
    if (!t) throw notFound('El turno no existe');
    return { ...t, viajes: qViajes.all(id) };
  }

  /** Valida el cuerpo y devuelve los datos normalizados. `excluir` = turno que se está editando. */
  function validar(body, excluir = 0) {
    const conductorId = idPositivo(body?.conductor_id, 'conductor_id');
    const vehiculoId = idPositivo(body?.vehiculo_id, 'vehiculo_id');
    const inicio = fechaISO(body.inicio_planificado, 'inicio_planificado');
    const termino = fechaISO(body.termino_planificado, 'termino_planificado');
    if (termino <= inicio) throw badRequest('El término del turno debe ser posterior al inicio');

    const conductor = qConductor.get(conductorId);
    if (!conductor || conductor.rol !== 'conductor') throw badRequest('El conductor indicado no existe');
    if (conductor.estado !== 'habilitado') throw conflict('Solo se pueden asignar conductores habilitados');

    const vehiculo = qVehiculo.get(vehiculoId);
    if (!vehiculo) throw badRequest('El vehículo indicado no existe');
    if (!vehiculo.habilitado || !VEHICULO_ASIGNABLE.includes(vehiculo.estado_operativo)) {
      throw conflict('Solo se pueden asignar vehículos operativos (con o sin observaciones)');
    }

    const params = { inicio, fin: termino, excluir };
    if (qSolapeConductor.get({ ...params, id: conductorId })) {
      throw conflict('El conductor ya tiene un turno que se superpone con ese horario');
    }
    if (qSolapeVehiculo.get({ ...params, id: vehiculoId })) {
      throw conflict('El vehículo ya tiene un turno que se superpone con ese horario');
    }

    if (!Array.isArray(body.viajes) || body.viajes.length === 0) {
      throw badRequest('El turno debe incluir al menos un viaje');
    }
    const viajes = body.viajes
      .map((v, i) => {
        const recorridoId = idPositivo(v?.recorrido_id, `viajes[${i}].recorrido_id`);
        const r = qRecorrido.get(recorridoId);
        if (!r || !r.activo) throw badRequest(`viajes[${i}]: el recorrido no existe`);
        if (r.estado_servicio !== 'activa') throw conflict(`viajes[${i}]: la línea no está activa`);
        const vi = fechaISO(v.inicio_planificado, `viajes[${i}].inicio_planificado`);
        const vt = fechaISO(v.termino_planificado, `viajes[${i}].termino_planificado`);
        if (vt <= vi) throw badRequest(`viajes[${i}]: el término debe ser posterior al inicio`);
        if (vi < inicio || vt > termino) throw badRequest(`viajes[${i}]: debe quedar dentro del horario del turno`);
        return { recorrido_id: recorridoId, inicio_planificado: vi, termino_planificado: vt };
      })
      .sort((a, b) => a.inicio_planificado.localeCompare(b.inicio_planificado)); // el orden sale del horario
    for (let i = 1; i < viajes.length; i++) {
      if (viajes[i].inicio_planificado < viajes[i - 1].termino_planificado) {
        throw badRequest('Los viajes de un turno no pueden superponerse');
      }
    }
    return { conductorId, vehiculoId, inicio, termino, viajes };
  }

  const insTurno = db.prepare(`
    INSERT INTO turnos (conductor_id, vehiculo_id, inicio_planificado, termino_planificado) VALUES (?,?,?,?)`);
  const updTurno = db.prepare(`
    UPDATE turnos SET conductor_id=?, vehiculo_id=?, inicio_planificado=?, termino_planificado=? WHERE id=?`);
  const delViajes = db.prepare(`DELETE FROM viajes WHERE turno_id = ?`);
  const insViaje = db.prepare(`
    INSERT INTO viajes (turno_id, recorrido_id, orden_en_turno, inicio_planificado, termino_planificado)
    VALUES (?,?,?,?,?)`);

  const guardarViajes = (turnoId, viajes) =>
    viajes.forEach((v, i) => insViaje.run(turnoId, v.recorrido_id, i + 1, v.inicio_planificado, v.termino_planificado));

  const crear = db.transaction((body) => {
    const d = validar(body);
    const id = insTurno.run(d.conductorId, d.vehiculoId, d.inicio, d.termino).lastInsertRowid;
    guardarViajes(id, d.viajes);
    return detalle(Number(id));
  });

  const modificar = db.transaction((id, body) => {
    const actual = qTurno.get(id);
    if (!actual) throw notFound('El turno no existe');
    if (actual.estado !== 'programado') throw conflict('Solo se pueden modificar turnos que aún no han comenzado');
    const d = validar(body, id);
    updTurno.run(d.conductorId, d.vehiculoId, d.inicio, d.termino, id);
    delViajes.run(id);
    guardarViajes(id, d.viajes);
    return detalle(id);
  });

  return {
    crear,
    modificar,
    obtener: detalle,

    listar({ fecha, conductor_id: conductorId } = {}) {
      const where = [];
      const params = {};
      if (fecha) {
        const dia = fechaISO(`${fecha}T00:00:00Z`, 'fecha').slice(0, 10);
        where.push('substr(t.inicio_planificado, 1, 10) = @dia');
        params.dia = dia;
      }
      if (conductorId) {
        where.push('t.conductor_id = @conductorId');
        params.conductorId = Number(conductorId);
      }
      const sql = `
        SELECT t.id, t.conductor_id, u.nombre_visible AS conductor_nombre, t.vehiculo_id,
               v.identificador AS vehiculo_identificador, t.inicio_planificado, t.termino_planificado, t.estado
        FROM turnos t JOIN usuarios u ON u.id = t.conductor_id JOIN vehiculos v ON v.id = t.vehiculo_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY t.inicio_planificado`;
      return db.prepare(sql).all(params);
    },

    obtenerConfiguracion() {
      return db.prepare('SELECT margen_tolerancia_min, actualizado_en FROM configuracion_sistema WHERE id = 1').get();
    },

    actualizarMargen(valor) {
      if (!Number.isInteger(valor) || valor < 0 || valor > 120) {
        throw badRequest('margen_tolerancia_min debe ser un número entero de minutos entre 0 y 120');
      }
      db.prepare(`UPDATE configuracion_sistema
                  SET margen_tolerancia_min = ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = 1`).run(valor);
      return this.obtenerConfiguracion();
    },
  };
}

module.exports = { createShiftsService };