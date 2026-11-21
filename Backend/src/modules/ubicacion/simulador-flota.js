// SIMULADOR DE FLOTA (solo desarrollo): pone varias micros en circulación para probar y grabar
// RED-03 y ADM-04 sin tener un conductor real por cada bus. Cada micro avanza por su recorrido y
// envía su posición por el mismo camino que el GPS del conductor (VEH-01). Al llegar al final,
// cierra el viaje y vuelve en sentido contrario. Los conductores de demostración no tienen
// contraseña: no se puede iniciar sesión con ellos.
const { Op } = require('sequelize');
const { puntoEnRecorrido, crearRuta } = require('./geo');
const { terminarVinculacionesDelViaje } = require('../vinculacion/terminar');

const INTERVALO_MS = 5000;

// Qué micro hace qué recorrido, a qué velocidad (m/s) y desde qué parte del trayecto parte.
// La que tiene `cortesDeSenal` deja de enviar a ratos, para mostrar una ubicación atrasada.
const PLAN = [
  { vehiculo: 'BUS-02', linea: '103', sentido: 'vuelta', velocidad: 9, inicio: 0.25 },
  { vehiculo: 'BUS-03', linea: '107', sentido: 'ida', velocidad: 8, inicio: 0.1 },
  {
    vehiculo: 'BUS-04',
    linea: '107',
    sentido: 'vuelta',
    velocidad: 10,
    inicio: 0.2,
    cortesDeSenal: true,
  },
  { vehiculo: 'BUS-05', linea: '103', sentido: 'ida', velocidad: 11, inicio: 0.65 },
];

/**
 * @param {ReturnType<import('../../database/models').initModels>} models
 * @param {ReturnType<import('./ubicacion.service').createUbicacionService>} ubicacion
 * @param {{ ahora?: () => Date }} [opciones]
 */
