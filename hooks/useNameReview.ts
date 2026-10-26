import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadNameReview, shouldOfferRename, type NameReview } from "../services/nameReview";

const skippedKey = (userId: string) => `nameReviewSkipped:${userId}`;

/** Whether Home should offer a rename because reports hide your name. Checked
 * on focus at most once a minute. "Keep it for now" puts it off for the rest
 * of that case, remembered on this phone by the case's tag. */
export function useNameReview(userId: string | undefined) {
  const [review, setReview] = useState<NameReview | null>(null);
  const [skipped, setSkipped] = useState<number | null>(null);
  const [skipRead, setSkipRead] = useState(false);
  const fetched = useRef({ key: "", at: 0 });

  useEffect(() => {
    let current = true;
    setReview(null);
    setSkipped(null);
    setSkipRead(false);
    if (!userId) return;
    AsyncStorage.getItem(skippedKey(userId))
      .then((v) => {
        if (current) setSkipped(v ? Number(v) : null);
      })
      .catch(() => {})
      .finally(() => {
        if (current) setSkipRead(true);
      });
    return () => {
      current = false;
    };
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      const last = fetched.current;
      if (last.key === userId && Date.now() - last.at < 60_000) return;
      let current = true;
      loadNameReview()
        .then((r) => {
          if (!current) return;
          fetched.current = { key: userId, at: Date.now() };
          setReview(r);
        })
        .catch(() => {});
      return () => {
        current = false;
      };
    }, [userId])
  );

  const skip = useCallback(() => {
    const alias = review?.alias ?? null;
    setSkipped(alias);
    if (userId && alias) AsyncStorage.setItem(skippedKey(userId), String(alias)).catch(() => {});
  }, [review, userId]);

  const renamed = useCallback(() => {
    setReview((r) => (r ? { ...r, hidden: false, renamed: true } : r));
  }, []);

  return { offer: skipRead && shouldOfferRename(review, skipped), alias: review?.alias ?? null, skip, renamed };
}
