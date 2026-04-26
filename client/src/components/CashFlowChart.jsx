import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

function getLast12Months(endMonth) {
    const [year, month] = endMonth.split('-');
    return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(parseInt(year), parseInt(month) - 1 - (11 - i), 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
}

const fmtVal = (v) => {
    const abs = Math.abs(v);
    if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}k`;
    return `$${abs.toFixed(0)}`;
};

// Fixed chart geometry (pixels, no viewBox scaling)
const PAD = { top: 20, right: 44, bottom: 34, left: 52 };
const CHART_H = 200; // total SVG height in px

export default function CashFlowChart({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [], partnerId = null }) {
    const [fetchedMonths, setFetchedMonths]   = useState([]);
    const [fetchedExpenses, setFetchedExpenses] = useState([]);
    const [fetchedIncome, setFetchedIncome]   = useState([]);
    const [spanYears, setSpanYears]           = useState(false);
    const [currentUserId, setCurrentUserId]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [hovered, setHovered] = useState(null);
    const [svgWidth, setSvgWidth] = useState(800);
    const containerRef = useRef(null);

    // Measure the real pixel width of the container so SVG draws 1-to-1
    useEffect(() => {
        const measure = () => {
            if (containerRef.current) setSvgWidth(containerRef.current.clientWidth);
        };
        measure();
        const ro = new ResizeObserver(measure);
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const months = getLast12Months(selectedMonth);
            const first = months[0];
            const last  = months[months.length - 1];
            const [ly, lm] = last.split('-');
            const lastDay = new Date(parseInt(ly), parseInt(lm), 0).getDate();

            const [{ data: expenses }, { data: incomeRows }] = await Promise.all([
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
            setFetchedIncome(incomeRows || []);
            setSpanYears(years.size > 1);
            setLoading(false);
        };
        fetchData();
    }, [selectedMonth, partnerId]);

    const rawData = useMemo(() =>
        fetchedMonths.map(m => {
            const mExp = fetchedExpenses
                .filter(d => d.month === m)
                .filter(d => !alwaysExcludedCategories.includes(d.category))
                .filter(d => !excludeSpecial || !specialCategories.includes(d.category));
            const totalExp = mExp.reduce((s, d) => s + (d.total_spent || 0), 0);
            const selfExp  = mExp.reduce((s, d) => s + (d.self_spent  || 0), 0);

            const mInc = fetchedIncome
                .filter(tx => tx.date?.substring(0, 7) === m)
                .filter(tx => !alwaysExcludedCategories.includes(tx.category))
                .filter(tx => !excludeSpecial || !specialCategories.includes(tx.category));
            const householdInc = mInc.reduce((s, tx) => s + (tx.amount || 0), 0);
            const selfInc      = mInc.reduce((s, tx) =>
                // Own transactions: self_amount is this user's share.
                // Partner-posted transactions: partner_amount is this user's share.
                s + (tx.user_id === currentUserId ? (tx.self_amount || 0) : (tx.partner_amount || 0))
            , 0);

            const labelDate = new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]) - 1, 1);
            const label = labelDate.toLocaleDateString('en-US', {
                month: 'short', ...(spanYears ? { year: '2-digit' } : {}),
            });
            return { month: m, label, householdInc, householdExp: totalExp, selfInc, selfExp,
                hasData: totalExp > 0 || householdInc > 0 };
        }),
        [fetchedMonths, fetchedExpenses, fetchedIncome, spanYears, currentUserId, excludeSpecial, specialCategories, alwaysExcludedCategories]
    );

    const data = useMemo(() =>
        rawData.map(d => ({
            ...d,
            income:  viewMode === "household" ? d.householdInc : d.selfInc,
            expense: viewMode === "household" ? d.householdExp : d.selfExp,
        })),
        [rawData, viewMode]
    );

    // ── Chart math (true pixel coords) ──────────────────────────
    const PW = svgWidth - PAD.left - PAD.right;
    const PH = CHART_H - PAD.top - PAD.bottom;
    const N  = data.length;

    const allVals = data.flatMap(d => [d.income, d.expense]);
    const rawMax  = Math.max(...allVals, 1);
    const yMax    = Math.ceil(rawMax / 500) * 500;

    const xOf = useCallback((i) =>
        N <= 1 ? PAD.left + PW / 2 : PAD.left + (i / (N - 1)) * PW,
        [N, PW]
    );
    const yOf = useCallback((v) =>
        PAD.top + PH - (Math.max(0, v) / yMax) * PH,
        [PH, yMax]
    );

    const buildLine = (key) =>
        data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(d[key]).toFixed(1)}`).join(' ');

    const buildArea = (key) => {
        const pts = data.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}`).join(' L ');
        return `M ${pts} L ${xOf(N - 1).toFixed(1)},${(PAD.top + PH).toFixed(1)} L ${xOf(0).toFixed(1)},${(PAD.top + PH).toFixed(1)} Z`;
    };

    // Y-axis ticks
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({ v: yMax * t, y: yOf(yMax * t) }));

    // Hover column width
    const colW = N > 1 ? PW / (N - 1) : PW;

    // Summary stats
    const withData   = data.filter(d => d.hasData);
    const avgIncome  = withData.length ? withData.reduce((s, d) => s + d.income,  0) / withData.length : 0;
    const avgExpense = withData.length ? withData.reduce((s, d) => s + d.expense, 0) / withData.length : 0;
    const avgNet     = avgIncome - avgExpense;

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center rounded-2xl">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            {/* Header */}
            <div className="px-4 sm:px-6 py-5 border-b border-gray-100 flex items-start justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Cash Flow</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Income vs. expenses — last 12 months</p>
                </div>
                <div className="flex items-center gap-5 text-xs text-gray-500 pt-1">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-5 h-[2px] bg-green-400 rounded-full" />
                        Income
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-5 h-[2px] bg-rose-400 rounded-full" />
                        Expenses
                    </span>
                </div>
            </div>

            {/* SVG — measured width, no viewBox scaling */}
            <div ref={containerRef} className="px-4 pt-5 pb-1">
                <svg
                    width={svgWidth}
                    height={CHART_H}
                    style={{ display: 'block', overflow: 'visible' }}
                    onMouseLeave={() => setHovered(null)}
                >
                    {/* Grid lines + Y labels */}
                    {yTicks.map(({ v, y }) => (
                        <g key={v}>
                            <line
                                x1={PAD.left} y1={y} x2={svgWidth - PAD.right} y2={y}
                                stroke={v === 0 ? "#d1d5db" : "#f3f4f6"}
                                strokeWidth="1"
                            />
                            <text
                                x={PAD.left - 8} y={y + 4}
                                textAnchor="end"
                                fill="#9ca3af"
                                fontSize="11"
                                fontFamily="system-ui, sans-serif"
                            >
                                {fmtVal(v)}
                            </text>
                        </g>
                    ))}

                    {/* Subtle area fills */}
                    <path d={buildArea("income")}  fill="#22c55e" fillOpacity={0.06} />
                    <path d={buildArea("expense")} fill="#f43f5e" fillOpacity={0.06} />

                    {/* Lines */}
                    <path d={buildLine("income")}
                        fill="none" stroke="#22c55e" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" />
                    <path d={buildLine("expense")}
                        fill="none" stroke="#f43f5e" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" />

                    {/* Per-point */}
                    {data.map((d, i) => {
                        const x     = xOf(i);
                        const isHov = hovered === i;
                        const isSel = d.month === selectedMonth;

                        // Tooltip flip when near right edge
                        const tipW = 140, tipH = 76;
                        const tipX = x + 14 + tipW > svgWidth - PAD.right ? x - tipW - 14 : x + 14;
                        const tipY = PAD.top;
                        const net  = d.income - d.expense;

                        // Skip every other label when 12 months
                        const showLabel = N <= 7 || i % 2 === 0 || i === N - 1;

                        return (
                            <g key={d.month}>
                                {/* Hover guide */}
                                {isHov && (
                                    <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + PH}
                                        stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
                                )}

                                {/* Dots */}
                                {d.hasData && (
                                    <>
                                        <circle cx={x} cy={yOf(d.income)} r={isHov || isSel ? 5 : 3.5}
                                            fill="white" stroke="#22c55e" strokeWidth="2"
                                            style={{ transition: 'r 0.12s ease' }} />
                                        <circle cx={x} cy={yOf(d.expense)} r={isHov || isSel ? 5 : 3.5}
                                            fill="white" stroke="#f43f5e" strokeWidth="2"
                                            style={{ transition: 'r 0.12s ease' }} />
                                    </>
                                )}

                                {/* X-axis label */}
                                {showLabel && (
                                    <text
                                        x={x} y={CHART_H - 2}
                                        textAnchor={i === 0 ? "start" : i === N - 1 ? "end" : "middle"}
                                        fill={isSel ? "#374151" : "#9ca3af"}
                                        fontSize="11"
                                        fontWeight={isSel ? "600" : "400"}
                                        fontFamily="system-ui, sans-serif"
                                    >
                                        {d.label}
                                    </text>
                                )}

                                {/* Hover zone */}
                                <rect
                                    x={Math.max(PAD.left, x - colW / 2)}
                                    y={PAD.top}
                                    width={Math.min(colW, (svgWidth - PAD.right) - Math.max(PAD.left, x - colW / 2))}
                                    height={PH}
                                    fill="transparent"
                                    style={{ cursor: 'crosshair' }}
                                    onMouseEnter={() => setHovered(i)}
                                />

                                {/* Tooltip */}
                                {isHov && d.hasData && (
                                    <g>
                                        <rect x={tipX} y={tipY} width={tipW} height={tipH}
                                            rx="8" fill="white"
                                            stroke="#e5e7eb" strokeWidth="1"
                                            style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.09))' }} />
                                        <text x={tipX + 12} y={tipY + 17}
                                            fontSize="10" fill="#6b7280" fontFamily="system-ui"
                                            fontWeight="600" letterSpacing="0.06em">
                                            {d.label.toUpperCase()}
                                        </text>
                                        <text x={tipX + 12} y={tipY + 35}
                                            fontSize="12" fill="#22c55e" fontFamily="system-ui" fontWeight="600">
                                            ↑ {fmtVal(d.income)} income
                                        </text>
                                        <text x={tipX + 12} y={tipY + 52}
                                            fontSize="12" fill="#f43f5e" fontFamily="system-ui" fontWeight="600">
                                            ↓ {fmtVal(d.expense)} spent
                                        </text>
                                        <text x={tipX + 12} y={tipY + 68}
                                            fontSize="11" fill={net >= 0 ? "#22c55e" : "#f43f5e"}
                                            fontFamily="system-ui" fontWeight="700">
                                            {net >= 0 ? '+' : '−'}{fmtVal(Math.abs(net))} net
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-6">
                    <span>Avg income <span className="font-semibold text-green-500">{fmtVal(avgIncome)}/mo</span></span>
                    <span>Avg spend <span className="font-semibold text-rose-500">{fmtVal(avgExpense)}/mo</span></span>
                </div>
                <span>Avg savings <span className={`font-semibold ${avgNet >= 0 ? 'text-green-500' : 'text-rose-500'}`}>
                    {avgNet >= 0 ? '+' : '−'}{fmtVal(Math.abs(avgNet))}/mo
                </span></span>
            </div>
        </div>
    );
}
