import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheGet, cacheSet, cacheKey } from "../lib/queryCache";

const fmt = (n) => `$${Math.round(n).toLocaleString()}`;

function buildPath(points) {
    if (points.length === 0) return "";
    return points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

export default function DailyCurveWidget({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [], fixedCategories = [] }) {
    const [rawTxns, setRawTxns] = useState([]);
    const [rawMonthSpend, setRawMonthSpend] = useState([]);
    const [loading, setLoading] = useState(true);
    const [svgWidth, setSvgWidth] = useState(600);
    const svgRef = useCallback(node => {
        if (!node) return;
        const obs = new ResizeObserver(e => setSvgWidth(e[0].contentRect.width));
        obs.observe(node);
        return () => obs.disconnect();
    }, []);

    const [year, month] = selectedMonth.split("-").map(Number);
    const totalDays = new Date(year, month, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    const dayOfMonth = isCurrentMonth ? today.getDate() : totalDays;

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const start = `${selectedMonth}-01`;
            const end = `${selectedMonth}-${String(totalDays).padStart(2, "0")}`;

            const txKey = cacheKey(user.id, "expense_txns", selectedMonth);
            const spKey = cacheKey(user.id, "monthly_spend", selectedMonth);
            const cachedTx = cacheGet(txKey);
            const cachedSp = cacheGet(spKey);

            if (cachedTx && cachedSp) {
                setRawTxns(cachedTx);
                setRawMonthSpend(cachedSp);
                setLoading(false);
                return;
            }

            const [{ data: txns }, { data: spend }] = await Promise.all([
                supabase.from("transactions").select("date, amount, self_amount, partner_amount, user_id, category, exclude_from_report").eq("type", "Expense").eq("exclude_from_report", false).is("parent_id", null).gte("date", start).lte("date", end).or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`),
                supabase.from("monthly_category_spend").select("category, total_spent, self_spent").eq("user_id", user.id).eq("month", selectedMonth),
            ]);

            const t = txns || [];
            const s = spend || [];
            cacheSet(txKey, t);
            cacheSet(spKey, s);
            setRawTxns(t);
            setRawMonthSpend(s);
            setLoading(false);
        };
        fetch();
    }, [selectedMonth, totalDays]);

    const { actualPts, projPts, onPacePts, budget, actualTotal } = useMemo(() => {
        const userId = null; // can't store user.id easily; use a workaround below
        const spendKey = viewMode === "household" ? "amount" : null;

        const filtered = rawTxns
            .filter(tx => !alwaysExcludedCategories.includes(tx.category))
            .filter(tx => !excludeSpecial || !specialCategories.includes(tx.category));

        // Cumulative by day
        const byDay = {};
        filtered.forEach(tx => {
            const d = parseInt(tx.date?.split("-")[2] || "0");
            const amt = viewMode === "household" ? (tx.amount || 0) : (tx.self_amount || 0);
            byDay[d] = (byDay[d] || 0) + amt;
        });

        let cumulative = 0;
        const dailyTotals = [];
        for (let d = 1; d <= totalDays; d++) {
            cumulative += byDay[d] || 0;
            dailyTotals.push({ d, cum: cumulative });
        }

        const actualUpToToday = dailyTotals.filter(p => p.d <= dayOfMonth);
        const actualTotal = actualUpToToday.length > 0 ? actualUpToToday[actualUpToToday.length - 1].cum : 0;

        // Daily rate for projection
        const rate = dayOfMonth > 0 ? actualTotal / dayOfMonth : 0;
        const projectedEOM = rate * totalDays;

        // Budget from monthly_category_spend total (all non-fixed as variable reference)
        const budgetTotal = rawMonthSpend
            .filter(d => !alwaysExcludedCategories.includes(d.category))
            .filter(d => !excludeSpecial || !specialCategories.includes(d.category))
            .reduce((s, d) => s + (viewMode === "household" ? (d.total_spent || 0) : (d.self_spent || 0)), 0);

        const SVG_H = 140;
        const PAD_TOP = 12;
        const PAD_BOT = 24;
        const chartH = SVG_H - PAD_TOP - PAD_BOT;

        const maxY = Math.max(projectedEOM, budgetTotal, actualTotal, 1);
        const xOf = (d) => ((d - 1) / (totalDays - 1)) * (svgWidth - 2);
        const yOf = (v) => PAD_TOP + chartH - (v / maxY) * chartH;

        const actualPts = actualUpToToday.map(p => [xOf(p.d), yOf(p.cum)]);
        const projPts = isCurrentMonth && actualUpToToday.length > 0
            ? [[xOf(dayOfMonth), yOf(actualTotal)], [xOf(totalDays), yOf(projectedEOM)]]
            : [];
        const onPacePts = [[xOf(1), yOf(0)], [xOf(totalDays), yOf(rate * totalDays)]];

        return { actualPts, projPts, onPacePts, budget: budgetTotal, actualTotal };
    }, [rawTxns, rawMonthSpend, viewMode, alwaysExcludedCategories, excludeSpecial, specialCategories, totalDays, dayOfMonth, svgWidth, isCurrentMonth]);

    const SVG_H = 140;

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-4 sm:px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Daily Spending</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Cumulative spend through the month</p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-semibold text-gray-900 tabular-nums">{fmt(actualTotal)}</p>
                    <p className="text-xs text-gray-400">so far</p>
                </div>
            </div>

            <div className="px-4 sm:px-6 py-5">
                <svg ref={svgRef} width="100%" height={SVG_H} className="overflow-visible">
                    {onPacePts.length >= 2 && (
                        <path d={buildPath(onPacePts)} fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="4 3" />
                    )}
                    {projPts.length >= 2 && (
                        <path d={buildPath(projPts)} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="4 3" strokeOpacity="0.5" />
                    )}
                    {actualPts.length >= 2 && (
                        <path d={buildPath(actualPts)} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    {actualPts.length > 0 && (
                        <circle
                            cx={actualPts[actualPts.length - 1][0]}
                            cy={actualPts[actualPts.length - 1][1]}
                            r="3.5"
                            fill="#6366f1"
                        />
                    )}
                </svg>

                <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-indigo-500 rounded" />Actual</span>
                    {isCurrentMonth && <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-indigo-300" />Projected</span>}
                    <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-gray-300" />On-pace</span>
                </div>
            </div>
        </div>
    );
}
