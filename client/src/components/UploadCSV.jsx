import React, { forwardRef } from "react";
import Papa from "papaparse";

const UploadCSV = forwardRef(({ onDataParsed }, ref) => {

    // ---------- 1. Date Normalizer ----------
    const normalizeDate = (dateStr) => {
        if (!dateStr) return null;
        const cleanStr = dateStr.toString().replace(/"/g, '').trim();

        // Already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) return cleanStr;

        // Convert MM/DD/YYYY to YYYY-MM-DD
        const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        const match = cleanStr.match(mmddyyyy);
        if (match) {
            const [, month, day, year] = match;
            return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }
        return null; // Invalid date format
    };

    // ---------- 2. Format Detection ----------
    const detectBankFormat = (headers) => {
        const normalized = headers.map((h) => h?.toString().replace(/^\uFEFF/, "").toLowerCase().trim());

        // e.g. September2025_5847.csv
        if (normalized.includes("posted date") && normalized.includes("payee")) {
            return "AMEX_FORMAT";
        }

        // e.g. WealthSimple activities export
        if (normalized.some(h => h.includes("transaction_date")) && normalized.some(h => h.includes("net_cash_amount"))) {
            return "WEALTHSIMPLE_FORMAT";
        }

        // e.g. Scotiabank Basic_Plus export (Filter, Date, Description, Sub-description, Type of Transaction, Amount, Balance)
        if (normalized.some(h => h.includes("sub-description")) && normalized.some(h => h.includes("type of transaction"))) {
            return "SCOTIABANK_FORMAT";
        }

        // e.g. Money-Back World Mastercard.CSV & Savings.CSV
        if (
            (normalized.includes("transaction date") || normalized.includes("date")) &&
            normalized.includes("name") &&
            normalized.includes("amount")
        ) {
            return "TANGERINE_FORMAT";
        }

        return "UNKNOWN";
    };

    // ---------- 3. Specific Parsers ----------

    // For "September2025..." files
    const parseAmexFormat = (rows, sourceFile) => {
        return rows.map((row) => {
            const rawAmount = parseFloat(row["Amount"] || 0);

            // Negative = Expense, Positive = Income
            const type = rawAmount < 0 ? "Expense" : "Income";
            const amount = Math.abs(rawAmount);

            return {
                date: normalizeDate(row["Posted Date"]),
                merchant: row["Payee"],
                type: type,
                amount: amount,
                category: "Uncategorized", // Let Rules Engine handle it
                sourceFile,
            };
        });
    };

    // For "Money-Back..." and "Savings..." files
    const parseTangerineFormat = (rows, sourceFile) => {
        return rows.map((row) => {
            const dateKey = row["Transaction date"] !== undefined ? "Transaction date" : "Date";
            const rawAmount = parseFloat(row["Amount"] || 0);

            // Negative = Expense, Positive = Income
            const type = rawAmount < 0 ? "Expense" : "Income";
            const amount = Math.abs(rawAmount);

            return {
                date: normalizeDate(row[dateKey]),
                merchant: row["Name"],
                type: type,
                amount: amount,
                category: "Uncategorized", // Ignored Memo, left for Rules Engine
                sourceFile,
            };
        });
    };

    // For WealthSimple activities export
    const parseWealthSimpleFormat = (rows, sourceFile) => {
        // Drop internal credit counter-entries (positive SPEND rows are the other side of a debit)
        const filtered = rows.filter(row => {
            const amount = parseFloat(row["net_cash_amount"] || 0);
            const subType = row["activity_sub_type"]?.toString().trim();
            if (amount > 0 && subType === "SPEND") return false;
            if (amount === 0) return false;
            return true;
        });

        // Deduplicate: same transaction appears once per account — key on (date, amount)
        const seen = new Set();
        const deduped = filtered.filter(row => {
            const key = `${row["transaction_date"]}|${row["net_cash_amount"]}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return deduped.map(row => {
            const rawAmount = parseFloat(row["net_cash_amount"] || 0);
            const type = rawAmount >= 0 ? "Income" : "Expense";
            const amount = Math.abs(rawAmount);
            const merchant = row["name"]?.trim() ||
                row["activity_sub_type"]?.trim() ||
                row["activity_type"]?.trim() ||
                "WealthSimple";

            return {
                date: normalizeDate(row["transaction_date"]),
                merchant,
                type,
                amount,
                category: "Uncategorized",
                sourceFile,
            };
        });
    };

    // For Scotiabank exports (Filter, Date, Description, Sub-description, Type of Transaction, Amount, Balance)
    const parseScotiabankFormat = (rows, sourceFile) => {
        return rows
            .filter(row => {
                // Skip rows where Amount is missing or zero
                const amount = parseFloat(row["Amount"] || 0);
                return !isNaN(amount) && amount !== 0;
            })
            .map(row => {
                const rawAmount = parseFloat(row["Amount"] || 0);
                // "Debit" = money leaving = Expense; "Credit" = money arriving = Income
                const txType = row["Type of Transaction"]?.toString().trim();
                const type = txType === "Credit" ? "Income" : "Expense";
                const amount = Math.abs(rawAmount);
                // Merchant is the Sub-description; fall back to Description if blank
                const merchant =
                    row["Sub-description"]?.toString().trim() ||
                    row["Description"]?.toString().trim() ||
                    "Scotiabank";

                return {
                    date: normalizeDate(row["Date"]),
                    merchant,
                    type,
                    amount,
                    category: "Uncategorized",
                    sourceFile,
                };
            });
    };

    // For "accountactivity..." files (No Headers)
    const parseNoHeaders = (data, sourceFile) => {
        return data.map((row) => {
            // Row 2 is Expense (Out), Row 3 is Income (In)
            const isExpense = row[2] !== undefined && row[2] !== null && row[2] !== "";
            const rawAmount = isExpense ? parseFloat(row[2]) : parseFloat(row[3]);

            const type = isExpense ? "Expense" : "Income";
            const amount = Math.abs(rawAmount || 0);

            return {
                date: normalizeDate(row[0]),
                merchant: row[1],
                type: type,
                amount: amount,
                category: "Uncategorized",
                sourceFile,
            };
        });
    };

    // ---------- 4. Main Parsing Logic ----------
    const parseSingleFile = (file) => {
        return new Promise((resolve) => {
            Papa.parse(file, {
                skipEmptyLines: true,
                complete: function (results) {
                    const data = results.data;
                    if (!data || data.length === 0) {
                        resolve([]);
                        return;
                    }

                    // Helper to check if the first cell looks like a date (to determine if headers exist)
                    const firstCell = data[0][0]?.toString().replace(/"/g, '').trim();
                    const hasHeaders = !(/^\d{4}-\d{2}-\d{2}$/.test(firstCell) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(firstCell));

                    let parsedTransactions = [];

                    if (hasHeaders) {
                        const headers = data[0].map(h => h?.toString().replace(/^\uFEFF/, "").trim());
                        const format = detectBankFormat(headers);

                        // Convert rows to Object format mapping header string -> value
                        const rowsAsObjects = data.slice(1).map(row => {
                            let obj = {};
                            headers.forEach((h, i) => { obj[h] = row[i]; });
                            return obj;
                        });

                        if (format === "AMEX_FORMAT") {
                            parsedTransactions = parseAmexFormat(rowsAsObjects, file.name);
                        } else if (format === "WEALTHSIMPLE_FORMAT") {
                            parsedTransactions = parseWealthSimpleFormat(rowsAsObjects, file.name);
                        } else if (format === "SCOTIABANK_FORMAT") {
                            parsedTransactions = parseScotiabankFormat(rowsAsObjects, file.name);
                        } else if (format === "TANGERINE_FORMAT") {
                            parsedTransactions = parseTangerineFormat(rowsAsObjects, file.name);
                        } else {
                            console.warn("Unknown format in file:", file.name);
                        }
                    } else {
                        // NO HEADERS
                        parsedTransactions = parseNoHeaders(data, file.name);
                    }

                    // Remove invalid rows (e.g., missing date or NaN amounts)
                    const validTransactions = parsedTransactions.filter(tx => tx.date && !isNaN(tx.amount));
                    resolve(validTransactions);
                },
            });
        });
    };

    const handleFileUpload = async (event) => {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        const allParsedData = await Promise.all(files.map(parseSingleFile));
        if (onDataParsed) onDataParsed(allParsedData.flat());
    };

    // ---------- UI Implementation ----------
    return (
        <div className="relative">
            <label
                htmlFor="file-upload"
                className="flex items-center gap-3 px-6 py-3 bg-white border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
            >
                <div className="flex items-center justify-center w-10 h-10 bg-blue-100 text-blue-600 rounded-full group-hover:scale-110 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                </div>
                <div>
                    <p className="text-sm font-bold text-gray-700">Select Bank CSVs</p>
                    <p className="text-xs text-gray-400">Multiple formats supported</p>
                </div>

                <input
                    id="file-upload"
                    ref={ref}
                    type="file"
                    accept=".csv"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                />
            </label>
        </div>
    );
});

UploadCSV.displayName = "UploadCSV";
export default UploadCSV;