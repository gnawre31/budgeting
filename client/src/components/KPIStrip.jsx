import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheGet, cacheSet, cacheKey, applyPartnerSplits } from "../lib/queryCache";

const fmt = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
const fmtPct = (n) => `${n >= 0 ? "" : "−"}${Math.abs(n).toFixed(1)}%`;

function KPICard({ label, value, sub, color = "text-gray-900" }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-5 flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{label}</p>
            <p className={`text-2xl font-semibold tracking-tight tabular-nums ${color}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
    );
}

export default function KPIStrip({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [], fixedCategories = [], splitRules = {}, refreshKey = 0 }) {
    const [rawExpenses, setRawExpenses] = useState([]);
    const [rawIncome, setRawIncome] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUserId(user.id);

            const [year, month] = selectedMonth.split("-");
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            const start = `${selectedMonth}-01`;
            const end = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

            const expKey = cacheKey(user.id, "monthly_spend", selectedMonth);
            const incKey = cacheKey(user.id, "income_txns", selectedMonth);

            const cachedExp = cacheGet(expKey);
            const cachedInc = cacheGet(incKey);

            if (cachedExp && cachedInc) {
                setRawExpenses(cachedExp);
                setRawIncome(cachedInc);
                setLoading(false);
                return;
            }

            const [{ data: expData }, { data: incData }] = await Promise.all([
                supabase.from("monthly_category_spend").select("category, total_spent, self_spent").eq("user_id", user.id).eq("month", selectedMonth),
                supabase.from("transactions").select("amount, self_amount, partner_amount, user_id, category").eq("type", "Income").eq("exclude_from_report", false).is("parent_id", null).gte("date", start).lte("date", end).or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`),
            ]);

            const expenses = expData || [];
            const income = incData || [];
            cacheSet(expKey, expenses);
            cacheSet(incKey, income);
            setRawExpenses(expenses);
            setRawIncome(income);
            setLoading(false);
        };
        fetch();
    }, [selectedMonth, refreshKey]);

    const { totalSpend, totalIncome, net, rate } = useMemo(() => {
        const filtered = applyPartnerSplits(rawExpenses, splitRules)
            .filter(d => !alwaysExcludedCategories.includes(d.category))
            .filter(d => !excludeSpecial || !specialCategories.includes(d.category));

        const totalSpend = filtered.reduce((s, d) => s + (viewMode === "household" ? (d.total_spent || 0) : (d.self_spent || 0)), 0);

        const incFiltered = rawIncome
            .filter(tx => !alwaysExcludedCategories.includes(tx.category))
            .filter(tx => !excludeSpecial || !specialCategories.includes(tx.category));

        const totalIncome = incFiltered.reduce((s, tx) => {
            if (viewMode === "household") return s + (tx.amount || 0);
            return s + (tx.user_id === currentUserId ? (tx.self_amount || 0) : (tx.partner_amount || 0));
        }, 0);

        const net = totalIncome - totalSpend;
        const rate = totalIncome > 0 ? (net / totalIncome) * 100 : null;
        return { totalSpend, totalIncome, net, rate };
    }, [rawExpenses, rawIncome, viewMode, currentUserId, alwaysExcludedCategories, excludeSpecial, specialCategories, splitRules]);

    if (loading) {
        return (
            <div className="flex gap-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-5 flex-1 h-[88px] animate-pulse bg-gray-50" />
                ))}
            </div>
        );
    }

    return (
        <div className="flex gap-4">
            <KPICard label="Spending" value={fmt(totalSpend)} />
            <KPICard label="Income" value={fmt(totalIncome)} color="text-green-600" />
            <KPICard
                label="Net Saved"
                value={fmt(net)}
                color={net >= 0 ? "text-green-600" : "text-rose-500"}
            />
            <KPICard
                label="Savings Rate"
                value={rate !== null ? fmtPct(rate) : "—"}
                color={rate === null ? "text-gray-400" : rate >= 20 ? "text-green-600" : rate >= 0 ? "text-amber-500" : "text-rose-500"}
                sub={rate !== null && rate >= 20 ? "On track" : rate !== null && rate < 0 ? "Deficit" : undefined}
            />
        </div>
    );
}
