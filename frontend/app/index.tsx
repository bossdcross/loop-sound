import { Redirect } from 'expo-router';

export default function Index() {
  // Redirect directly to home tab - no auth required
  return <Redirect href="/(tabs)/home" />;
}
