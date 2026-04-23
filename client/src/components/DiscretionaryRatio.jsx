import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheGet, cacheSet, cacheKey, applyPartnerSplits } from "../lib/queryCache";

const fmt = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

export default function DiscretionaryRatio({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [], fixedCategories = [], splitRules = {}, refreshKey = 0 }) {
    const [rawExpenses, setRawExpenses] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const key = cacheKey(user.id, "monthly_spend", selectedMonth);
            const cached = cacheGet(key);
            if (cached) { setRawExpenses(cached); setLoading(false); return; }

            const { data } = await supabase.from("monthly_category_spend").select("category, total_spent, self_spent").eq("user_id", user.id).eq("month", selectedMonth);
            const expenses = data || [];
            cacheSet(key, expenses);
            setRawExpenses(expenses);
            setLoading(false);
        };
        fetch();
    }, [selectedMonth, refreshKey]);

    const { fixed, variable, total } = useMemo(() => {
        const spendKey = viewMode === "household" ? "total_spent" : "self_spent";
        const filtered = applyPartnerSplits(rawExpenses, splitRules)
            .filter(d => !alwaysExcludedCategories.includes(d.category))
            .filter(d => !excludeSpecial || !specialCategories.includes(d.category));

        const fixed = filtered.filter(d => fixedCategories.includes(d.category)).reduce((s, d) => s + (d[spendKey] || 0), 0);
        const variable = filtered.filter(d => !fixedCategories.includes(d.category)).reduce((s, d) => s + (d[spendKey] || 0), 0);
        return { fixed, variable, total: fixed + variable };
    }, [rawExpenses, viewMode, alwaysExcludedCategories, excludeSpecial, specialCategories, fixedCategories, splitRules]);

    const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
    const varPct = total > 0 ? (variable / total) * 100 : 0;

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden h-full">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Fixed vs Variable</h2>
                <p className="text-sm text-gray-500 mt-0.5">Discretionary breakdown</p>
            </div>

            <div className="px-6 py-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">Fixed</p>
                        <p className="text-xl font-semibold text-indigo-600 tabular-nums">{fmt(fixed)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{fixedPct.toFixed(0)}% of spend</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">Variable</p>
                        <p className="text-xl font-semibold text-rose-400 tabular-nums">{fmt(variable)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{varPct.toFixed(0)}% of spend</p>
                    </div>
                </div>

                {total > 0 && (
                    <div>
                        <div className="h-2.5 rounded-full overflow-hidden flex bg-gray-100">
                            <div className="h-full bg-indigo-300 transition-all duration-700" style={{ width: `${fixedPct}%` }} />
                            <div className="h-full bg-rose-200 transition-all duration-700" style={{ width: `${varPct}%` }} />
                        </div>
                        <div className="flex justify-between mt-1.5 text-[11px] text-gray-400">
                            <span>{fixedPct.toFixed(0)}% fixed</span>
                            <span>{fmt(total)} total</span>
                            <span>{varPct.toFixed(0)}% variable</span>
                        </div>
                    </div>
                )}

                {total === 0 && !loading && (
                    <p className="text-sm text-gray-400 text-center py-4">No spending data</p>
                )}
            </div>
        </div>
    );
}
