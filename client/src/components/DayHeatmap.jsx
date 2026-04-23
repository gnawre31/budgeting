import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheGet, cacheSet, cacheKey } from "../lib/queryCache";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CHART_H = 140;
const MAX_BAR = 108;
const fmt = (n) => `$${Math.round(n).toLocaleString()}`;

export default function DayHeatmap({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [], refreshKey = 0 }) {
    const [rawTxns, setRawTxns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hovered, setHovered] = useState(null);

    // 90-day window ending at end of selectedMonth
    const { start, end } = useMemo(() => {
        const [y, m] = selectedMonth.split("-").map(Number);
        const endDate = new Date(y, m, 0);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 89);
        const fmt2 = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return { start: fmt2(startDate), end: fmt2(endDate) };
    }, [selectedMonth, refreshKey]);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const key = cacheKey(user.id, "heatmap_txns", start, end);
            const cached = cacheGet(key);
            if (cached) { setRawTxns(cached); setLoading(false); return; }

            const { data } = await supabase.from("transactions").select("date, amount, self_amount, partner_amount, user_id, category").eq("type", "Expense").eq("exclude_from_report", false).is("parent_id", null).gte("date", start).lte("date", end).or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`);

            const txns = data || [];
            cacheSet(key, txns);
            setRawTxns(txns);
            setLoading(false);
        };
        fetch();
    }, [start, end]);

    const dayBuckets = useMemo(() => {
        const filtered = rawTxns
            .filter(tx => !alwaysExcludedCategories.includes(tx.category))
            .filter(tx => !excludeSpecial || !specialCategories.includes(tx.category));

        // dow 0=Sun,1=Mon,...6=Sat → remap to Mon=0..Sun=6
        const sums = Array(7).fill(0);
        const counts = Array(7).fill(0);

        filtered.forEach(tx => {
            const d = new Date(tx.date + "T00:00:00");
            const dow = (d.getDay() + 6) % 7; // Mon=0
            const amt = viewMode === "household" ? (tx.amount || 0) : (tx.self_amount || 0);
            sums[dow] += amt;
            counts[dow]++;
        });

        return DAYS.map((label, i) => ({
            label,
            avg: counts[i] > 0 ? sums[i] / counts[i] : 0,
            count: counts[i],
        }));
    }, [rawTxns, viewMode, alwaysExcludedCategories, excludeSpecial, specialCategories]);

    const maxAvg = useMemo(() => Math.max(...dayBuckets.map(d => d.avg), 1), [dayBuckets]);
    const peakIdx = useMemo(() => {
        let best = 0;
        dayBuckets.forEach((d, i) => { if (d.avg > dayBuckets[best].avg) best = i; });
        return best;
    }, [dayBuckets]);

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden h-full">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Spending by Day</h2>
                <p className="text-sm text-gray-500 mt-0.5">Avg daily spend (90 days)</p>
            </div>

            <div className="px-6 py-5">
                <div className="flex items-end gap-2" style={{ height: `${CHART_H}px` }}>
                    {dayBuckets.map((d, i) => {
                        const intensity = maxAvg > 0 ? d.avg / maxAvg : 0;
                        const barH = Math.max(d.avg > 0 ? 8 : 0, Math.round(intensity * MAX_BAR));
                        const isPeak = i === peakIdx && d.avg > 0;
                        const isHov = hovered === i;
                        const color = isPeak
                            ? "#6366f1"
                            : `rgba(99,102,241,${(0.10 + intensity * 0.45).toFixed(2)})`;

                        return (
                            <div
                                key={d.label}
                                className="flex-1 flex flex-col items-center justify-end h-full gap-1 relative group cursor-default"
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                {isHov && d.avg > 0 && (
                                    <div className="absolute bottom-full mb-2 bg-gray-900 text-white text-[11px] font-medium px-2 py-1 rounded-lg whitespace-nowrap z-10">
                                        {fmt(d.avg)}/day
                                    </div>
                                )}
                                <div
                                    className="w-full rounded-t-lg transition-all duration-300"
                                    style={{ height: `${barH}px`, background: color }}
                                />
                            </div>
                        );
                    })}
                </div>

                <div className="flex gap-2 mt-3 border-t border-gray-100 pt-3">
                    {dayBuckets.map((d, i) => {
                        const isPeak = i === peakIdx && d.avg > 0;
                        return (
                            <div key={d.label} className="flex-1 text-center">
                                <span className={`text-[11px] font-${isPeak ? "semibold" : "medium"} ${isPeak ? "text-indigo-600" : "text-gray-400"}`}>
                                    {d.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
