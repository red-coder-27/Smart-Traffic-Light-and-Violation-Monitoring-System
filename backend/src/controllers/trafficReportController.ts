import type { Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const ALLOWED_ROLES = ["ADMIN", "TRAFFIC_POLICE"] as const;
const ALLOWED_QUERY_PARAMETERS = new Set([
    "startDate",
    "endDate",
    "intersectionId",
    "violationType",
    "interval",
]);

type ReportInterval = "day" | "week";
type ViolationWhere = {
    occurredAt: { gte: Date; lt: Date };
    intersectionId?: string;
    violationType?: string;
};

type TrafficReportRecord = {
    id: string;
    occurredAt: Date;
    violationType: string;
    intersection: { id: string; name: string };
};

type TrafficReportServices = {
    countViolations(where: ViolationWhere): Promise<number>;
    groupByType(where: ViolationWhere): Promise<Array<{ type: string; count: number }>>;
    groupByIntersection(where: ViolationWhere): Promise<Array<{ intersectionId: string; count: number }>>;
    getTrend(where: ViolationWhere, interval: ReportInterval): Promise<Array<{ date: Date; count: number }>>;
    listViolations(where: ViolationWhere): Promise<TrafficReportRecord[]>;
    listIntersections(): Promise<Array<{ id: string; name: string }>>;
    listViolationTypes(): Promise<string[]>;
};

type ReportFilters = {
    startDate: Date;
    endDate: Date;
    interval: ReportInterval;
    intersectionId?: string;
    violationType?: string;
};

function getAuthenticatedUser(req: Request): { id: string; role: string } | null {
    return (req as AuthenticatedRequest).authenticatedUser ?? null;
}

function parseDate(value: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function getQueryString(req: Request, name: string): string | null | undefined {
    const value = req.query[name];
    if (value === undefined) return null;
    return typeof value === "string" ? value : undefined;
}

function parseFilters(req: Request): {
    filters: ReportFilters;
    where: ViolationWhere;
    startDateText: string;
    endDateText: string;
} | null {
    if (Object.keys(req.query).some((key) => !ALLOWED_QUERY_PARAMETERS.has(key))) return null;

    const startDateValue = getQueryString(req, "startDate");
    const endDateValue = getQueryString(req, "endDate");
    const intersectionValue = getQueryString(req, "intersectionId");
    const violationTypeValue = getQueryString(req, "violationType");
    const intervalValue = getQueryString(req, "interval");
    if (
        startDateValue === undefined
        || endDateValue === undefined
        || intersectionValue === undefined
        || violationTypeValue === undefined
        || intervalValue === undefined
    ) return null;

    const endDate = endDateValue === null
        ? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
        : parseDate(endDateValue);
    const startDate = startDateValue === null
        ? endDate && new Date(endDate.getTime() - 29 * DAY_IN_MILLISECONDS)
        : parseDate(startDateValue);
    if (!startDate || !endDate || startDate > endDate) return null;

    const interval = intervalValue ?? "day";
    if (interval !== "day" && interval !== "week") return null;

    let intersectionId: string | undefined;
    if (intersectionValue !== null) {
        if (!UUID_PATTERN.test(intersectionValue)) return null;
        intersectionId = intersectionValue;
    }

    let violationType: string | undefined;
    if (violationTypeValue !== null) {
        violationType = violationTypeValue.trim();
        if (!violationType || violationType.length > 80) return null;
    }

    const endExclusive = new Date(endDate.getTime() + DAY_IN_MILLISECONDS);
    const where: ViolationWhere = {
        occurredAt: { gte: startDate, lt: endExclusive },
        ...(intersectionId ? { intersectionId } : {}),
        ...(violationType ? { violationType } : {}),
    };

    return {
        filters: { startDate, endDate, interval, intersectionId, violationType },
        where,
        startDateText: startDate.toISOString().slice(0, 10),
        endDateText: endDate.toISOString().slice(0, 10),
    };
}

function startOfWeek(date: Date): Date {
    const start = new Date(date);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    return start;
}

function fillTrend(
    rows: Array<{ date: Date; count: number }>,
    startDate: Date,
    endDate: Date,
    interval: ReportInterval,
): Array<{ date: string; count: number }> {
    const counts = new Map(rows.map(({ date, count }) => [
        (interval === "week" ? startOfWeek(date) : date).toISOString().slice(0, 10),
        count,
    ]));
    const trend: Array<{ date: string; count: number }> = [];
    const current = interval === "week" ? startOfWeek(startDate) : new Date(startDate);
    while (current <= endDate) {
        const date = current.toISOString().slice(0, 10);
        trend.push({ date, count: counts.get(date) ?? 0 });
        current.setUTCDate(current.getUTCDate() + (interval === "week" ? 7 : 1));
    }
    return trend;
}

export function createTrafficReportHandler(services: TrafficReportServices) {
    return async (req: Request, res: Response): Promise<void> => {
        const authenticatedUser = getAuthenticatedUser(req);
        if (!authenticatedUser) {
            res.status(401).json({ success: false, message: "Authentication required" });
            return;
        }
        if (!ALLOWED_ROLES.includes(authenticatedUser.role as (typeof ALLOWED_ROLES)[number])) {
            res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
            return;
        }

        const parsed = parseFilters(req);
        if (!parsed) {
            res.status(400).json({ success: false, message: "Invalid report filters" });
            return;
        }

        try {
            const [totalViolations, types, intersectionCounts, trendRows, records, intersections, violationTypes] =
                await Promise.all([
                    services.countViolations(parsed.where),
                    services.groupByType(parsed.where),
                    services.groupByIntersection(parsed.where),
                    services.getTrend(parsed.where, parsed.filters.interval),
                    services.listViolations(parsed.where),
                    services.listIntersections(),
                    services.listViolationTypes(),
                ]);
            const intersectionNames = new Map(intersections.map(({ id, name }) => [id, name]));
            const byType = [...types]
                .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
                .map(({ type, count }) => ({ type, count }));
            const byIntersection = intersectionCounts
                .map(({ intersectionId, count }) => ({
                    intersectionId,
                    name: intersectionNames.get(intersectionId) ?? "Unknown intersection",
                    count,
                }))
                .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

            res.json({
                success: true,
                filters: {
                    startDate: parsed.startDateText,
                    endDate: parsed.endDateText,
                    interval: parsed.filters.interval,
                    intersectionId: parsed.filters.intersectionId ?? null,
                    violationType: parsed.filters.violationType ?? null,
                },
                summary: {
                    totalViolations,
                    violationTypeCount: byType.length,
                    intersectionCount: byIntersection.length,
                },
                trend: fillTrend(trendRows, parsed.filters.startDate, parsed.filters.endDate, parsed.filters.interval),
                byType,
                byIntersection,
                records,
                options: {
                    intersections,
                    violationTypes,
                },
            });
        } catch (error) {
            console.error("Generating traffic report failed:", error);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    };
}

const reportWhere = (where: ViolationWhere) => ({
    occurredAt: where.occurredAt,
    ...(where.intersectionId ? { intersectionId: where.intersectionId } : {}),
    ...(where.violationType ? { violationType: where.violationType } : {}),
});

export const getTrafficReport = createTrafficReportHandler({
    countViolations: (where) => prisma.violation.count({ where: reportWhere(where) }),
    groupByType: async (where) => {
        const groups = await prisma.violation.groupBy({
            by: ["violationType"],
            where: reportWhere(where),
            _count: { _all: true },
        });
        return groups.map(({ violationType, _count }) => ({ type: violationType, count: _count._all }));
    },
    groupByIntersection: async (where) => {
        const groups = await prisma.violation.groupBy({
            by: ["intersectionId"],
            where: reportWhere(where),
            _count: { _all: true },
        });
        return groups.map(({ intersectionId, _count }) => ({ intersectionId, count: _count._all }));
    },
    getTrend: async (where, interval) => {
        const conditions = [
            Prisma.sql`"occurredAt" >= ${where.occurredAt.gte}`,
            Prisma.sql`"occurredAt" < ${where.occurredAt.lt}`,
        ];
        if (where.intersectionId) conditions.push(Prisma.sql`"intersectionId" = ${where.intersectionId}`);
        if (where.violationType) conditions.push(Prisma.sql`"violationType" = ${where.violationType}`);
        const bucket = interval === "week"
            ? Prisma.sql`date_trunc('week', "occurredAt")`
            : Prisma.sql`date_trunc('day', "occurredAt")`;
        const groups = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
            SELECT ${bucket} AS "date", COUNT(*) AS "count"
            FROM "violations"
            WHERE ${Prisma.join(conditions, " AND ")}
            GROUP BY 1
            ORDER BY 1
        `);
        return groups.map(({ date, count }) => ({ date, count: Number(count) }));
    },
    listViolations: (where) => prisma.violation.findMany({
        where: reportWhere(where),
        orderBy: { occurredAt: "desc" },
        select: {
            id: true,
            occurredAt: true,
            violationType: true,
            intersection: { select: { id: true, name: true } },
        },
    }),
    listIntersections: () => prisma.intersection.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    }),
    listViolationTypes: async () => {
        const types = await prisma.violation.findMany({
            distinct: ["violationType"],
            select: { violationType: true },
            orderBy: { violationType: "asc" },
        });
        return types.map(({ violationType }) => violationType);
    },
});
