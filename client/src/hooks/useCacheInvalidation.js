import { useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheClearByPrefix } from "../lib/queryCache";

export function useCacheInvalidation(userId) {
  const clearCache = useCallback(() => {
    if (userId) {
      cacheClearByPrefix(`bsync:${userId}:`);
      window.dispatchEvent(new CustomEvent("bsync:data-changed"));
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`cache-inv-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` }, clearCache)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_categories", filter: `user_id=eq.${userId}` }, clearCache)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId, clearCache]);
}
