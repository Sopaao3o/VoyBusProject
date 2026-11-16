import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { actualizarMargen, obtenerConfiguracion } from '../api/admin';
import { textoDeError } from '../api/client';
import { colors } from '../theme/colors';
import { Boton, Campo } from './Formulario';

/** ADM-03: margen de tolerancia por defecto (los turnos nuevos lo copian y lo conservan). */
export function MargenConfig() {
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    obtenerConfiguracion()
      .then((c) => setTexto(String(c.margen_tolerancia_min)))
      .catch(() => setTexto(''));
  }, []);

  async function guardar() {
    const valor = Number(texto);
    if (texto.trim() === '' || !Number.isInteger(valor) || valor < 0 || valor > 120) {
      Alert.alert('Margen no válido', 'Escribe un número entero de minutos entre 0 y 120.');
      return;
    }
    setGuardando(true);
    try {
      await actualizarMargen(valor);
      Alert.alert('Listo', 'El margen se aplicará a los turnos que crees desde ahora.');
    } catch (e) {
      Alert.alert('No se pudo guardar', textoDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.tarjeta}>
      <Text style={styles.titulo}>Margen de tolerancia</Text>
      <Campo
        etiqueta="Minutos permitidos de atraso o término anticipado"
        value={texto}
        onChangeText={setTexto}
        keyboardType="number-pad"
        ayuda="Cada turno guarda el margen vigente al crearlo."
      />
      <Boton
        titulo="Guardar margen"
        variante="secundario"
        onPress={guardar}
        deshabilitado={guardando}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.text },
});
