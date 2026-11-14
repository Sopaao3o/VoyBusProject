import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Boton } from '../../src/components/Formulario';
import { useUsuario } from '../../src/session/UsuarioContext';
import { colors } from '../../src/theme/colors';

const ROL: Record<string, string> = {
  pasajero: 'Pasajero',
  conductor: 'Conductor',
  administrador: 'Administrador',
};

// Pestaña Cuenta: iniciar sesión o crear cuenta (ACC-01, ACC-02) y, con sesión iniciada,
// seguridad de la cuenta (2FA, contraseña) y cierre de sesión (ACC-03).
export default function CuentaScreen() {
  const router = useRouter();
  const { usuario, cerrarSesion } = useUsuario();
  const [cerrando, setCerrando] = useState(false);

  if (!usuario) {
    return (
      <ScrollView contentContainerStyle={styles.pantalla}>
        <Text style={styles.titulo}>Tu cuenta</Text>
        <Text style={styles.ayuda}>
          Puedes consultar líneas y paraderos sin cuenta. Para solicitar paradas o gestionar turnos,
          inicia sesión.
        </Text>
        <Boton titulo="Iniciar sesión" onPress={() => router.push('/login')} />
        <Boton
          titulo="Crear cuenta de pasajero"
          variante="secundario"
          onPress={() => router.push('/registro')}
        />
      </ScrollView>
    );
  }

  const esInvitado = usuario.tipo_acceso === 'invitado';

  const confirmarCierre = () =>
    Alert.alert('Cerrar sesión', '¿Quieres cerrar tu sesión en este dispositivo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          setCerrando(true);
          await cerrarSesion();
          setCerrando(false);
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.pantalla}>
      <View style={styles.tarjeta}>
        <Text style={styles.nombre}>{usuario.nombre}</Text>
        <Text style={styles.rol}>
          {ROL[usuario.rol] ?? usuario.rol}
          {esInvitado ? ' · invitado' : ''}
        </Text>
        {usuario.correo && <Text style={styles.contacto}>{usuario.correo}</Text>}
        {usuario.telefono && <Text style={styles.contacto}>{usuario.telefono}</Text>}
      </View>

      {esInvitado ? (
        <>
          <Text style={styles.ayuda}>
            Estás como invitado: la cuenta es temporal. Crea una cuenta para conservar tus datos.
          </Text>
          <Boton titulo="Crear cuenta de pasajero" onPress={() => router.push('/registro')} />
        </>
      ) : (
        <>
          <Text style={styles.subtitulo}>Seguridad</Text>
          <Text style={styles.ayuda}>
            Verificación en dos pasos: {usuario.dos_factores_activo ? 'activada' : 'desactivada'}.
          </Text>
          <Boton
            titulo={
              usuario.dos_factores_activo
                ? 'Desactivar verificación en dos pasos'
                : 'Activar verificación en dos pasos'
            }
            variante="secundario"
            onPress={() => router.push('/dos-factores')}
          />
          <Boton
            titulo="Cambiar contraseña"
            variante="secundario"
            onPress={() => router.push('/cambiar-password')}
          />
        </>
      )}

      <Boton
        titulo={cerrando ? 'Cerrando sesión…' : 'Cerrar sesión'}
        variante="peligro"
        onPress={confirmarCierre}
        deshabilitado={cerrando}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: { padding: 16, gap: 12, paddingBottom: 40 },
  titulo: { fontSize: 20, fontWeight: '700', color: colors.text },
  subtitulo: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 6 },
  ayuda: { color: colors.textMuted },
  tarjeta: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, gap: 2 },
  nombre: { fontSize: 20, fontWeight: '700', color: colors.surface },
  rol: { fontSize: 14, fontWeight: '600', color: colors.surface, opacity: 0.9 },
  contacto: { fontSize: 14, color: colors.surface, opacity: 0.9 },
});
