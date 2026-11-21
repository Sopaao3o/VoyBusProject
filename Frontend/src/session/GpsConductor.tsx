import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Linking } from 'react-native';

import { ApiError } from '../api/client';
import { obtenerLinea } from '../api/red';
import type { AvanceViaje, OrigenUbicacion } from '../api/tipos';
import { enviarUbicacion } from '../api/ubicacion';
import {
  caminoDelRecorrido,
  largoRecorrido,
  puntoEnRecorrido,
  type Punto,
} from '../utils/recorrido';
import { useUsuario } from './UsuarioContext';

// VEH-01: mientras el conductor tiene un viaje en curso, la app envía la ubicación de su
// teléfono cada pocos segundos. Vive en la raíz de la app para que siga enviando aunque el
// conductor cambie de pantalla. Mientras envía, la pantalla no se apaga.

/** Cada cuánto se envía la posición. */
export const INTERVALO_MS = 5000;
/** Sin una lectura del GPS más nueva que esto, se considera que se perdió la señal. */
const SENAL_PERDIDA_MS = 20000;
/** Velocidad del simulador: unos 36 km/h, una micro en la ciudad. */
const VELOCIDAD_SIMULADA_MS = 10;
const ETIQUETA_PANTALLA = 'voybus-gps';

export type EstadoGps =
  | 'inactivo'
  | 'buscando' // esperando la primera lectura del GPS
  | 'activo'
  | 'sin_senal'
  | 'sin_conexion';

export interface ViajeGps {
  viajeId: number;
  lineaId: number;
  recorridoId: number;
}

interface Contexto {
  estado: EstadoGps;
  modo: OrigenUbicacion;
  viajeId: number | null;
  /** Hora del último envío que el servidor recibió. */
  ultimoEnvio: Date | null;
  /** Lo último que respondió el servidor: siguiente paradero, avisos de precisión, etc. */
  avance: AvanceViaje | null;
  /** La última posición que el servidor recibió (para dibujar la micro en el mapa). */
  posicion: Punto | null;
  /**
   * Pide el permiso de ubicación (si falta) y explica cómo darlo si se niega.
   * Se llama antes de iniciar un viaje: sin permiso, el viaje no se inicia.
   */
  asegurarPermiso: () => Promise<boolean>;
  /** Empieza a enviar la ubicación de un viaje en curso. */
  comenzar: (viaje: ViajeGps, modo?: OrigenUbicacion) => Promise<void>;
  /**
   * Retoma el envío de un viaje que ya estaba en curso (por ejemplo, al volver a abrir la app).
   * No pide permisos: si falta el permiso, no hace nada y la pantalla ofrece compartir.
   */
  reanudar: (viaje: ViajeGps, modo?: OrigenUbicacion) => Promise<void>;
  /** Deja de enviar (al finalizar el viaje o cerrar sesión). */
  detener: () => void;
}

const GpsContext = createContext<Contexto | null>(null);

