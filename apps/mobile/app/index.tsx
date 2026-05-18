import { Redirect } from 'expo-router';
// Entrée racine — la redirection est gérée par _layout selon la session
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
