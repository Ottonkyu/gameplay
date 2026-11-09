import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function Index() {
  const { session, recovery } = useAuth();
  if (recovery) return <Redirect href="/reset-password" />;
  return <Redirect href={session ? '/home' : '/welcome'} />;
}
