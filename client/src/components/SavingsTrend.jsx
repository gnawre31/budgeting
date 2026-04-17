import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";

function getLast6Months(endMonth) {
    const [year, month] = endMonth.split('-');
    return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(parseInt(year), parseInt(month) - 1 - (5 - i), 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
}

export default function SavingsTrend({ selectedMonth, viewMode }) {
    const [rawData, setRawData] = useState([]);
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
                    .select("month, total_spent, self_spent")
                    .eq("user_id", user.id)
                    .gte("month", first)
                    .lte("month", last),
                supabase.from("transactions")
                    .select("date, amount, self_amount, partner_amount, user_id")
                    .eq("type", "Income")
                    .eq("exclude_from_report", false)
                    .is("parent_id", null)
                    .gte("date", `${first}-01`)
                    .lte("date", `${last}-${String(lastDay).padStart(2, '0')}`)
                    .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`),
            ]);

            const result = months.map(m => {
                const monthExp = expenses?.filter(d => d.month === m) || [];
                const totalExpense = monthExp.reduce((s, d) => s + (d.total_spent || 0), 0);
                const selfExpense = monthExp.reduce((s, d) => s + (d.self_spent || 0), 0);

                const monthInc = income?.filter(tx => tx.date?.substring(0, 7) === m) || [];
                const householdIncome = monthInc.reduce((s, tx) => s + (tx.amount || 0), 0);
                const selfIncome = monthInc.reduce((s, tx) =>
                    s + (tx.user_id === user.id ? tx.self_amount : tx.partner_amount || 0), 0);

                const label = new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]) - 1, 1)
                    .toLocaleDateString('en-US', { month: 'short' });

                return {
                    month: m, label,
                    householdNet: householdIncome - totalExpense,
                    selfNet: selfIncome - selfExpense,
                    hasData: totalExpense > 0 || householdIncome > 0,
                };
            });

            setRawData(result);
            setLoading(false);
        };
        fetchData();
    }, [selectedMonth]);

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
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Savings Trend</h2>
                <p className="text-sm text-gray-500 mt-0.5">Net saved per month</p>
            </div>

            <div className="px-6 py-5">
                <div className="flex items-end gap-2" style={{ height: '100px' }}>
                    {monthData.map((d) => {
                        const isSelected = d.month === selectedMonth;
                        const isPos = d.net >= 0;
                        const barH = d.hasData ? Math.max((Math.abs(d.net) / maxAbs) * 80, 6) : 4;

                        return (
                            <div key={d.month} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                                <span className={`text-[10px] font-medium leading-none ${
                                    !d.hasData ? 'text-gray-200' : isPos ? 'text-emerald-500' : 'text-red-400'
                                }`}>
                                    {d.hasData ? fmt(d.net) : ''}
                                </span>
                                <div
                                    className={`w-full rounded-t-lg transition-all duration-700 ${
                                        !d.hasData ? 'bg-gray-100' :
                                        isPos ? 'bg-emerald-400' : 'bg-red-400'
                                    } ${isSelected ? 'opacity-100 ring-2 ring-gray-400 ring-offset-1' : 'opacity-60 hover:opacity-90'}`}
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
                    <span>6-mo avg: <span className={`font-semibold ${avg >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{fmt(avg)}/mo</span></span>
                    <span>Total: <span className={`font-semibold ${total >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{fmt(total)}</span></span>
                </div>
            </div>
        </div>
    );
}
