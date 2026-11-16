import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '../theme/colors';

export function Campo({
  etiqueta,
  ayuda,
  ...props
}: { etiqueta: string; ayuda?: string } & TextInputProps) {
  return (
    <View style={styles.campo}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={etiqueta}
        {...props}
      />
      {ayuda && <Text style={styles.ayuda}>{ayuda}</Text>}
    </View>
  );
}

/** Campo de contraseña con un botón para mostrarla u ocultarla (ACC-02). */
export function CampoPassword({
  etiqueta,
  ayuda,
  ...props
}: { etiqueta: string; ayuda?: string } & TextInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.campo}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <View style={styles.filaPassword}>
        <TextInput
          style={[styles.input, styles.inputPassword]}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={etiqueta}
          {...props}
          secureTextEntry={!visible}
        />
        <Pressable
          style={styles.ojo}
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          hitSlop={8}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={22}
            color={colors.textMuted}
          />
        </Pressable>
      </View>
      {ayuda && <Text style={styles.ayuda}>{ayuda}</Text>}
    </View>
  );
}

export interface Opcion<T> {
  valor: T;
  titulo: string;
  detalle?: string;
  deshabilitada?: boolean;
}

/** Lista de opciones donde se elige una (conductor, vehículo, recorrido...). */
export function Selector<T extends string | number>({
  etiqueta,
  opciones,
  valor,
  onCambio,
}: {
  etiqueta: string;
  opciones: Opcion<T>[];
  valor: T | null;
  onCambio: (v: T) => void;
}) {
  return (
    <View style={styles.campo}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <View style={styles.opciones}>
        {opciones.map((o) => {
          const activa = o.valor === valor;
          return (
            <Pressable
              key={String(o.valor)}
              disabled={o.deshabilitada}
              onPress={() => onCambio(o.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: activa, disabled: o.deshabilitada }}
              style={[
                styles.opcion,
                activa && styles.opcionActiva,
                o.deshabilitada && styles.opcionDeshabilitada,
              ]}
            >
              <Text style={[styles.opcionTitulo, activa && styles.textoActivo]}>{o.titulo}</Text>
              {o.detalle && (
                <Text style={[styles.opcionDetalle, activa && styles.textoActivo]}>
                  {o.detalle}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  deshabilitado,
}: {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario' | 'peligro';
  deshabilitado?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityState={{ disabled: deshabilitado }}
      style={[
        styles.boton,
        variante === 'secundario' && styles.botonSecundario,
        variante === 'peligro' && styles.botonPeligro,
        deshabilitado && styles.botonDeshabilitado,
      ]}
    >
      <Text style={[styles.botonTexto, variante === 'secundario' && styles.botonTextoSecundario]}>
        {titulo}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  campo: { gap: 6 },
  etiqueta: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  ayuda: { fontSize: 12, color: colors.textMuted },
  filaPassword: { justifyContent: 'center' },
  inputPassword: { paddingRight: 46 },
  ojo: { position: 'absolute', right: 12 },
  opciones: { gap: 8 },
  opcion: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  opcionActiva: { backgroundColor: colors.primary, borderColor: colors.primary },
  opcionDeshabilitada: { opacity: 0.45 },
  opcionTitulo: { fontSize: 15, fontWeight: '600', color: colors.text },
  opcionDetalle: { fontSize: 12, color: colors.textMuted },
  textoActivo: { color: colors.surface },
  boton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  botonSecundario: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 },
  botonPeligro: { backgroundColor: colors.accent },
  botonDeshabilitado: { opacity: 0.5 },
  botonTexto: { color: colors.surface, fontWeight: '700', fontSize: 16 },
  botonTextoSecundario: { color: colors.primary },
});
