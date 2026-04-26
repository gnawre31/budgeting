import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { cacheGet, cacheSet, cacheKey } from "../lib/queryCache";

const COLORS = ["#6366f1", "#14b8a6", "#f43f5e", "#f59e0b", "#a78bfa", "#34d399", "#fb923c", "#60a5fa", "#e879f9", "#4ade80"];
const CX = 80, CY = 80, OUTER = 68, INNER = 42;
const fmt = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

const toRad = (deg) => (deg - 90) * (Math.PI / 180);

function buildSlices(data, total) {
    let angle = 0;
    return data.map((d, i) => {
        const sweep = (d.value / total) * 360;
        const startAngle = angle;
        const endAngle = angle + sweep;
        angle = endAngle;

        const large = sweep > 180 ? 1 : 0;

        // Outer arc points
        const ox1 = CX + OUTER * Math.cos(toRad(startAngle));
        const oy1 = CY + OUTER * Math.sin(toRad(startAngle));
        const ox2 = CX + OUTER * Math.cos(toRad(endAngle));
        const oy2 = CY + OUTER * Math.sin(toRad(endAngle));

        // Inner arc points
        const ix1 = CX + INNER * Math.cos(toRad(startAngle));
        const iy1 = CY + INNER * Math.sin(toRad(startAngle));
        const ix2 = CX + INNER * Math.cos(toRad(endAngle));
        const iy2 = CY + INNER * Math.sin(toRad(endAngle));

        // Outer clockwise (1), line to inner end, inner counter-clockwise (0) back to start
        const path = [
            `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
            `A ${OUTER} ${OUTER} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
            `L ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
            `A ${INNER} ${INNER} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
            `Z`,
        ].join(' ');

        return { ...d, color: COLORS[i % COLORS.length], path, sweep };
    });
}

export default function SpendingDonut({ selectedMonth, viewMode, excludeSpecial = false, specialCategories = [], alwaysExcludedCategories = [], refreshKey = 0 }) {
    const [rawExpenses, setRawExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hovered, setHovered] = useState(null);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const key = cacheKey(user.id, "monthly_spend", selectedMonth);
            const cached = cacheGet(key);
            if (cached) { setRawExpenses(cached); setLoading(false); return; }

            const { data } = await supabase.from("monthly_category_spend").select("category, total_spent, self_spent").eq("user_id", user.id).eq("month", selectedMonth);
            const expenses = data || [];
            cacheSet(key, expenses);
            setRawExpenses(expenses);
            setLoading(false);
        };
        fetch();
    }, [selectedMonth, refreshKey]);

    const slices = useMemo(() => {
        const spendKey = viewMode === "household" ? "total_spent" : "self_spent";
        // Aggregate all legs per category before building slices
        const totals = new Map();
        rawExpenses
            .filter(d => !alwaysExcludedCategories.includes(d.category))
            .filter(d => !excludeSpecial || !specialCategories.includes(d.category))
            .forEach(d => totals.set(d.category, (totals.get(d.category) || 0) + (d[spendKey] || 0)));
        const filtered = Array.from(totals.entries())
            .map(([label, value]) => ({ label, value }))
            .filter(d => d.value > 0)
            .sort((a, b) => b.value - a.value);

        const total = filtered.reduce((s, d) => s + d.value, 0);
        if (total === 0) return { slices: [], total: 0 };
        return { slices: buildSlices(filtered, total), total };
    }, [rawExpenses, viewMode, alwaysExcludedCategories, excludeSpecial, specialCategories]);

    const centerLabel = hovered
        ? { top: hovered.label, bottom: fmt(hovered.value) }
        : { top: "Total", bottom: fmt(slices.total) };

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden h-full">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-4 sm:px-6 py-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Spending Breakdown</h2>
                <p className="text-sm text-gray-500 mt-0.5">By category</p>
            </div>

            {!loading && slices.slices.length === 0 ? (
                <div className="px-4 sm:px-6 py-12 text-center text-sm text-gray-400">No spending data</div>
            ) : (
                <div className="px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-6 items-center">
                    <div className="shrink-0">
                        <svg width="160" height="160" viewBox="0 0 160 160">
                            {slices.slices.map((s, i) => (
                                <path
                                    key={i}
                                    d={s.path}
                                    fill={s.color}
                                    style={{
                                        transform: hovered?.label === s.label ? `scale(1.04)` : undefined,
                                        transformOrigin: `${CX}px ${CY}px`,
                                        opacity: hovered && hovered.label !== s.label ? 0.3 : 1,
                                        transition: "opacity 0.15s, transform 0.15s",
                                    }}
                                    onMouseEnter={() => setHovered(s)}
                                    onMouseLeave={() => setHovered(null)}
                                    className="cursor-pointer"
                                />
                            ))}
                            <text x={CX} y={CY - 8} textAnchor="middle" className="fill-gray-400" fontSize="9" fontWeight="500">{centerLabel.top}</text>
                            <text x={CX} y={CY + 10} textAnchor="middle" className="fill-gray-900" fontSize="13" fontWeight="600">{centerLabel.bottom}</text>
                        </svg>
                    </div>
                    <div className="flex-1 space-y-1.5 min-w-0">
                        {slices.slices.slice(0, 8).map((s, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-2 transition-opacity cursor-default"
                                style={{ opacity: hovered && hovered.label !== s.label ? 0.35 : 1 }}
                                onMouseEnter={() => setHovered(s)}
                                onMouseLeave={() => setHovered(null)}
                            >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                                <span className="text-xs text-gray-600 truncate flex-1">{s.label}</span>
                                <span className="text-xs tabular-nums font-medium text-gray-700">{fmt(s.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
