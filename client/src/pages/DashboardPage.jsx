import React, { useState, useMemo } from "react";
import CategoryPacing from "../components/CategoryPacing";
import TopMerchants from "../components/TopMerchants";
import SavingsTrend from "../components/SavingsTrend";
import ReimbursementBalance from "../components/ReimbursementBalance";

export default function DashboardPage() {
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [viewMode, setViewMode] = useState("household");

    const handlePrevMonth = () => {
        const [year, month] = selectedMonth.split('-');
        const d = new Date(parseInt(year), parseInt(month) - 2, 1);
        setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    const handleNextMonth = () => {
        const [year, month] = selectedMonth.split('-');
        const d = new Date(parseInt(year), parseInt(month), 1);
        setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    const displayMonthName = useMemo(() => {
        const [year, month] = selectedMonth.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, 1)
            .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }, [selectedMonth]);

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Shared expenses and cash flow</p>
                </div>

                <div className="flex items-center gap-2">
                    {/* View toggle */}
                    <div className="flex bg-gray-100 p-0.5 rounded-xl">
                        <button
                            onClick={() => setViewMode('household')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-[10px] transition-all ${
                                viewMode === 'household'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Household
                        </button>
                        <button
                            onClick={() => setViewMode('self')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-[10px] transition-all ${
                                viewMode === 'self'
                                    ? 'bg-white text-blue-500 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Just Me
                        </button>
                    </div>

                    {/* Month navigator */}
                    <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-xl">
                        <button
                            onClick={handlePrevMonth}
                            className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-500 hover:text-gray-900 hover:shadow-sm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <span className="text-sm font-medium text-gray-700 w-28 text-center">{displayMonthName}</span>
                        <button
                            onClick={handleNextMonth}
                            className="p-1.5 hover:bg-white rounded-lg transition-all text-gray-500 hover:text-gray-900 hover:shadow-sm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Widget grid */}
            <div className="space-y-4">
                <CategoryPacing selectedMonth={selectedMonth} viewMode={viewMode} />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                        <SavingsTrend selectedMonth={selectedMonth} viewMode={viewMode} />
                    </div>
                    <ReimbursementBalance />
                </div>

                <TopMerchants selectedMonth={selectedMonth} viewMode={viewMode} />
            </div>
        </div>
    );
}
