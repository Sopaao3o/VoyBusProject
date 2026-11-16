import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { EstadoVehiculoBody } from '../api/tipos';
import { colors } from '../theme/colors';
import { Boton, Campo, Selector } from './Formulario';

const OPCIONES_ESTADO: { valor: EstadoVehiculoBody['estado_vehiculo']; titulo: string }[] = [
  { valor: 'operativo', titulo: 'Operativo' },
  { valor: 'operativo_con_observaciones', titulo: 'Operativo con observaciones' },
  { valor: 'fuera_de_servicio', titulo: 'Fuera de servicio' },
];

/** Formulario del estado del vehículo (al iniciar, al finalizar o al informar un cambio). */
export function PanelEstadoVehiculo({
  titulo,
  textoBoton,
  enviando,
  onEnviar,
  onCancelar,
}: {
  titulo: string;
  textoBoton: string;
  enviando: boolean;
  onEnviar: (body: EstadoVehiculoBody) => void;
  onCancelar: () => void;
}) {
  const [estado, setEstado] = useState<EstadoVehiculoBody['estado_vehiculo']>('operativo');
  const [descripcion, setDescripcion] = useState('');
  const necesitaDescripcion = estado !== 'operativo';

  return (
    <View style={styles.panel}>
      <Text style={styles.titulo}>{titulo}</Text>
      <Selector
        etiqueta="Estado del vehículo"
        valor={estado}
        onCambio={setEstado}
        opciones={OPCIONES_ESTADO}
      />
      {necesitaDescripcion && (
        <Campo
          etiqueta="Describe el problema"
          value={descripcion}
          onChangeText={setDescripcion}
          multiline
          autoCapitalize="sentences"
          maxLength={500}
        />
      )}
      <Boton
        titulo={textoBoton}
        deshabilitado={enviando || (necesitaDescripcion && descripcion.trim() === '')}
        onPress={() =>
          onEnviar({
            estado_vehiculo: estado,
            ...(necesitaDescripcion && { descripcion: descripcion.trim() }),
          })
        }
      />
      <Boton titulo="Cancelar" variante="secundario" onPress={onCancelar} />
    </View>
  );
}

/** Formulario de un texto libre (justificación de atraso). */
export function PanelTexto({
  titulo,
  etiqueta,
  textoBoton,
  enviando,
  onEnviar,
  onCancelar,
}: {
  titulo: string;
  etiqueta: string;
  textoBoton: string;
  enviando: boolean;
  onEnviar: (texto: string) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState('');
  return (
    <View style={styles.panel}>
      <Text style={styles.titulo}>{titulo}</Text>
      <Campo
        etiqueta={etiqueta}
        value={texto}
        onChangeText={setTexto}
        multiline
        autoCapitalize="sentences"
        maxLength={500}
      />
      <Boton
        titulo={textoBoton}
        deshabilitado={enviando || texto.trim() === ''}
        onPress={() => onEnviar(texto.trim())}
      />
      <Boton titulo="Cancelar" variante="secundario" onPress={onCancelar} />
    </View>
  );
}

/** Formulario de incidencia (del vehículo o del recorrido). */
export function PanelIncidencia({
  enviando,
  onEnviar,
  onCancelar,
}: {
  enviando: boolean;
  onEnviar: (tipo: 'vehiculo' | 'recorrido', descripcion: string) => void;
  onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState<'vehiculo' | 'recorrido'>('vehiculo');
  const [descripcion, setDescripcion] = useState('');
  return (
    <View style={styles.panel}>
      <Text style={styles.titulo}>Registrar incidencia</Text>
      <Selector
        etiqueta="Tipo"
        valor={tipo}
        onCambio={setTipo}
        opciones={[
          { valor: 'vehiculo', titulo: 'Del vehículo' },
          { valor: 'recorrido', titulo: 'Del recorrido' },
        ]}
      />
      <Campo
        etiqueta="Descripción"
        value={descripcion}
        onChangeText={setDescripcion}
        multiline
        autoCapitalize="sentences"
        maxLength={500}
      />
      <Boton
        titulo="Registrar incidencia"
        deshabilitado={enviando || descripcion.trim() === ''}
        onPress={() => onEnviar(tipo, descripcion.trim())}
      />
      <Boton titulo="Cancelar" variante="secundario" onPress={onCancelar} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  titulo: { fontSize: 17, fontWeight: '700', color: colors.text },
});
