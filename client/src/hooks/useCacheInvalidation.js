import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheClearByPrefix } from "../lib/queryCache";

export function useCacheInvalidation(userId) {
  const [refreshKey, setRefreshKey] = useState(0);

  const clearCache = useCallback(() => {
    if (userId) {
      cacheClearByPrefix(`bsync:${userId}:`);
      setRefreshKey(k => k + 1);
    }
  }, [userId]);

  useEffect(() => {
    window.addEventListener("bsync:data-changed", clearCache);
    return () => window.removeEventListener("bsync:data-changed", clearCache);
  }, [clearCache]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`cache-inv-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` }, clearCache)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` }, clearCache)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "transactions" }, clearCache)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_categories", filter: `user_id=eq.${userId}` }, clearCache)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId, clearCache]);

  return refreshKey;
}
