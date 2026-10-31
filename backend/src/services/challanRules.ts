import { randomUUID } from "node:crypto";

export const FINE_AMOUNTS: Readonly<Record<string, number>> = {
    RED_LIGHT: 1000,
    SPEEDING: 1500,
    OVER_SPEEDING: 2000,
    NO_HELMET: 500,
    NO_SEATBELT: 500,
    WRONG_WAY: 1000,
    ILLEGAL_PARKING: 500,
    DRIVING_WITHOUT_LICENSE: 2000,
    RASH_DRIVING: 2500,
};

export function getFineAmount(violationType: string): number | null {
    return Object.prototype.hasOwnProperty.call(FINE_AMOUNTS, violationType)
        ? FINE_AMOUNTS[violationType]
        : null;
}

export function generateChallanNumber(now = new Date()): string {
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, "");
    const uniqueSuffix = randomUUID().replace(/-/g, "").toUpperCase();
    return `CHAL-${datePrefix}-${uniqueSuffix}`;
}
