import { createContext, useContext, useEffect, useState } from "react";
import { Alert, AppState } from "react-native";
import { ACTIVE, BANNED_MESSAGE, BANNED_TITLE, loadStanding, type Standing } from "../services/standing";
import { supabase } from "../services/supabase";
import { useAuth } from "./AuthContext";

const StandingContext = createContext<Standing>(ACTIVE);

/*
 * The signed-in player's standing, checked at launch and whenever the app
 * comes back to the foreground.
 *
 * A ban stops sign-in and token refresh, but a session already open stays
 * valid until it expires, up to an hour. So a banned player is signed out
 * here as soon as the app sees it, and told why. A suspended player stays in
 * and the screens show it.
 */
export function StandingProvider({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;
  const [standing, setStanding] = useState<Standing>(ACTIVE);

  useEffect(() => {
    setStanding(ACTIVE);
    if (!userId) return;
    let current = true;
    const check = () => {
      loadStanding()
        .then((s) => {
          if (!current) return;
          setStanding(s);
          if (s.standing === "banned") {
            current = false;
            Alert.alert(BANNED_TITLE, BANNED_MESSAGE);
            // If the server won't sign them out, clearing this phone's
            // session is enough: it can't be refreshed.
            signOut().catch(() => supabase.auth.signOut({ scope: "local" }).catch(() => {}));
          }
        })
        // Offline: keep what we knew. The server refuses anything a
        // restricted player tries either way.
        .catch(() => {});
    };
    check();
    const sub = AppState.addEventListener("change", (state) => state === "active" && check());
    return () => {
      current = false;
      sub.remove();
    };
  }, [userId, signOut]);

  return <StandingContext.Provider value={standing}>{children}</StandingContext.Provider>;
}

export function useStanding(): Standing {
  return useContext(StandingContext);
}