function createSimuladorFlota(models, ubicacion, { ahora = () => new Date() } = {}) {
  const {
    sequelize,
    Usuario,
    Linea,
    Recorrido,
    Paradero,
    RecorridoParadero,
    Vehiculo,
    Turno,
    Viaje,
    SolicitudParada,
  } = models;
  const ahoraISO = () => ahora().toISOString();

  let temporizador = null;
  /** @type {{ plan: object, conductorId: number, turnoId: number, viajeId: number, recorridoId: number, ruta: object, largo: number, metros: number, vueltas: number }[]} */
  let micros = [];

  async function conductorDemo(numero) {
    const correo = `demo.conductor${numero}@voybus.cl`;
    const [conductor] = await Usuario.findOrCreate({
      where: { correo },
      defaults: {
        rol: 'conductor',
        nombre_visible: `Conductor demo ${numero}`,
        correo,
        estado: 'habilitado',
        identificador: `DEMO-${numero}`,
        correo_verificado: 1,
      },
    });
    return conductor.id;
  }

  async function recorrido(codigoLinea, sentido) {
    const linea = await Linea.findOne({ where: { codigo: codigoLinea } });
    const r = await Recorrido.findOne({ where: { linea_id: linea.id, sentido } });
    const paradas = await RecorridoParadero.findAll({
      where: { recorrido_id: r.id },
      include: [{ model: Paradero, as: 'paradero' }],
      order: [['orden', 'ASC']],
    });
    const paraderos = paradas.map((p) => ({
      orden: p.orden,
      latitud: p.paradero.latitud,
      longitud: p.paradero.longitud,
    }));
    // La micro avanza por las calles si el recorrido tiene trazado.
    const ruta = crearRuta(paraderos, r.trazado);
    return { id: r.id, ruta, largo: ruta.largo };
  }

  /** Un viaje nuevo, ya en curso, dentro del turno de la micro. */
  async function nuevoViaje(turnoId, recorridoId, orden) {
    const inicio = ahora();
    const termino = new Date(inicio.getTime() + 60 * 60 * 1000);
    const viaje = await Viaje.create({
      turno_id: turnoId,
      recorrido_id: recorridoId,
      orden_en_turno: orden,
      inicio_planificado: inicio.toISOString(),
      termino_planificado: termino.toISOString(),
      inicio_real: inicio.toISOString(),
      estado: 'en_curso',
    });
    return viaje.id;
  }

  async function cerrarViaje(viajeId) {
    await sequelize.transaction(async (transaction) => {
      await Viaje.update(
        { estado: 'finalizado', termino_real: ahoraISO() },
        { where: { id: viajeId }, transaction },
      );
      await SolicitudParada.update(
        { estado: 'cerrada', motivo_cierre: 'viaje_finalizado', cerrada_en: ahoraISO() },
        { where: { viaje_id: viajeId, estado: { [Op.ne]: 'cerrada' } }, transaction },
      );
      await terminarVinculacionesDelViaje(models, viajeId, ahoraISO, transaction);
    });
  }

  /** Avanza cada micro un intervalo y envía su posición. */
  async function paso(ms = INTERVALO_MS) {
    for (const m of micros) {
      m.metros += (m.plan.velocidad * ms) / 1000;
      if (m.metros >= m.largo) {
        // Terminó el recorrido: cierra el viaje y vuelve en sentido contrario.
        await cerrarViaje(m.viajeId);
        m.vueltas++;
        const sentido =
          m.vueltas % 2 === 0 ? m.plan.sentido : m.plan.sentido === 'ida' ? 'vuelta' : 'ida';
        const r = await recorrido(m.plan.linea, sentido);
        Object.assign(m, { recorridoId: r.id, ruta: r.ruta, largo: r.largo, metros: 0 });
        m.viajeId = await nuevoViaje(m.turnoId, r.id, m.vueltas + 1);
      }
      // Corte de señal: entre el 35 % y el 55 % del trayecto no envía nada.
      const fraccion = m.metros / m.largo;
      if (m.plan.cortesDeSenal && fraccion > 0.35 && fraccion < 0.55) continue;
      const punto = puntoEnRecorrido(m.ruta, m.metros);
      await ubicacion.registrar(m.conductorId, m.viajeId, {
        ...punto,
        precision_m: 5,
        origen: 'simulador',
      });
    }
  }

  return {
    paso,
    get activo() {
      return temporizador !== null || micros.length > 0;
    },

    /** Pone en circulación las micros del plan. Si ya estaban, no hace nada. */
    async iniciar({ automatico = true } = {}) {
      if (micros.length > 0) return this.estado();
      for (const [i, plan] of PLAN.entries()) {
        const vehiculo = await Vehiculo.findOne({ where: { identificador: plan.vehiculo } });
        const conductorId = await conductorDemo(i + 1);
        // Si quedó algo de una simulación anterior (por ejemplo, al reiniciar el servidor), se cierra.
        await Turno.update(
          { estado: 'finalizado', termino_real: ahoraISO() },
          { where: { vehiculo_id: vehiculo.id, estado: 'en_curso' } },
        );
        await Viaje.update(
          { estado: 'finalizado', termino_real: ahoraISO() },
          { where: { estado: 'en_curso', turno_id: { [Op.in]: await turnosDe(vehiculo.id) } } },
        );
        const inicio = ahora();
        const turno = await Turno.create({
          conductor_id: conductorId,
          vehiculo_id: vehiculo.id,
          inicio_planificado: inicio.toISOString(),
          termino_planificado: new Date(inicio.getTime() + 8 * 60 * 60 * 1000).toISOString(),
          inicio_real: inicio.toISOString(),
          estado_vehiculo_recibido: vehiculo.estado_operativo,
          estado: 'en_curso',
        });
        const r = await recorrido(plan.linea, plan.sentido);
        const viajeId = await nuevoViaje(turno.id, r.id, 1);
        micros.push({
          plan,
          conductorId,
          turnoId: turno.id,
          viajeId,
          recorridoId: r.id,
          ruta: r.ruta,
          largo: r.largo,
          metros: r.largo * plan.inicio,
          vueltas: 0,
        });
      }
      await paso(0); // primera posición de inmediato
      if (automatico) {
        temporizador = setInterval(() => {
          paso().catch((err) => console.error('Simulador de flota:', err));
        }, INTERVALO_MS);
      }
      return this.estado();
    },

    /** Detiene la simulación: cierra los viajes y turnos de demostración. */
    async detener() {
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
      for (const m of micros) {
        await cerrarViaje(m.viajeId);
        await Turno.update(
          { estado: 'finalizado', termino_real: ahoraISO() },
          { where: { id: m.turnoId } },
        );
      }
      micros = [];
      return this.estado();
    },

    /**
     * Cierra lo que haya dejado una simulación anterior (por ejemplo, si se apagó el servidor
     * con micros en circulación), para que no queden "circulando" para siempre.
     */
    async limpiarRestos() {
      const demos = await Usuario.findAll({
        where: { correo: { [Op.like]: 'demo.conductor%@voybus.cl' } },
        attributes: ['id'],
      });
      const turnos = await Turno.findAll({
        where: { conductor_id: { [Op.in]: demos.map((d) => d.id) }, estado: 'en_curso' },
      });
      for (const t of turnos) {
        const viajes = await Viaje.findAll({ where: { turno_id: t.id, estado: 'en_curso' } });
        for (const v of viajes) await cerrarViaje(v.id);
        await t.update({ estado: 'finalizado', termino_real: ahoraISO() });
      }
      return turnos.length;
    },

    estado() {
      return {
        activa: micros.length > 0,
        vehiculos: micros.map((m) => ({
          identificador: m.plan.vehiculo,
          linea: m.plan.linea,
          viaje_id: m.viajeId,
          avance: Math.round((m.metros / m.largo) * 100),
        })),
      };
    },
  };

  async function turnosDe(vehiculoId) {
    const turnos = await Turno.findAll({ where: { vehiculo_id: vehiculoId }, attributes: ['id'] });
    return turnos.map((t) => t.id);
  }
}

module.exports = { createSimuladorFlota };
