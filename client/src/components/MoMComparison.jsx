import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheGet, cacheSet, cacheKey } from "../lib/queryCache";

const fmt = (n) => `$${Math.round(n).toLocaleString()}`;

function prevMonthOf(m) {
    const [y, mo] = m.split("-");
    const d = new Date(parseInt(y), parseInt(mo) - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MoMComparison({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [], refreshKey = 0 }) {
    const prevMonth = useMemo(() => prevMonthOf(selectedMonth), [selectedMonth]);

    const [rawCurrent, setRawCurrent] = useState([]);
    const [rawPrev, setRawPrev] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const curKey = cacheKey(user.id, "monthly_spend", selectedMonth);
            const prvKey = cacheKey(user.id, "monthly_spend", prevMonth);
            const cachedCur = cacheGet(curKey);
            const cachedPrv = cacheGet(prvKey);

            if (cachedCur && cachedPrv) {
                setRawCurrent(cachedCur);
                setRawPrev(cachedPrv);
                setLoading(false);
                return;
            }

            const [{ data: cur }, { data: prv }] = await Promise.all([
                supabase.from("monthly_category_spend").select("category, total_spent, self_spent").eq("user_id", user.id).eq("month", selectedMonth),
                supabase.from("monthly_category_spend").select("category, total_spent, self_spent").eq("user_id", user.id).eq("month", prevMonth),
            ]);

            const current = cur || [];
            const prev = prv || [];
            cacheSet(curKey, current);
            cacheSet(prvKey, prev);
            setRawCurrent(current);
            setRawPrev(prev);
            setLoading(false);
        };
        fetch();
    }, [selectedMonth, prevMonth, refreshKey]);

    const rows = useMemo(() => {
        const spendKey = viewMode === "household" ? "total_spent" : "self_spent";
        const filter = (d) => !alwaysExcludedCategories.includes(d.category) && (!excludeSpecial || !specialCategories.includes(d.category));

        const cats = new Set([
            ...rawCurrent.filter(filter).map(d => d.category),
            ...rawPrev.filter(filter).map(d => d.category),
        ]);

        return Array.from(cats).map(cat => {
            const cur = rawCurrent.filter(d => d.category === cat).reduce((s, d) => s + (d[spendKey] || 0), 0);
            const prv = rawPrev.filter(d => d.category === cat).reduce((s, d) => s + (d[spendKey] || 0), 0);
            return { cat, cur, prv, delta: cur - prv };
        }).filter(r => r.cur > 0 || r.prv > 0)
          .sort((a, b) => b.cur - a.cur);
    }, [rawCurrent, rawPrev, viewMode, alwaysExcludedCategories, excludeSpecial, specialCategories]);

    const maxVal = useMemo(() => Math.max(...rows.flatMap(r => [r.cur, r.prv]), 1), [rows]);

    const prevLabel = useMemo(() => {
        const [y, m] = prevMonth.split("-");
        return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-US", { month: "short" });
    }, [prevMonth]);

    const curLabel = useMemo(() => {
        const [y, m] = selectedMonth.split("-");
        return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-US", { month: "short" });
    }, [selectedMonth]);

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-4 sm:px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Month-over-Month</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Spending by category</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-1.5 rounded-full bg-gray-200 inline-block" />{prevLabel}</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-1.5 rounded-full bg-indigo-400 inline-block" />{curLabel}</span>
                </div>
            </div>

            {!loading && rows.length === 0 ? (
                <div className="px-4 sm:px-6 py-12 text-center text-sm text-gray-400">No spending data</div>
            ) : (
                <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                    {rows.map(({ cat, cur, prv, delta }) => {
                        const significant = Math.abs(delta) > 30;

                        return (
                            <div
                                key={cat}
                                className="py-2"
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm font-medium text-gray-700">{cat}</span>
                                    <div className="flex items-center gap-2">
                                        {significant && (
                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                                delta > 0 ? "bg-rose-50 text-rose-500" : "bg-green-50 text-green-600"
                                            }`}>
                                                {delta > 0 ? "↑" : "↓"} {fmt(Math.abs(delta))}
                                            </span>
                                        )}
                                        <span className="text-xs tabular-nums text-gray-500">{fmt(cur)}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-gray-300 rounded-full transition-all duration-500" style={{ width: `${(prv / maxVal) * 100}%` }} />
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-400 rounded-full transition-all duration-500" style={{ width: `${(cur / maxVal) * 100}%` }} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
