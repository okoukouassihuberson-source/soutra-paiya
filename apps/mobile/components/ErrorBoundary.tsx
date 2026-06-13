import { Component, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/**
 * Error Boundary global de l'app mobile.
 *
 * Capture toute exception React qui remonte sans handler (notamment les
 * imports natifs manquants — historiquement la cause de l'écran blanc sur
 * /scan quand react-native-svg n'était pas installé). Affiche un écran de
 * secours lisible avec :
 *   • un message court compréhensible par l'utilisateur,
 *   • un bouton "Réessayer" qui reset l'état du boundary,
 *   • le détail technique de l'erreur en mode dev (__DEV__) pour debug.
 *
 * Les erreurs sont aussi loggées via console.error pour qu'elles apparaissent
 * dans le bundler Metro et les outils de monitoring (Sentry/Crashlytics si
 * branchés plus tard).
 */
interface Props {
  children: ReactNode;
  /** Nom de la zone protégée — utilisé dans le log et l'UI. */
  zone?: string;
  /** Message utilisateur custom (sinon message générique). */
  fallbackMessage?: string;
}

interface State {
  error: Error | null;
  errorInfo: { componentStack?: string } | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    const zone = this.props.zone || 'app';
    console.error(`[ErrorBoundary:${zone}]`, error);
    if (errorInfo.componentStack) {
      console.error(`[ErrorBoundary:${zone}] stack:`, errorInfo.componentStack);
    }
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const message =
      this.props.fallbackMessage ||
      "Une erreur est survenue. Réessaie ou redémarre l'application.";

    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.iconWrap}>
            <Ionicons name="alert-circle" size={64} color="#dc2626" />
          </View>
          <Text style={styles.title}>Oups</Text>
          <Text style={styles.message}>{message}</Text>

          <Pressable
            onPress={this.handleReset}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.btnText}>Réessayer</Text>
          </Pressable>

          {__DEV__ && this.state.error && (
            <View style={styles.devBox}>
              <Text style={styles.devLabel}>DEV — détail technique</Text>
              <Text style={styles.devText}>
                {this.state.error.name}: {this.state.error.message}
              </Text>
              {this.state.errorInfo?.componentStack && (
                <Text style={styles.devStack} numberOfLines={20}>
                  {this.state.errorInfo.componentStack}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  iconWrap: { marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#111' },
  message: { fontSize: 15, color: '#444', textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  btn: {
    marginTop: 12,
    backgroundColor: '#FF6B1A',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  devBox: {
    marginTop: 24,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    width: '100%',
    maxWidth: 480,
  },
  devLabel: { fontSize: 11, fontWeight: '700', color: '#dc2626', marginBottom: 6 },
  devText: { fontSize: 13, color: '#7f1d1d', fontFamily: 'monospace' },
  devStack: { marginTop: 6, fontSize: 11, color: '#7f1d1d', fontFamily: 'monospace' },
});
