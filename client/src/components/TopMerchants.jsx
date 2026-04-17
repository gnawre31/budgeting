import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";

export default function TopMerchants({ selectedMonth, viewMode }) {
    const [merchantMap, setMerchantMap] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const [year, month] = selectedMonth.split('-');
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();

            const { data } = await supabase
                .from("transactions")
                .select("merchant_normalized, merchant, amount, self_amount, partner_amount, user_id")
                .eq("type", "Expense")
                .eq("exclude_from_report", false)
                .neq("category", "Reimbursement")
                .is("parent_id", null)
                .gte("date", `${selectedMonth}-01`)
                .lte("date", `${selectedMonth}-${String(lastDay).padStart(2, '0')}`)
                .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`);

            if (!data) { setLoading(false); return; }

            const map = {};
            data.forEach(tx => {
                const key = tx.merchant_normalized || tx.merchant || "Unknown";
                if (!map[key]) map[key] = { name: key, total: 0, self: 0 };
                map[key].total += tx.amount || 0;
                map[key].self += tx.user_id === user.id ? (tx.self_amount || 0) : (tx.partner_amount || 0);
            });

            setMerchantMap(map);
            setLoading(false);
        };
        fetchData();
    }, [selectedMonth]);

    const merchants = useMemo(() =>
        Object.values(merchantMap)
            .sort((a, b) => viewMode === "household" ? b.total - a.total : b.self - a.self)
            .slice(0, 8),
        [merchantMap, viewMode]
    );

    const maxAmount = merchants.length > 0
        ? (viewMode === "household" ? merchants[0].total : merchants[0].self) : 1;

    const fmt = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Top Merchants</h2>
                <p className="text-sm text-gray-500 mt-0.5">Where the money went this month</p>
            </div>

            <div className="px-6 py-5">
                {merchants.length === 0 && !loading ? (
                    <p className="text-sm text-gray-400 text-center py-8">No expenses this month.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                        {merchants.map((m, i) => {
                            const amount = viewMode === "household" ? m.total : m.self;
                            const barWidth = Math.max((amount / maxAmount) * 100, 2);
                            return (
                                <div key={m.name} className="flex items-center gap-3">
                                    <span className="text-xs text-gray-300 w-4 text-right shrink-0 font-medium">{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-sm font-medium text-gray-800 truncate pr-2">{m.name}</span>
                                            <span className="text-sm font-semibold text-gray-800 shrink-0">{fmt(amount)}</span>
                                        </div>
                                        <div className="h-1 bg-gray-100 rounded-full">
                                            <div
                                                className="h-full bg-purple-400 rounded-full transition-all duration-700"
                                                style={{ width: `${barWidth}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
