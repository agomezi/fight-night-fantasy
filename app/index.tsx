import { Redirect } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../context/ProfileContext";

export default function Index() {
  const { session } = useAuth();
  const { needsOnboarding } = useProfile();
  return <Redirect href={!session ? "/login" : needsOnboarding ? "/onboarding" : "/home"} />;
}
