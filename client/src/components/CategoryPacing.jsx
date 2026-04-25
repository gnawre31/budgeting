import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { useCategories } from "../hooks/useCategories";

function getStatusKey(catSpent, activeBudget) {
    if (!activeBudget) return "unbudgeted";
    const pct = catSpent / activeBudget;
    if (pct > 1)    return "over";
    if (pct > 0.75) return "near";
    return "within";
}

export default function CategoryPacing({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [] }) {
    const { expenseCategories } = useCategories();

    const [pacingData, setPacingData] = useState([]);
    const [prevMonthData, setPrevMonthData] = useState([]);
    const [incomeStats, setIncomeStats] = useState({ household: 0, self: 0 });
    const [loading, setLoading] = useState(true);

    const [budgets, setBudgets] = useState(() => {
        const saved = localStorage.getItem("budgetSync_thresholds");
        return saved ? JSON.parse(saved) : { "Groceries": 800, "Dining Out": 400 };
    });

    const [editingCategory, setEditingCategory] = useState(null);
    const [editValue, setEditValue] = useState("");

    const prevMonth = useMemo(() => {
        const [year, month] = selectedMonth.split('-');
        const d = new Date(parseInt(year), parseInt(month) - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }, [selectedMonth]);

    const pacingPercent = useMemo(() => {
        const today = new Date();
        const [selYear, selMonth] = selectedMonth.split('-');
        const selDate = new Date(parseInt(selYear), parseInt(selMonth) - 1);
        if (today.getFullYear() === selDate.getFullYear() && today.getMonth() === selDate.getMonth()) {
            return (today.getDate() / new Date(parseInt(selYear), parseInt(selMonth), 0).getDate()) * 100;
        }
        return selDate < today ? 100 : 0;
    }, [selectedMonth]);

    const isCurrentMonth = useMemo(() => {
        const today = new Date();
        const [selYear, selMonth] = selectedMonth.split('-');
        return today.getFullYear() === parseInt(selYear) && today.getMonth() + 1 === parseInt(selMonth);
    }, [selectedMonth]);

    const displayMonthName = useMemo(() => {
        const [year, month] = selectedMonth.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, 1)
            .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }, [selectedMonth]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const [{ data: expenseData, error }, { data: prevData }] = await Promise.all([
                supabase.from("monthly_category_spend").select("*").eq("user_id", user.id).eq("month", selectedMonth),
                supabase.from("monthly_category_spend").select("*").eq("user_id", user.id).eq("month", prevMonth),
            ]);

            if (error) { setLoading(false); return; }
            setPrevMonthData(prevData || []);

            const [year, month] = selectedMonth.split('-');
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();

            const { data: incomeData } = await supabase
                .from("transactions")
                .select("amount, self_amount, partner_amount, user_id")
                .eq("type", "Income")
                .eq("exclude_from_report", false)
                .is("parent_id", null)
                .gte("date", `${selectedMonth}-01`)
                .lte("date", `${selectedMonth}-${String(lastDay).padStart(2, '0')}`)
                .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`);

            const householdIncome = incomeData?.reduce((a, tx) => a + (tx.amount || 0), 0) || 0;
            const selfIncome = incomeData?.reduce((a, tx) => {
                return a + (tx.user_id === user.id ? tx.self_amount : tx.partner_amount || 0);
            }, 0) || 0;

            setIncomeStats({ household: householdIncome, self: selfIncome });

            // Show every expense category that isn't always-excluded; merge in actual spend where it exists
            const allCategories = new Set([
                ...expenseCategories.filter(c => !alwaysExcludedCategories.includes(c)),
                ...Object.keys(budgets).filter(c => !alwaysExcludedCategories.includes(c)),
                ...(expenseData?.map(d => d.category).filter(c => !alwaysExcludedCategories.includes(c)) || []),
            ]);
            const merged = Array.from(allCategories).map(category => {
                const db = expenseData?.find(d => d.category === category);
                return {
                    category,
                    budget:         budgets[category] || 0,
                    self_amount:    db?.self_spent    || 0,
                    partner_amount: db?.partner_spent || 0,
                    total_amount:   db?.total_spent   || 0,
                };
            });

            setPacingData(merged);
            setLoading(false);
        };
        fetchData();
    }, [selectedMonth, budgets, expenseCategories, alwaysExcludedCategories]);

    const saveBudget = (category) => {
        let val = Number(editValue) || 0;
        if (viewMode === "self") val *= 2;
        const newBudgets = { ...budgets, [category]: val };
        setBudgets(newBudgets);
        localStorage.setItem("budgetSync_thresholds", JSON.stringify(newBudgets));
        setEditingCategory(null);
    };

    const statusOrder = { over: 0, near: 1, within: 2, unbudgeted: 3 };

    // Flat sorted list: over → near → within → unbudgeted, then by spend % desc within group
    const sortedData = useMemo(() => {
        return [...pacingData]
            .filter(cat => !excludeSpecial || !specialCategories.includes(cat.category))
            .map(cat => {
                const activeBudget = viewMode === "household" ? cat.budget : cat.budget / 2;
                const catSpent    = viewMode === "household" ? cat.total_amount : cat.self_amount;
                const statusKey   = getStatusKey(catSpent, activeBudget);
                const pct         = activeBudget ? catSpent / activeBudget : 0;
                return { ...cat, statusKey, pct };
            })
            .sort((a, b) => {
                const og = statusOrder[a.statusKey] - statusOrder[b.statusKey];
                return og !== 0 ? og : b.pct - a.pct;
            });
    }, [pacingData, viewMode, excludeSpecial, specialCategories]);

    const activeIncome = viewMode === "household" ? incomeStats.household : incomeStats.self;
    const filteredPacingData = excludeSpecial
        ? pacingData.filter(c => !specialCategories.includes(c.category))
        : pacingData;
    const activeExpense = filteredPacingData.reduce((s, c) => s + (viewMode === "household" ? c.total_amount : c.self_amount), 0);
    const activeTotalBudget = filteredPacingData.reduce((s, c) => s + c.budget, 0) / (viewMode === "household" ? 1 : 2);

    const netCash = activeIncome - activeExpense;
    const isNegativeNet = netCash < 0;
    const cashFill = activeIncome > 0 ? Math.min((activeExpense / activeIncome) * 100, 100) : (activeExpense > 0 ? 100 : 0);

    const budgetDelta = activeTotalBudget - activeExpense;
    const isOverBudget = budgetDelta < 0;
    const budgetFill = activeTotalBudget > 0 ? Math.min((activeExpense / activeTotalBudget) * 100, 100) : (activeExpense > 0 ? 100 : 0);

    const fmt = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-4 sm:px-6 py-5 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{displayMonthName}</p>
                <h2 className="text-lg font-semibold text-gray-900 mt-0.5">Financial Overview</h2>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-gray-100">
                <div className="bg-white px-4 sm:px-6 py-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        {viewMode === 'self' ? 'My Cash Flow' : 'Cash Flow'}
                    </p>
                    <div className="flex items-baseline gap-2 mb-4">
                        <span className={`text-3xl font-semibold tracking-tight ${isNegativeNet ? 'text-rose-500' : 'text-green-500'}`}>
                            {isNegativeNet ? '−' : '+'}{fmt(Math.abs(netCash))}
                        </span>
                        <span className="text-sm text-gray-400">{isNegativeNet ? 'net loss' : 'net saved'}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${isNegativeNet ? 'bg-rose-400' : 'bg-green-400'}`}
                            style={{ width: `${cashFill}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-400">
                        <span>Spent {fmt(activeExpense)}</span>
                        <span>Earned {fmt(activeIncome)}</span>
                    </div>
                </div>

                <div className="bg-white px-4 sm:px-6 py-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Budget Health</p>
                    <div className="flex items-baseline gap-2 mb-4">
                        <span className={`text-3xl font-semibold tracking-tight ${isOverBudget ? 'text-rose-500' : 'text-indigo-500'}`}>
                            {isOverBudget ? '−' : '+'}{fmt(Math.abs(budgetDelta))}
                        </span>
                        <span className="text-sm text-gray-400">{isOverBudget ? 'over budget' : 'remaining'}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${isOverBudget ? 'bg-rose-400' : 'bg-indigo-400'}`}
                            style={{ width: `${budgetFill}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-400">
                        <span>Spent {fmt(activeExpense)}</span>
                        <span>Budget {fmt(activeTotalBudget)}</span>
                    </div>
                </div>
            </div>

            {/* Category grid */}
            <div className="px-4 sm:px-6 py-5">
                {/* Legend */}
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-semibold text-gray-900">Categories</h3>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />Me</span>
                        {viewMode === "household" && (
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />Partner</span>
                        )}
                    </div>
                </div>

                {pacingData.length === 0 && !loading ? (
                    <div className="text-center py-12 text-gray-400 text-sm">
                        No expenses for {displayMonthName}.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                                    {sortedData.map((cat) => {
                                        const activeBudget = viewMode === "household" ? cat.budget : cat.budget / 2;
                                        const hasBudget    = activeBudget > 0;
                                        const catSpent     = viewMode === "household" ? cat.total_amount : cat.self_amount;
                                        const isOver       = hasBudget && catSpent > activeBudget;

                                        const selfPct    = hasBudget ? Math.min((cat.self_amount    / activeBudget) * 100, 100) : 0;
                                        const partnerPct = (viewMode === "household" && hasBudget)
                                            ? Math.min((cat.partner_amount / activeBudget) * 100, 100 - selfPct) : 0;

                                        const prevRecord = prevMonthData.find(d => d.category === cat.category);
                                        const prevSpend  = prevRecord
                                            ? (viewMode === "household" ? prevRecord.total_spent : prevRecord.self_spent) || 0 : 0;
                                        const delta = catSpent - prevSpend;

                                        const projected     = (isCurrentMonth && pacingPercent > 5)
                                            ? catSpent / (pacingPercent / 100) : null;
                                        const projectedOver = projected !== null && hasBudget && projected > activeBudget;

                                        const barColor = isOver
                                            ? "bg-rose-400"
                                            : cat.statusKey === "near"
                                                ? "bg-amber-400"
                                                : "bg-indigo-400";

                                        return (
                                            <div key={cat.category} className="bg-gray-50 rounded-xl p-3 group relative">
                                                {/* Header row */}
                                                <div className="flex items-start justify-between gap-1 mb-2">
                                                    <span className="text-xs font-semibold text-gray-700 leading-tight">{cat.category}</span>
                                                    {prevSpend > 0 && (
                                                        <span className={`text-[10px] px-1 py-0.5 rounded font-medium shrink-0 ${
                                                            delta > 0 ? 'bg-rose-50 text-rose-400' : 'bg-green-50 text-green-600'
                                                        }`}>
                                                            {delta > 0 ? '↑' : '↓'}{fmt(Math.abs(delta))}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Amounts */}
                                                <div className="flex items-baseline gap-1 mb-2.5">
                                                    <span className={`text-base font-bold ${isOver ? 'text-rose-500' : 'text-gray-800'}`}>
                                                        {fmt(catSpent)}
                                                    </span>
                                                    <span className="text-gray-300 text-xs">/</span>
                                                    {editingCategory === cat.category ? (
                                                        <div className="flex items-center gap-0.5">
                                                            <span className="text-gray-400 text-xs">$</span>
                                                            <input
                                                                autoFocus
                                                                type="number"
                                                                className="w-14 text-xs font-medium text-indigo-500 bg-indigo-50 rounded px-1 py-0.5 outline-none border border-indigo-200"
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                onBlur={() => saveBudget(cat.category)}
                                                                onKeyDown={(e) => e.key === 'Enter' && saveBudget(cat.category)}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => { setEditingCategory(cat.category); setEditValue(activeBudget || ''); }}
                                                            className={`text-xs font-medium transition-colors group-hover:underline decoration-dashed underline-offset-2 ${
                                                                hasBudget ? 'text-gray-400 hover:text-indigo-500' : 'text-gray-300 hover:text-indigo-400'
                                                            }`}
                                                            title="Edit budget"
                                                        >
                                                            {hasBudget ? fmt(activeBudget) : 'set budget'}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Progress bar */}
                                                <div className="h-1 bg-gray-200 rounded-full overflow-hidden relative">
                                                    {hasBudget ? (
                                                        <>
                                                            <div
                                                                className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${barColor}`}
                                                                style={{ width: `${selfPct}%` }}
                                                            />
                                                            {viewMode === "household" && (
                                                                <div
                                                                    className={`absolute top-0 h-full rounded-full transition-all duration-700 ${isOver ? 'bg-rose-300' : 'bg-teal-400'}`}
                                                                    style={{ left: `${selfPct}%`, width: `${partnerPct}%` }}
                                                                />
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div
                                                            className="h-full bg-gray-300 rounded-full"
                                                            style={{ width: `100%` }}
                                                        />
                                                    )}
                                                </div>

                                                {/* Pacing tick */}
                                                {hasBudget && pacingPercent > 0 && pacingPercent <= 100 && (
                                                    <div
                                                        className="absolute w-px h-2.5 bg-gray-400/60 rounded-full"
                                                        style={{ left: `calc(${pacingPercent}% + 12px - 0.5px)`, bottom: '22px' }}
                                                    />
                                                )}

                                                {/* Sub-labels */}
                                                <div className="flex justify-between mt-1.5">
                                                    <span className={`text-[10px] ${
                                                        !hasBudget && catSpent > 0 ? 'text-gray-400' :
                                                        isOver ? 'text-rose-500 font-medium' :
                                                        hasBudget ? 'text-gray-400' : 'text-gray-300'
                                                    }`}>
                                                        {!hasBudget && catSpent > 0 ? fmt(catSpent) + ' spent' :
                                                         isOver ? fmt(catSpent - activeBudget) + ' over' :
                                                         hasBudget ? fmt(activeBudget - catSpent) + ' left' : ''}
                                                    </span>
                                                    {projected !== null && hasBudget && (
                                                        <span className={`text-[10px] font-medium ${projectedOver ? 'text-rose-400' : 'text-gray-400'}`}>
                                                            ~{fmt(projected)}{projectedOver ? ' ⚠' : ''}
                                                        </span>
                                                    )}
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
