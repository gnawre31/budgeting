import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheGet, cacheSet, cacheKey } from "../lib/queryCache";

const CONTAINER_H = 120; // px, same as SavingsTrend

function getLast6Months(endMonth) {
    const [year, month] = endMonth.split("-");
    return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(parseInt(year), parseInt(month) - 1 - (5 - i), 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
}

export default function SavingsRateTrend({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [], refreshKey = 0 }) {
    const [rawExpenses, setRawExpenses] = useState([]);
    const [rawIncome, setRawIncome] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [spanYears, setSpanYears] = useState(false);
    const [loading, setLoading] = useState(true);

    const months = useMemo(() => getLast6Months(selectedMonth), [selectedMonth]);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUserId(user.id);

            const first = months[0];
            const last = months[months.length - 1];
            const [ly, lm] = last.split("-");
            const lastDay = new Date(parseInt(ly), parseInt(lm), 0).getDate();

            const expKey = cacheKey(user.id, "monthly_spend_range", first, last);
            const incKey = cacheKey(user.id, "income_range", first, last);
            const cachedExp = cacheGet(expKey);
            const cachedInc = cacheGet(incKey);

            if (cachedExp && cachedInc) {
                setRawExpenses(cachedExp);
                setRawIncome(cachedInc);
                setSpanYears(new Set(months.map(m => m.split("-")[0])).size > 1);
                setLoading(false);
                return;
            }

            const [{ data: expenses }, { data: income }] = await Promise.all([
                supabase.from("monthly_category_spend").select("month, total_spent, self_spent, category").eq("user_id", user.id).gte("month", first).lte("month", last),
                supabase.from("transactions").select("date, amount, self_amount, partner_amount, user_id, category").eq("type", "Income").eq("exclude_from_report", false).is("parent_id", null).gte("date", `${first}-01`).lte("date", `${last}-${String(lastDay).padStart(2, "0")}`).or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`),
            ]);

            const exp = expenses || [];
            const inc = income || [];
            cacheSet(expKey, exp);
            cacheSet(incKey, inc);
            setRawExpenses(exp);
            setRawIncome(inc);
            setSpanYears(new Set(months.map(m => m.split("-")[0])).size > 1);
            setLoading(false);
        };
        fetch();
    }, [selectedMonth, refreshKey]);

    const rates = useMemo(() => {
        return months.map(m => {
            const monthExp = rawExpenses
                .filter(d => d.month === m)
                .filter(d => !alwaysExcludedCategories.includes(d.category))
                .filter(d => !excludeSpecial || !specialCategories.includes(d.category));
            const expense = monthExp.reduce((s, d) => s + (viewMode === "household" ? (d.total_spent || 0) : (d.self_spent || 0)), 0);

            const monthInc = rawIncome
                .filter(tx => tx.date?.substring(0, 7) === m)
                .filter(tx => !alwaysExcludedCategories.includes(tx.category))
                .filter(tx => !excludeSpecial || !specialCategories.includes(tx.category));
            const income = monthInc.reduce((s, tx) => {
                if (viewMode === "household") return s + (tx.amount || 0);
                return s + (tx.user_id === currentUserId ? (tx.self_amount || 0) : (tx.partner_amount || 0));
            }, 0);

            const rate = income > 0 ? ((income - expense) / income) * 100 : null;
            const hasData = expense > 0 || income > 0;

            const labelDate = new Date(parseInt(m.split("-")[0]), parseInt(m.split("-")[1]) - 1, 1);
            const label = labelDate.toLocaleDateString("en-US", { month: "short", ...(spanYears ? { year: "2-digit" } : {}) });

            return { month: m, rate, hasData, label };
        });
    }, [rawExpenses, rawIncome, months, viewMode, currentUserId, alwaysExcludedCategories, excludeSpecial, specialCategories, spanYears]);

    const maxAbsRate = useMemo(() => Math.max(...rates.filter(r => r.rate !== null).map(r => Math.abs(r.rate)), 1), [rates]);

    const goalRate = 20;
    const avgRate = useMemo(() => {
        const valid = rates.filter(r => r.rate !== null);
        return valid.length ? valid.reduce((s, r) => s + r.rate, 0) / valid.length : null;
    }, [rates]);

    const fmtRate = (r) => `${r >= 0 ? "" : "−"}${Math.abs(r).toFixed(0)}%`;

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden h-full">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Savings Rate</h2>
                <p className="text-sm text-gray-500 mt-0.5">% of income saved per month</p>
            </div>

            <div className="px-6 py-5">
                <div className="flex items-end gap-2" style={{ height: `${CONTAINER_H}px` }}>
                    {rates.map(r => {
                        const isSelected = r.month === selectedMonth;
                        const hasRate = r.rate !== null && r.hasData;
                        const barPct = hasRate ? Math.max((Math.abs(r.rate) / maxAbsRate) * 80, 5) : 0;
                        const labelColor = !r.hasData ? "text-gray-200"
                            : r.rate === null ? "text-gray-300"
                            : r.rate >= goalRate ? "text-green-500"
                            : r.rate >= 0 ? "text-amber-500"
                            : "text-rose-500";
                        const barColor = !r.hasData ? "bg-gray-100"
                            : r.rate === null ? "bg-gray-100"
                            : r.rate >= goalRate ? "bg-green-400"
                            : r.rate >= 0 ? "bg-amber-400"
                            : "bg-rose-400";

                        return (
                            <div key={r.month} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                                <span
                                    className={`text-[10px] font-semibold leading-none tabular-nums ${labelColor}`}
                                    style={!hasRate ? { visibility: "hidden" } : undefined}
                                >
                                    {hasRate ? fmtRate(r.rate) : fmtRate(0)}
                                </span>
                                <div
                                    className={`w-full rounded-t-lg transition-all duration-700 ${barColor} ${isSelected ? "ring-2 ring-offset-1 ring-gray-300" : ""}`}
                                    style={{ height: hasRate ? `${barPct}%` : "3px" }}
                                />
                                <span className={`text-[10px] font-medium ${isSelected ? "text-gray-700 font-semibold" : "text-gray-400"}`}>{r.label}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                    <span>Goal: <span className="font-semibold text-gray-700">{goalRate}%</span></span>
                    {avgRate !== null && (
                        <span>6-mo avg: <span className={`font-semibold ${avgRate >= goalRate ? "text-green-500" : avgRate >= 0 ? "text-amber-500" : "text-rose-500"}`}>{fmtRate(avgRate)}</span></span>
                    )}
                </div>
            </div>
        </div>
    );
}
