import { Redirect } from 'expo-router';

export default function Index() {
  // For now, always redirect to onboarding. 
  // Later, we will check Auth state here and redirect to (tabs) if authenticated.
  return <Redirect href="/(auth)/onboarding" />;
}
