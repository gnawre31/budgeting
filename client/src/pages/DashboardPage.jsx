import React, { useState, useRef, useEffect } from "react";
import { useCategories } from "../hooks/useCategories";
import KPIStrip from "../components/KPIStrip";
import MoMComparison from "../components/MoMComparison";
import SpendingDonut from "../components/SpendingDonut";
import DailyCurveWidget from "../components/DailyCurveWidget";
import SavingsRateTrend from "../components/SavingsRateTrend";
import DiscretionaryRatio from "../components/DiscretionaryRatio";
import DayHeatmap from "../components/DayHeatmap";
import ReimbursementWidget from "../components/ReimbursementWidget";
import LargestTransactions from "../components/LargestTransactions";
import MonthlySpendChart from "../components/MonthlySpendChart";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function MonthPicker({ selectedMonth, onChange }) {
    const [open, setOpen] = useState(false);
    const [pickerYear, setPickerYear] = useState(() => parseInt(selectedMonth.split("-")[0]));
    const ref = useRef(null);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;

    const [selYear, selMo] = selectedMonth.split("-").map(Number);
    const displayName = new Date(selYear, selMo - 1, 1)
        .toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Sync picker year when selectedMonth changes externally (arrow buttons)
    useEffect(() => {
        if (!open) setPickerYear(parseInt(selectedMonth.split("-")[0]));
    }, [selectedMonth, open]);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const isFuture = (mo) =>
        pickerYear > currentYear || (pickerYear === currentYear && mo > currentMonthNum);

    const isSelected = (mo) => pickerYear === selYear && mo === selMo;

    const handleSelect = (mo) => {
        if (isFuture(mo)) return;
        onChange(`${pickerYear}-${String(mo).padStart(2, "0")}`);
        setOpen(false);
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl transition-all ${
                    open ? "bg-white shadow-sm text-gray-900" : "text-gray-700 hover:bg-white hover:shadow-sm"
                }`}
            >
                {displayName}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
                    className={`w-3 h-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-4 w-64">
                    {/* Year navigation */}
                    <div className="flex items-center justify-between mb-3">
                        <button
                            onClick={() => setPickerYear(y => y - 1)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <span className="text-sm font-semibold text-gray-900">{pickerYear}</span>
                        <button
                            onClick={() => setPickerYear(y => y + 1)}
                            disabled={pickerYear >= currentYear}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                    </div>

                    {/* Month grid */}
                    <div className="grid grid-cols-3 gap-1.5">
                        {MONTH_LABELS.map((label, i) => {
                            const mo = i + 1;
                            const future = isFuture(mo);
                            const sel = isSelected(mo);
                            return (
                                <button
                                    key={label}
                                    onClick={() => handleSelect(mo)}
                                    disabled={future}
                                    className={`py-2 text-sm font-medium rounded-xl transition-all ${
                                        sel
                                            ? "bg-gray-900 text-white"
                                            : future
                                                ? "text-gray-200 cursor-not-allowed"
                                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function DashboardPage() {
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const [viewMode, setViewMode] = useState("household");
    const [excludeSpecial, setExcludeSpecial] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const { specialCategories, alwaysExcludedCategories, fixedCategories } = useCategories();

    useEffect(() => {
        const handler = () => setRefreshKey(k => k + 1);
        window.addEventListener("bsync:data-changed", handler);
        return () => window.removeEventListener("bsync:data-changed", handler);
    }, []);

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const isCurrentMonth = selectedMonth >= currentMonth;

    const handlePrevMonth = () => {
        const [year, month] = selectedMonth.split("-");
        const d = new Date(parseInt(year), parseInt(month) - 2, 1);
        setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    };

    const handleNextMonth = () => {
        const [year, month] = selectedMonth.split("-");
        const d = new Date(parseInt(year), parseInt(month), 1);
        const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (next <= currentMonth) setSelectedMonth(next);
    };

    const hasSpecialCategories = specialCategories.length > 0;

    const sharedProps = {
        selectedMonth,
        viewMode,
        excludeSpecial,
        specialCategories,
        alwaysExcludedCategories,
        refreshKey,
    };

    return (
        <div>
            {/* ── Sticky header bar ─────────────────────────────────── */}
            <div className="sticky top-12 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100/80 shadow-sm">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Title */}
                    <div className="hidden sm:block">
                        <h1 className="text-lg font-semibold text-gray-900 tracking-tight leading-none">Dashboard</h1>
                        <p className="text-xs text-gray-400 mt-0.5">Shared expenses and cash flow</p>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 flex-wrap justify-end sm:justify-end">
                        {/* Special filter toggle */}
                        <button
                            onClick={() => setExcludeSpecial(v => !v)}
                            disabled={!hasSpecialCategories}
                            title={
                                !hasSpecialCategories
                                    ? "Mark categories as Special on the Categories page"
                                    : excludeSpecial
                                        ? `Showing typical spend only (${specialCategories.join(", ")} excluded)`
                                        : `Click to hide: ${specialCategories.join(", ")}`
                            }
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl border transition-all ${
                                excludeSpecial
                                    ? "bg-violet-50 border-violet-200 text-violet-700"
                                    : hasSpecialCategories
                                        ? "bg-gray-100 border-transparent text-gray-500 hover:text-gray-700"
                                        : "bg-gray-50 border-transparent text-gray-300 cursor-not-allowed"
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                            </svg>
                            {excludeSpecial ? "Typical only" : "All spending"}
                        </button>

                        {/* View toggle */}
                        <div className="flex bg-gray-100 p-0.5 rounded-xl">
                            <button
                                onClick={() => setViewMode("household")}
                                className={`px-4 py-1.5 text-sm font-medium rounded-[10px] transition-all ${viewMode === "household" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                Household
                            </button>
                            <button
                                onClick={() => setViewMode("self")}
                                className={`px-4 py-1.5 text-sm font-medium rounded-[10px] transition-all ${viewMode === "self" ? "bg-white text-blue-500 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                Just Me
                            </button>
                        </div>

                        {/* Month navigator with picker */}
                        <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-xl">
                            <button
                                onClick={handlePrevMonth}
                                className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-500 hover:text-gray-900 hover:shadow-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                            </button>

                            <MonthPicker selectedMonth={selectedMonth} onChange={setSelectedMonth} />

                            <button
                                onClick={handleNextMonth}
                                disabled={isCurrentMonth}
                                className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-500 hover:text-gray-900 hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:shadow-none"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Scrollable content ────────────────────────────────── */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-16">
                {/* Active filter pill */}
                {excludeSpecial && specialCategories.length > 0 && (
                    <div className="mb-4 flex items-center gap-2 text-xs text-violet-600 bg-violet-50 border border-violet-100 rounded-xl px-4 py-2.5">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        <span>Showing typical spending — excluding <strong>{specialCategories.join(", ")}</strong></span>
                        <button onClick={() => setExcludeSpecial(false)} className="ml-auto font-medium hover:text-violet-800">Clear</button>
                    </div>
                )}

                {/* Widget grid */}
                <div className="space-y-4">
                    <KPIStrip {...sharedProps} fixedCategories={fixedCategories} />

                    <MonthlySpendChart
                        selectedMonth={selectedMonth}
                        viewMode={viewMode}
                        alwaysExcludedCategories={alwaysExcludedCategories}
                        refreshKey={refreshKey}
                    />

                    <MoMComparison {...sharedProps} />

                    <DailyCurveWidget {...sharedProps} fixedCategories={fixedCategories} />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                        <SpendingDonut {...sharedProps} />
                        <SavingsRateTrend {...sharedProps} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                        <DiscretionaryRatio {...sharedProps} fixedCategories={fixedCategories} />
                        <DayHeatmap {...sharedProps} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                        <ReimbursementWidget />
                        <LargestTransactions {...sharedProps} />
                    </div>
                </div>
            </div>
        </div>
    );
}
