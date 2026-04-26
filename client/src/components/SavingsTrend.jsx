import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";

function getLast6Months(endMonth) {
    const [year, month] = endMonth.split('-');
    return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(parseInt(year), parseInt(month) - 1 - (5 - i), 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
}

export default function SavingsTrend({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [], partnerId = null }) {
    const [fetchedMonths, setFetchedMonths]     = useState([]);
    const [fetchedExpenses, setFetchedExpenses] = useState([]);
    const [fetchedIncome, setFetchedIncome]     = useState([]);
    const [spanYears, setSpanYears]             = useState(false);
    const [currentUserId, setCurrentUserId]     = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const months = getLast6Months(selectedMonth);
            const first = months[0];
            const last = months[months.length - 1];
            const [ly, lm] = last.split('-');
            const lastDay = new Date(parseInt(ly), parseInt(lm), 0).getDate();

            const [{ data: expenses }, { data: income }] = await Promise.all([
                supabase.from("monthly_category_spend")
                    .select("month, total_spent, self_spent, category")
                    .eq("user_id", user.id)
                    .gte("month", first)
                    .lte("month", last),
                supabase.from("transactions")
                    .select("date, amount, self_amount, partner_amount, user_id, category")
                    .eq("type", "Income")
                    .eq("exclude_from_report", false)
                    .is("parent_id", null)
                    .gte("date", `${first}-01`)
                    .lte("date", `${last}-${String(lastDay).padStart(2, '0')}`)
                    .in("user_id", partnerId ? [user.id, partnerId] : [user.id]),
            ]);

            const years = new Set(months.map(m => m.split('-')[0]));
            setCurrentUserId(user.id);
            setFetchedMonths(months);
            setFetchedExpenses(expenses || []);
            setFetchedIncome(income || []);
            setSpanYears(years.size > 1);
            setLoading(false);
        };
        fetchData();
    }, [selectedMonth, partnerId]);

    const rawData = useMemo(() =>
        fetchedMonths.map(m => {
            const monthExp = fetchedExpenses
                .filter(d => d.month === m)
                .filter(d => !alwaysExcludedCategories.includes(d.category))
                .filter(d => !excludeSpecial || !specialCategories.includes(d.category));
            const totalExpense = monthExp.reduce((s, d) => s + (d.total_spent || 0), 0);
            const selfExpense  = monthExp.reduce((s, d) => s + (d.self_spent  || 0), 0);

            const monthInc = fetchedIncome
                .filter(tx => tx.date?.substring(0, 7) === m)
                .filter(tx => !alwaysExcludedCategories.includes(tx.category))
                .filter(tx => !excludeSpecial || !specialCategories.includes(tx.category));
            const householdIncome = monthInc.reduce((s, tx) => s + (tx.amount || 0), 0);
            const selfIncome      = monthInc.reduce((s, tx) =>
                // For own transactions, self_amount is this user's share.
                // For partner-posted transactions fetched via partner_id, partner_amount is this user's share.
                s + (tx.user_id === currentUserId ? (tx.self_amount || 0) : (tx.partner_amount || 0))
            , 0);

            const labelDate = new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]) - 1, 1);
            const label = labelDate.toLocaleDateString('en-US', { month: 'short', ...(spanYears ? { year: '2-digit' } : {}) });

            return {
                month: m, label,
                householdNet: householdIncome - totalExpense,
                selfNet: selfIncome - selfExpense,
                hasData: totalExpense > 0 || householdIncome > 0,
            };
        }),
        [fetchedMonths, fetchedExpenses, fetchedIncome, spanYears, currentUserId, excludeSpecial, specialCategories, alwaysExcludedCategories]
    );

    const monthData = useMemo(() =>
        rawData.map(d => ({ ...d, net: viewMode === "household" ? d.householdNet : d.selfNet })),
        [rawData, viewMode]
    );

    const maxAbs = Math.max(...monthData.map(d => Math.abs(d.net)), 1);
    const total = monthData.reduce((s, d) => s + d.net, 0);
    const avg = monthData.length ? total / monthData.length : 0;

    const fmt = (n) => {
        const abs = Math.abs(n);
        const str = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`;
        return `${n < 0 ? '−' : '+'}${str}`;
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden h-full">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-4 sm:px-6 py-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Savings Trend</h2>
                <p className="text-sm text-gray-500 mt-0.5">Net saved per month</p>
            </div>

            <div className="px-4 sm:px-6 py-5">
                <div className="flex items-end gap-1" style={{ height: '120px' }}>
                    {monthData.map((d) => {
                        const isSelected = d.month === selectedMonth;
                        const isPos = d.net >= 0;
                        const barH = d.hasData ? Math.max((Math.abs(d.net) / maxAbs) * 80, 6) : 4;

                        return (
                            <div key={d.month} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                                <span className={`text-[10px] font-medium leading-none tabular-nums ${
                                    !d.hasData ? 'text-gray-200' : isPos ? 'text-green-500' : 'text-rose-500'
                                }`}>
                                    {d.hasData ? fmt(d.net) : ''}
                                </span>
                                <div
                                    className={`w-full rounded-t-md transition-all duration-700 ${
                                        !d.hasData ? 'bg-gray-100' :
                                        isPos ? 'bg-green-400' : 'bg-rose-400'
                                    } ${isSelected ? 'opacity-100 ring-2 ring-offset-1 ring-gray-300' : 'opacity-50 hover:opacity-80'}`}
                                    style={{ height: `${barH}%` }}
                                />
                                <span className={`text-[10px] font-medium ${isSelected ? 'text-gray-700' : 'text-gray-400'}`}>
                                    {d.label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                    <span>6-mo avg: <span className={`font-semibold ${avg >= 0 ? 'text-green-500' : 'text-rose-500'}`}>{fmt(avg)}/mo</span></span>
                    <span>Total: <span className={`font-semibold ${total >= 0 ? 'text-green-500' : 'text-rose-500'}`}>{fmt(total)}</span></span>
                </div>
            </div>
        </div>
    );
}
