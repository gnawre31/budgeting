import React, { useState, useMemo, useEffect } from "react";
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

export default function DashboardPage() {
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const [viewMode, setViewMode] = useState("household");
    const [excludeSpecial, setExcludeSpecial] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const { specialCategories, alwaysExcludedCategories, fixedCategories, splitRules } = useCategories();

    // Re-fetch widgets whenever Realtime invalidates the cache
    useEffect(() => {
        const handler = () => setRefreshKey(k => k + 1);
        window.addEventListener("bsync:data-changed", handler);
        return () => window.removeEventListener("bsync:data-changed", handler);
    }, []);

    const handlePrevMonth = () => {
        const [year, month] = selectedMonth.split("-");
        const d = new Date(parseInt(year), parseInt(month) - 2, 1);
        setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    };

    const handleNextMonth = () => {
        const [year, month] = selectedMonth.split("-");
        const d = new Date(parseInt(year), parseInt(month), 1);
        const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        if (next <= currentMonth) setSelectedMonth(next);
    };

    const isCurrentMonth = (() => {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        return selectedMonth >= currentMonth;
    })();

    const displayMonthName = useMemo(() => {
        const [year, month] = selectedMonth.split("-");
        return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }, [selectedMonth]);

    const hasSpecialCategories = specialCategories.length > 0;

    const sharedProps = {
        selectedMonth,
        viewMode,
        excludeSpecial,
        specialCategories,
        alwaysExcludedCategories,
        splitRules,
        refreshKey,
    };

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Shared expenses and cash flow</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Special filter toggle */}
                    <button
                        onClick={() => setExcludeSpecial(v => !v)}
                        disabled={!hasSpecialCategories}
                        title={
                            !hasSpecialCategories
                                ? "Mark categories as Special on the Categories page to use this filter"
                                : excludeSpecial
                                    ? `Showing typical spend only (${specialCategories.join(", ")} excluded)`
                                    : `Click to hide special categories: ${specialCategories.join(", ")}`
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

                    {/* Month navigator */}
                    <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-xl">
                        <button onClick={handlePrevMonth} className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-500 hover:text-gray-900 hover:shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <span className="text-sm font-medium text-gray-700 w-28 text-center">{displayMonthName}</span>
                        <button onClick={handleNextMonth} disabled={isCurrentMonth} className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-500 hover:text-gray-900 hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:shadow-none">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

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
                {/* Row 1: KPI strip */}
                <KPIStrip {...sharedProps} fixedCategories={fixedCategories} />

                {/* Row 2: MoM */}
                <MoMComparison {...sharedProps} />

                {/* Row 3: Daily curve */}
                <DailyCurveWidget {...sharedProps} fixedCategories={fixedCategories} />

                {/* Row 4: Donut + Savings rate */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                    <SpendingDonut {...sharedProps} />
                    <SavingsRateTrend {...sharedProps} />
                </div>

                {/* Row 5: Discretionary + Heatmap */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                    <DiscretionaryRatio {...sharedProps} fixedCategories={fixedCategories} />
                    <DayHeatmap {...sharedProps} />
                </div>

                {/* Row 6: Reimbursements + Largest transactions */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                    <ReimbursementWidget />
                    <LargestTransactions {...sharedProps} />
                </div>
            </div>
        </div>
    );
}
