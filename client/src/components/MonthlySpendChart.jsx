import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheGet, cacheSet, cacheKey } from "../lib/queryCache";

const fmt = (n) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

function getLast12Months(endMonth) {
    const [year, month] = endMonth.split("-");
    return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(parseInt(year), parseInt(month) - 1 - (11 - i), 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
}

const CHART_H = 220;
const MAX_BAR = 170;

export default function MonthlySpendChart({ selectedMonth, viewMode, alwaysExcludedCategories = [], refreshKey = 0 }) {
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCats, setSelectedCats] = useState(null); // null = "all" — bypasses category filter
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const months = useMemo(() => getLast12Months(selectedMonth), [selectedMonth]);

    // Fetch 12-month range
    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const first = months[0];
            const last  = months[months.length - 1];
            const key   = cacheKey(user.id, "monthly_spend_range", first, last);
            const cached = cacheGet(key);
            if (cached) { setRawData(cached); setLoading(false); return; }

            const { data } = await supabase
                .from("monthly_category_spend")
                .select("month, category, total_spent, self_spent")
                .eq("user_id", user.id)
                .gte("month", first)
                .lte("month", last);

            const rows = data || [];
            cacheSet(key, rows);
            setRawData(rows);
            setLoading(false);
        };
        fetch();
    }, [months, refreshKey]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target))
                setDropdownOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Derive available categories from actual data so orphaned/renamed categories
    // that still have spend rows are always visible in the filter
    const availableCats = useMemo(() => {
        const fromData = [...new Set(rawData.map(d => d.category))]
            .filter(c => !alwaysExcludedCategories.includes(c))
            .sort();
        return fromData;
    }, [rawData, alwaysExcludedCategories]);

    // null = "all" — skip category filter entirely so nothing slips through
    const isAll = selectedCats === null;

    const monthBuckets = useMemo(() => {
        const spendKey = viewMode === "household" ? "total_spent" : "self_spent";
        return months.map(m => {
            const total = Math.max(0, rawData
                .filter(d => d.month === m)
                .filter(d => !alwaysExcludedCategories.includes(d.category))
                .filter(d => isAll || selectedCats.has(d.category))
                .reduce((s, d) => s + (d[spendKey] || 0), 0));

            const [y, mo] = m.split("-");
            const label = new Date(parseInt(y), parseInt(mo) - 1, 1)
                .toLocaleDateString("en-US", { month: "short", year: "2-digit" });
            return { month: m, total, label };
        });
    }, [rawData, months, viewMode, alwaysExcludedCategories, selectedCats, isAll]);

    const maxTotal = useMemo(() => Math.max(...monthBuckets.map(b => b.total), 1), [monthBuckets]);

    const toggleCat = useCallback((cat) => {
        setSelectedCats(prev => {
            // Materialise "all" into an explicit set before modifying
            const next = new Set(prev === null ? availableCats : prev);
            if (next.has(cat)) next.delete(cat); else next.add(cat);
            // If everything is checked again, go back to null (true all)
            if (next.size === availableCats.length) return null;
            return next;
        });
    }, [availableCats]);

    const selectAll = () => setSelectedCats(null); // null = all, bypass filter
    const clearAll  = () => setSelectedCats(new Set());

    const noneSelected = selectedCats !== null && selectedCats.size === 0;
    const filterLabel  = isAll
        ? "All categories"
        : noneSelected
            ? "No categories"
            : `${selectedCats.size} of ${availableCats.length} categories`;

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Monthly Spend</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Last 12 months</p>
                </div>

                {/* Multi-select dropdown */}
                <div className="relative shrink-0" ref={dropdownRef}>
                    <button
                        onClick={() => setDropdownOpen(o => !o)}
                        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 text-gray-400 shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                        </svg>
                        {filterLabel}
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
                            className={`w-3 h-3 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    </button>

                    {dropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-gray-200 rounded-2xl shadow-xl z-30 overflow-hidden">
                            {/* All / None controls */}
                            <div className="flex items-center gap-1 px-3 py-2.5 border-b border-gray-100">
                                <button
                                    onClick={selectAll}
                                    className="flex-1 text-xs font-semibold text-indigo-500 hover:text-indigo-700 py-0.5 rounded-lg hover:bg-indigo-50 transition-colors"
                                >
                                    Select all
                                </button>
                                <div className="w-px h-4 bg-gray-200" />
                                <button
                                    onClick={clearAll}
                                    className="flex-1 text-xs font-semibold text-gray-400 hover:text-gray-600 py-0.5 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Clear
                                </button>
                            </div>

                            {/* Category list */}
                            <div className="overflow-y-auto max-h-64 py-1">
                                {availableCats.map(cat => (
                                    <label
                                        key={cat}
                                        className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isAll || (selectedCats?.has(cat) ?? false)}
                                            onChange={() => toggleCat(cat)}
                                            className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer shrink-0"
                                        />
                                        <span className="text-sm text-gray-700 truncate">{cat}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Chart */}
            <div className="px-6 py-5">
                <div className="flex items-end gap-1.5" style={{ height: `${CHART_H}px` }}>
                    {monthBuckets.map(b => {
                        const isSelected = b.month === selectedMonth;
                        const intensity  = maxTotal > 0 ? b.total / maxTotal : 0;
                        const barH = b.total > 0
                            ? Math.max(8, Math.round(intensity * MAX_BAR))
                            : 3;
                        const color = isSelected
                            ? "#6366f1"
                            : `rgba(99,102,241,${(0.12 + intensity * 0.5).toFixed(2)})`;

                        return (
                            <div
                                key={b.month}
                                className="flex-1 flex flex-col items-center justify-end h-full gap-1.5"
                            >
                                <span
                                    className={`text-[10px] font-semibold tabular-nums leading-none ${isSelected ? "text-indigo-500" : "text-gray-400"}`}
                                    style={b.total === 0 ? { visibility: "hidden" } : undefined}
                                >
                                    {fmt(b.total)}
                                </span>
                                <div
                                    className={`w-full rounded-t-lg transition-all duration-500 ${isSelected ? "ring-2 ring-offset-1 ring-indigo-300" : ""}`}
                                    style={{ height: `${barH}px`, background: color }}
                                />
                                <span className={`text-[10px] font-medium ${isSelected ? "text-gray-800 font-semibold" : "text-gray-400"}`}>
                                    {b.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
