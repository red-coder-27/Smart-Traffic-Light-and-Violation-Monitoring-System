import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createTrafficReportHandler } from "./trafficReportController.js";

type Result = { statusCode: number; body?: Record<string, unknown> };
type ReportServices = Parameters<typeof createTrafficReportHandler>[0];

function makeResponse(): { response: Response; result: Result } {
    const result: Result = { statusCode: 200 };
    const response = {
        status(statusCode: number) {
            result.statusCode = statusCode;
            return this;
        },
        json(body: Record<string, unknown>) {
            result.body = body;
            return this;
        },
    };
    return { response: response as unknown as Response, result };
}

function request(
    query: Record<string, unknown> = {},
    authenticatedUser?: { id: string; role: string },
): Request {
    return { query, authenticatedUser } as unknown as Request;
}

const intersectionId = "550e8400-e29b-41d4-a716-446655440000";
const record = {
    id: "880e8400-e29b-41d4-a716-446655440003",
    occurredAt: new Date("2026-10-09T12:00:00.000Z"),
    violationType: "RED_LIGHT",
    intersection: { id: intersectionId, name: "Main and First" },
};

function services(overrides: Partial<ReportServices> = {}): ReportServices {
    return {
        countViolations: async () => 3,
        groupByType: async () => [
            { type: "RED_LIGHT", count: 2 },
            { type: "SPEEDING", count: 1 },
        ],
        groupByIntersection: async () => [{ intersectionId, count: 3 }],
        getTrend: async () => [{ date: new Date("2026-10-09T00:00:00.000Z"), count: 3 }],
        listViolations: async () => [record],
        listIntersections: async () => [{ id: intersectionId, name: "Main and First" }],
        listViolationTypes: async () => ["RED_LIGHT", "SPEEDING"],
        ...overrides,
    };
}

const police = { id: "police-id", role: "TRAFFIC_POLICE" };

test("requires ADMIN or TRAFFIC_POLICE authentication", async () => {
    const handler = createTrafficReportHandler(services());
    const unauthenticated = makeResponse();
    await handler(request(), unauthenticated.response);
    assert.equal(unauthenticated.result.statusCode, 401);

    const citizen = makeResponse();
    await handler(request({}, { id: "citizen-id", role: "CITIZEN" }), citizen.response);
    assert.equal(citizen.result.statusCode, 403);

    for (const role of ["ADMIN", "TRAFFIC_POLICE"]) {
        const authorized = makeResponse();
        await handler(request({}, { id: `${role.toLowerCase()}-id`, role }), authorized.response);
        assert.equal(authorized.result.statusCode, 200);
    }
});

test("returns summary, sorted groupings, zero-filled daily trends, and safe report records", async () => {
    let receivedWhere: unknown;
    const handler = createTrafficReportHandler(services({
        countViolations: async (where) => {
            receivedWhere = where;
            return 3;
        },
        groupByType: async () => [
            { type: "SPEEDING", count: 1 },
            { type: "RED_LIGHT", count: 2 },
        ],
        groupByIntersection: async () => [{ intersectionId, count: 3 }],
        getTrend: async () => [{ date: new Date("2026-10-09T00:00:00.000Z"), count: 3 }],
    }));
    const { response, result } = makeResponse();

    await handler(request({
        startDate: "2026-10-08",
        endDate: "2026-10-10",
        intersectionId,
        violationType: "RED_LIGHT",
    }, police), response);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(receivedWhere, {
        occurredAt: {
            gte: new Date("2026-10-08T00:00:00.000Z"),
            lt: new Date("2026-10-11T00:00:00.000Z"),
        },
        intersectionId,
        violationType: "RED_LIGHT",
    });
    assert.deepEqual(result.body?.summary, {
        totalViolations: 3,
        violationTypeCount: 2,
        intersectionCount: 1,
    });
    assert.deepEqual(result.body?.byType, [
        { type: "RED_LIGHT", count: 2 },
        { type: "SPEEDING", count: 1 },
    ]);
    assert.deepEqual(result.body?.byIntersection, [
        { intersectionId, name: "Main and First", count: 3 },
    ]);
    assert.deepEqual(result.body?.trend, [
        { date: "2026-10-08", count: 0 },
        { date: "2026-10-09", count: 3 },
        { date: "2026-10-10", count: 0 },
    ]);
    assert.deepEqual((result.body?.records as typeof record[])[0], record);
});

test("supports weekly trend buckets and defaults to a recent date range", async () => {
    const handler = createTrafficReportHandler(services({
        getTrend: async () => [{ date: new Date("2026-10-05T00:00:00.000Z"), count: 4 }],
        countViolations: async () => 0,
        groupByType: async () => [],
        groupByIntersection: async () => [],
        listViolations: async () => [],
    }));
    const weekly = makeResponse();
    await handler(request({
        startDate: "2026-10-08",
        endDate: "2026-10-18",
        interval: "week",
    }, police), weekly.response);
    assert.deepEqual(weekly.result.body?.trend, [
        { date: "2026-10-05", count: 4 },
        { date: "2026-10-12", count: 0 },
    ]);

    const defaults = makeResponse();
    await handler(request({}, police), defaults.response);
    const filters = defaults.result.body?.filters as { startDate: string; endDate: string };
    assert.equal(filters.endDate, new Date().toISOString().slice(0, 10));
    assert.equal(
        (new Date(`${filters.endDate}T00:00:00.000Z`).getTime()
            - new Date(`${filters.startDate}T00:00:00.000Z`).getTime()) / (24 * 60 * 60 * 1000),
        29,
    );
});

test("returns empty aggregates and records when no violations match", async () => {
    const handler = createTrafficReportHandler(services({
        countViolations: async () => 0,
        groupByType: async () => [],
        groupByIntersection: async () => [],
        getTrend: async () => [],
        listViolations: async () => [],
    }));
    const { response, result } = makeResponse();

    await handler(request({ startDate: "2026-10-08", endDate: "2026-10-08" }, police), response);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body?.summary, {
        totalViolations: 0,
        violationTypeCount: 0,
        intersectionCount: 0,
    });
    assert.deepEqual(result.body?.trend, [{ date: "2026-10-08", count: 0 }]);
    assert.deepEqual(result.body?.byType, []);
    assert.deepEqual(result.body?.byIntersection, []);
    assert.deepEqual(result.body?.records, []);
});

test("rejects malformed parameters, invalid dates, and reversed date ranges", async () => {
    const handler = createTrafficReportHandler(services());
    const invalidQueries: Array<Record<string, unknown>> = [
        { startDate: "2026-02-30" },
        { endDate: "2026-10-08", startDate: "2026-10-09" },
        { startDate: "not-a-date" },
        { intersectionId: "not-a-uuid" },
        { violationType: " " },
        { violationType: "x".repeat(81) },
        { interval: "month" },
        { unexpected: "value" },
        { startDate: ["2026-10-08"] },
    ];

    for (const query of invalidQueries) {
        const { response, result } = makeResponse();
        await handler(request(query, police), response);
        assert.equal(result.statusCode, 400, JSON.stringify(query));
        assert.deepEqual(result.body, { success: false, message: "Invalid report filters" });
    }
});

test("returns an error response when a report query fails", async () => {
    const handler = createTrafficReportHandler(services({
        countViolations: async () => {
            throw new Error("Database unavailable");
        },
    }));
    const { response, result } = makeResponse();

    await handler(request({}, police), response);

    assert.equal(result.statusCode, 500);
    assert.deepEqual(result.body, { success: false, message: "Internal server error" });
});