export function GpsConductorProvider({ children }: { children: ReactNode }) {
  const { usuario } = useUsuario();
  const [estado, setEstado] = useState<EstadoGps>('inactivo');
  const [modo, setModo] = useState<OrigenUbicacion>('gps');
  const [viajeId, setViajeId] = useState<number | null>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState<Date | null>(null);
  const [avance, setAvance] = useState<AvanceViaje | null>(null);
  const [posicion, setPosicion] = useState<Punto | null>(null);

  // Lo que usan el temporizador y el GPS entre un envío y otro.
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);
  const suscripcion = useRef<Location.LocationSubscription | null>(null);
  const ultimaLectura = useRef<Location.LocationObject | null>(null);
  const enviando = useRef(false);
  const viajeActivo = useRef<number | null>(null);

  /** Suelta el GPS, el temporizador y el bloqueo de pantalla (sin tocar lo que se muestra). */
  const liberar = useCallback(() => {
    if (temporizador.current) clearInterval(temporizador.current);
    temporizador.current = null;
    suscripcion.current?.remove();
    suscripcion.current = null;
    ultimaLectura.current = null;
    viajeActivo.current = null;
    void deactivateKeepAwake(ETIQUETA_PANTALLA);
  }, []);

  const detener = useCallback(() => {
    liberar();
    setViajeId(null);
    setEstado('inactivo');
    setAvance(null);
    setPosicion(null);
    setUltimoEnvio(null);
  }, [liberar]);

  const asegurarPermiso = useCallback(async () => {
    const actual = await Location.getForegroundPermissionsAsync();
    if (actual.granted) return true;
    const pedido = actual.canAskAgain ? await Location.requestForegroundPermissionsAsync() : actual;
    if (pedido.granted) return true;
    Alert.alert(
      'Ubicación necesaria',
      'Para iniciar el viaje debes permitir que VoyBus use la ubicación del teléfono: así los pasajeros ven la micro y el conductor recibe las paradas a tiempo.',
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
      ],
    );
    return false;
  }, []);

  const comenzar = useCallback(
    async (viaje: ViajeGps, nuevoModo: OrigenUbicacion = 'gps') => {
      detener();
      viajeActivo.current = viaje.viajeId;
      setViajeId(viaje.viajeId);
      setModo(nuevoModo);
      setEstado('buscando');
      void activateKeepAwakeAsync(ETIQUETA_PANTALLA);
      const inicio = Date.now();

      // De dónde sale cada posición: del GPS del teléfono o del recorrido simulado.
      let siguientePosicion: () => { punto: Punto; precision?: number } | null;

      if (nuevoModo === 'gps') {
        try {
          suscripcion.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: INTERVALO_MS, distanceInterval: 5 },
            (lectura) => {
              ultimaLectura.current = lectura;
            },
          );
        } catch {
          // GPS apagado: se sigue intentando y la pantalla muestra "sin señal".
          Alert.alert('GPS apagado', 'Enciende la ubicación del teléfono para compartir el viaje.');
        }
        siguientePosicion = () => {
          const lectura = ultimaLectura.current;
          if (!lectura || Date.now() - lectura.timestamp > SENAL_PERDIDA_MS) return null;
          return {
            punto: { latitud: lectura.coords.latitude, longitud: lectura.coords.longitude },
            precision: lectura.coords.accuracy ?? undefined,
          };
        };
      } else {
        // Simulador (solo desarrollo): avanza por el recorrido a velocidad constante.
        const linea = await obtenerLinea(viaje.lineaId);
        const recorrido = linea.recorridos.find((r) => r.id === viaje.recorridoId);
        // Sigue el trazado por las calles si el recorrido lo tiene.
        const puntos = caminoDelRecorrido(recorrido?.paraderos ?? [], recorrido?.trazado);
        const largo = largoRecorrido(puntos);
        let recorridos = 0;
        siguientePosicion = () => {
          if (puntos.length === 0) return null;
          const punto = puntoEnRecorrido(puntos, recorridos);
          recorridos = Math.min(recorridos + (VELOCIDAD_SIMULADA_MS * INTERVALO_MS) / 1000, largo);
          return { punto, precision: 5 };
        };
      }

      const enviar = async () => {
        if (enviando.current) return; // la anterior todavía no responde
        const posicion = siguientePosicion();
        if (!posicion) {
          // Al empezar se espera un momento la primera lectura; después, es señal perdida.
          setEstado(Date.now() - inicio > SENAL_PERDIDA_MS ? 'sin_senal' : 'buscando');
          return;
        }
        enviando.current = true;
        try {
          const respuesta = await enviarUbicacion(viaje.viajeId, {
            latitud: posicion.punto.latitud,
            longitud: posicion.punto.longitud,
            precision_m: posicion.precision,
            origen: nuevoModo,
          });
          setAvance(respuesta);
          setPosicion(posicion.punto);
          setUltimoEnvio(new Date());
          setEstado('activo');
        } catch (e) {
          if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
            detener(); // el viaje ya no está en curso (se finalizó desde otro lado)
          } else {
            setEstado('sin_conexion'); // se reintenta en el siguiente envío
          }
        } finally {
          enviando.current = false;
        }
      };

      void enviar();
      temporizador.current = setInterval(enviar, INTERVALO_MS);
    },
    [detener],
  );

  const reanudar = useCallback(
    async (viaje: ViajeGps, modoPedido: OrigenUbicacion = 'gps') => {
      if (viajeActivo.current === viaje.viajeId) return;
      if (modoPedido === 'gps') {
        const permiso = await Location.getForegroundPermissionsAsync();
        if (!permiso.granted) return;
      }
      await comenzar(viaje, modoPedido);
    },
    [comenzar],
  );

  // Al cerrar sesión (o si entra otra cuenta) se deja de enviar; al cerrar la app, también.
  const esConductor = usuario?.rol === 'conductor';
  useEffect(() => {
    if (!esConductor) liberar();
  }, [esConductor, liberar]);
  useEffect(() => liberar, [liberar]);

  const valor = useMemo(
    () =>
      esConductor
        ? {
            estado,
            modo,
            viajeId,
            ultimoEnvio,
            avance,
            posicion,
            asegurarPermiso,
            comenzar,
            reanudar,
            detener,
          }
        : {
            estado: 'inactivo' as const,
            modo,
            viajeId: null,
            ultimoEnvio: null,
            avance: null,
            posicion: null,
            asegurarPermiso,
            comenzar,
            reanudar,
            detener,
          },
    [
      esConductor,
      estado,
      modo,
      viajeId,
      ultimoEnvio,
      avance,
      posicion,
      asegurarPermiso,
      comenzar,
      reanudar,
      detener,
    ],
  );
  return <GpsContext.Provider value={valor}>{children}</GpsContext.Provider>;
}

export function useGpsConductor() {
  const contexto = useContext(GpsContext);
  if (!contexto) throw new Error('useGpsConductor debe usarse dentro de GpsConductorProvider');
  return contexto;
}
