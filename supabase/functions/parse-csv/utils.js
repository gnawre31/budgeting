import { parse } from "csv-parse/sync";

/**
 * Parse CSV text into array of objects
 */
export function parseCsv(csvText) {
  return parse(csvText, { columns: true, skip_empty_lines: true });
}

/**
 * Compute amounts for self and partner based on split type
 */
export function computeSplit(amount, splitType = "equal", splitUserSelf = 0.5) {
  switch (splitType.toLowerCase()) {
    case "self":
      return [amount, 0];
    case "partner":
      return [0, amount];
    case "custom":
      return [amount * splitUserSelf, amount * (1 - splitUserSelf)];
    default: // equal
      return [amount * 0.5, amount * 0.5];
  }
}

/**
 * Simple merchant normalization
 */
export function normalizeMerchant(merchant) {
  if (!merchant) return "";
  return merchant.trim().toLowerCase();
}
