import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheGet, cacheSet, cacheKey } from "../lib/queryCache";

const fmt = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(n);

const CAT_COLORS = {
    "Groceries": "#34d399", "Restaurant": "#fb923c", "Transportation": "#60a5fa",
    "Entertainment": "#a78bfa", "Shopping": "#f43f5e", "Rent": "#6366f1",
    "Utilities": "#14b8a6", "Bill Payment": "#f59e0b", "Other": "#94a3b8",
};
const catColor = (cat) => CAT_COLORS[cat] || "#94a3b8";

export default function LargestTransactions({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [], refreshKey = 0 }) {
    const [rawTxns, setRawTxns] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUserId(user.id);

            const [y, m] = selectedMonth.split("-").map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            const start = `${selectedMonth}-01`;
            const end = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

            const key = cacheKey(user.id, "largest_txns", selectedMonth);
            const cached = cacheGet(key);
            if (cached) { setRawTxns(cached); setLoading(false); return; }

            const { data } = await supabase
                .from("transactions")
                .select("id, merchant, amount, self_amount, partner_amount, user_id, category, date, description")
                .eq("type", "Expense")
                .eq("exclude_from_report", false)
                .is("parent_id", null)
                .gte("date", start)
                .lte("date", end)
                .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`)
                .order("amount", { ascending: false })
                .limit(15);

            const txns = data || [];
            cacheSet(key, txns);
            setRawTxns(txns);
            setLoading(false);
        };
        fetch();
    }, [selectedMonth, refreshKey]);

    const top5 = useMemo(() => {
        const filtered = rawTxns
            .filter(tx => !alwaysExcludedCategories.includes(tx.category))
            .filter(tx => !excludeSpecial || !specialCategories.includes(tx.category))
            .map(tx => ({
                ...tx,
                displayAmount: viewMode === "household"
                    ? tx.amount
                    : (tx.user_id === currentUserId ? tx.self_amount : tx.partner_amount),
            }))
            .filter(tx => tx.displayAmount > 0)
            .sort((a, b) => b.displayAmount - a.displayAmount)
            .slice(0, 5);

        return filtered;
    }, [rawTxns, viewMode, currentUserId, alwaysExcludedCategories, excludeSpecial, specialCategories]);

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden flex flex-col h-full">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-6 pb-3 pt-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Largest Transactions</h2>
                <p className="text-sm text-gray-500 mt-0.5">Top 5 this month</p>
            </div>

            <div className="px-6 py-3 flex-1 flex flex-col">
                {!loading && top5.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-sm text-gray-400">No transactions</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {top5.map((tx, i) => (
                            <div key={tx.id} className="flex items-center gap-3 py-2.5">
                                <div className="w-0.5 h-7 rounded-full shrink-0" style={{ background: catColor(tx.category) }} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-medium text-gray-800 truncate">{tx.merchant}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: `${catColor(tx.category)}22`, color: catColor(tx.category) }}>
                                            {tx.category}
                                        </span>
                                        <span className="text-[11px] text-gray-300">{tx.date}</span>
                                    </div>
                                </div>
                                <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">{fmt(tx.displayAmount)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
