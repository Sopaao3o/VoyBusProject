import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
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
import { Vibration } from 'react-native';

import { alertasDeParada } from '../api/conductor';
import type { AlertasParada, ParaderoSolicitado } from '../api/tipos';
import { INTERVALO_MS, useGpsConductor } from './GpsConductor';

// VEH-02: mientras el conductor tiene un viaje en curso, la app consulta cada 5 segundos si
// hay solicitudes de parada nuevas. Cuando llegan, avisa con vibración y sonido y muestra una
// franja arriba que no bloquea la pantalla ni pide confirmación, y que se va sola.
// El servidor marca cada aviso como entregado: no se repite, tampoco al reconectarse.

/** Cuánto se ve la franja del aviso. */
const DURACION_AVISO_MS = 8000;
const VIBRACION = [0, 350, 150, 350];

export interface Aviso {
  /** Paraderos con solicitudes nuevas, con cuántas son nuevas y el total del paradero. */
  paraderos: (ParaderoSolicitado & { nuevas: number })[];
  /** Para distinguir un aviso del siguiente (reinicia el tiempo en pantalla). */
  numero: number;
}

interface Contexto {
  /** Paraderos con solicitudes pendientes, en el orden del recorrido. */
  pendientes: ParaderoSolicitado[];
  /** El aviso que se está mostrando, o null. */
  aviso: Aviso | null;
  cerrarAviso: () => void;
}

const AlertasContext = createContext<Contexto | null>(null);

export function AlertasParadaProvider({ children }: { children: ReactNode }) {
  const { viajeId } = useGpsConductor();
  const [datos, setDatos] = useState<AlertasParada | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const sonido = useRef<AudioPlayer | null>(null);
  const contador = useRef(0);

  // El sonido se prepara una vez y suena aunque el teléfono esté en silencio (iOS).
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    sonido.current = createAudioPlayer(require('../../assets/sonidos/parada.wav'));
    return () => sonido.current?.remove();
  }, []);

  const avisar = useCallback((paraderos: Aviso['paraderos']) => {
    contador.current += 1;
    setAviso({ paraderos, numero: contador.current });
    Vibration.vibrate(VIBRACION);
    const reproductor = sonido.current;
    if (reproductor) {
      void reproductor.seekTo(0).then(() => reproductor.play());
    }
  }, []);

  // Consulta periódica durante el viaje en curso.
  useEffect(() => {
    if (viajeId === null) return undefined;
    let vigente = true;
    const consultar = async () => {
      try {
        const r = await alertasDeParada(viajeId);
        if (!vigente) return;
        setDatos(r);
        if (r.nuevas.length > 0) avisar(r.nuevas);
      } catch {
        // Sin conexión: se vuelve a intentar en la próxima consulta. Al reconectarse, el
        // servidor entrega solo lo que no se avisó y que todavía está por delante.
      }
    };
    void consultar();
    const t = setInterval(consultar, INTERVALO_MS);
    return () => {
      vigente = false;
      clearInterval(t);
    };
  }, [viajeId, avisar]);

  // La franja se va sola después de unos segundos.
  const numeroAviso = aviso?.numero;
  useEffect(() => {
    if (numeroAviso === undefined) return undefined;
    const t = setTimeout(() => setAviso(null), DURACION_AVISO_MS);
    return () => clearTimeout(t);
  }, [numeroAviso]);

  const cerrarAviso = useCallback(() => setAviso(null), []);
  const valor = useMemo(
    () => ({
      // Sin viaje en curso no hay nada que mostrar (aunque quede la última respuesta guardada).
      pendientes: viajeId === null ? [] : (datos?.pendientes ?? []),
      aviso: viajeId === null ? null : aviso,
      cerrarAviso,
    }),
    [viajeId, datos, aviso, cerrarAviso],
  );
  return <AlertasContext.Provider value={valor}>{children}</AlertasContext.Provider>;
}

export function useAlertasParada() {
  const contexto = useContext(AlertasContext);
  if (!contexto) throw new Error('useAlertasParada debe usarse dentro de AlertasParadaProvider');
  return contexto;
}
