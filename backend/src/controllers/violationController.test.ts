import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createViolationHandlers, type ViolationServices } from "./violationController.js";

type Result = { statusCode: number; body?: Record<string, unknown> };

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
    body: Record<string, unknown>,
    params: Record<string, string> = {},
    authenticatedUser?: { id: string; role: string },
): Request {
    return { body, params, authenticatedUser } as unknown as Request;
}

const intersectionId = "550e8400-e29b-41d4-a716-446655440000";
const signalId = "660e8400-e29b-41d4-a716-446655440001";
const citizenId = "770e8400-e29b-41d4-a716-446655440002";
const violation = {
    id: "880e8400-e29b-41d4-a716-446655440003",
    occurredAt: new Date("2026-10-09T12:00:00.000Z"),
    intersectionId,
    trafficSignalId: signalId,
    violationType: "RED_LIGHT",
    description: "Crossed after the signal turned red",
    recordedByUserId: "990e8400-e29b-41d4-a716-446655440004",
    violatingUserId: citizenId,
    createdAt: new Date("2026-10-09T12:00:00.000Z"),
    updatedAt: new Date("2026-10-09T12:00:00.000Z"),
};

function services(overrides: Partial<ViolationServices> = {}): ViolationServices {
    return {
        createViolation: async () => violation,
        listViolations: async () => [violation],
        getViolation: async () => violation,
        intersectionExists: async () => true,
        signalBelongsToIntersection: async () => true,
        getUser: async (id) => ({ id, role: "TRAFFIC_POLICE", isActive: true }),
        isCitizen: async () => true,
        listCitizens: async () => [],
        ...overrides,
    };
}

const validBody = {
    occurredAt: "2026-10-09T12:00:00.000Z",
    intersectionId,
    trafficSignalId: signalId,
    violationType: " RED_LIGHT ",
    description: " Crossed after the signal turned red ",
    violatingUserId: citizenId,
};

test("records a valid violation using the authenticated recorder", async () => {
    let saved: Record<string, unknown> | undefined;
    let challanAmount: number | undefined;
    const handlers = createViolationHandlers(services({
        createViolation: async (data, amount) => {
            saved = data;
            challanAmount = amount;
            return violation;
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(request(validBody, {}, { id: violation.recordedByUserId, role: "TRAFFIC_POLICE" }), response);

    assert.equal(result.statusCode, 201);
    assert.equal(result.body?.success, true);
    assert.equal((result.body?.violation as typeof violation).id, violation.id);
    assert.deepEqual(saved, {
        occurredAt: new Date("2026-10-09T12:00:00.000Z"),
        intersectionId,
        trafficSignalId: signalId,
        violationType: "RED_LIGHT",
        description: "Crossed after the signal turned red",
        violatingUserId: citizenId,
        recordedByUserId: violation.recordedByUserId,
    });
    assert.equal(challanAmount, 1000);
    assert.equal(result.body?.challan, null);
});

test("returns the generated challan with its number, configured amount, and unpaid status", async () => {
    const generatedChallan = {
        id: "challan-1",
        challanNumber: "CHAL-20261009-0123456789ABCDEF0123456789ABCDEF",
        amount: 1000,
        status: "UNPAID",
    };
    const handlers = createViolationHandlers(services({
        createViolation: async () => ({ ...violation, challan: generatedChallan }),
    }));
    const { response, result } = makeResponse();

    await handlers.create(
        request(validBody, {}, { id: violation.recordedByUserId, role: "ADMIN" }),
        response,
    );

    assert.equal(result.statusCode, 201);
    assert.deepEqual(result.body?.challan, generatedChallan);
});

test("records an unassigned violation without creating a challan", async () => {
    let challanAmount: number | undefined;
    const handlers = createViolationHandlers(services({
        createViolation: async (_data, amount) => {
            challanAmount = amount;
            return { ...violation, violatingUserId: null };
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(
        request({ ...validBody, violatingUserId: undefined }, {}, { id: violation.recordedByUserId, role: "ADMIN" }),
        response,
    );

    assert.equal(result.statusCode, 201);
    assert.equal(challanAmount, undefined);
});

test("records unknown violation types without assigning an unconfigured fine", async () => {
    let challanAmount: number | undefined;
    const handlers = createViolationHandlers(services({
        createViolation: async (_data, amount) => {
            challanAmount = amount;
            return { ...violation, violationType: "UNLISTED_TYPE", challan: null };
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(
        request({ ...validBody, violationType: "UNLISTED_TYPE" }, {}, { id: violation.recordedByUserId, role: "ADMIN" }),
        response,
    );

    assert.equal(result.statusCode, 201);
    assert.equal(challanAmount, undefined);
    assert.equal(result.body?.challan, null);
});

test("reports a database failure without returning a successful violation response", async () => {
    const handlers = createViolationHandlers(services({
        createViolation: async () => {
            throw new Error("database unavailable");
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(request(validBody, {}, { id: "operator", role: "ADMIN" }), response);

    assert.equal(result.statusCode, 500);
    assert.equal(result.body?.success, false);
});

test("lists citizen assignment options only to authenticated operators", async () => {
    let called = false;
    const handlers = createViolationHandlers(services({
        listCitizens: async () => {
            called = true;
            return [{ id: citizenId, name: "Citizen", email: "citizen@example.com" }];
        },
    }));
    const unauthorized = makeResponse();
    await handlers.listCitizens(request({}, {}, { id: citizenId, role: "CITIZEN" }), unauthorized.response);
    assert.equal(unauthorized.result.statusCode, 403);
    assert.equal(called, false);

    const authorized = makeResponse();
    await handlers.listCitizens(request({}, {}, { id: "operator", role: "TRAFFIC_POLICE" }), authorized.response);
    assert.equal(authorized.result.statusCode, 200);
    assert.equal(called, true);
});

test("rejects invalid input before persistence", async () => {
    let called = false;
    const handlers = createViolationHandlers(services({
        createViolation: async () => {
            called = true;
            return violation;
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(request({ ...validBody, intersectionId: "not-a-uuid" }, {}, { id: "user", role: "ADMIN" }), response);

    assert.equal(result.statusCode, 400);
    assert.equal(called, false);
});

test("requires authentication to create a violation", async () => {
    const handlers = createViolationHandlers(services());
    const { response, result } = makeResponse();

    await handlers.create(request(validBody), response);

    assert.equal(result.statusCode, 401);
});

test("rejects inactive or deleted recorders", async () => {
    for (const recorder of [
        null,
        { id: "user", role: "TRAFFIC_POLICE", isActive: false },
    ]) {
        const handlers = createViolationHandlers(services({ getUser: async () => recorder }));
        const { response, result } = makeResponse();

        await handlers.create(request(validBody, {}, { id: "user", role: "TRAFFIC_POLICE" }), response);

        assert.equal(result.statusCode, 403);
    }
});

test("rejects invalid timestamps and invalid citizen references", async () => {
    const invalidTimestamp = createViolationHandlers(services());
    const timestampResponse = makeResponse();
    await invalidTimestamp.create(request(
        { ...validBody, occurredAt: "not-a-timestamp" },
        {},
        { id: "user", role: "TRAFFIC_POLICE" },
    ), timestampResponse.response);
    assert.equal(timestampResponse.result.statusCode, 400);

    const invalidCitizen = createViolationHandlers(services({ isCitizen: async () => false }));
    const citizenResponse = makeResponse();
    await invalidCitizen.create(request(validBody, {}, { id: "user", role: "TRAFFIC_POLICE" }), citizenResponse.response);
    assert.equal(citizenResponse.result.statusCode, 404);
});

test("returns not found when the intersection does not exist", async () => {
    const handlers = createViolationHandlers(services({ intersectionExists: async () => false }));
    const { response, result } = makeResponse();

    await handlers.create(request(validBody, {}, { id: "user", role: "ADMIN" }), response);

    assert.equal(result.statusCode, 404);
});

test("returns not found when the signal does not belong to the intersection", async () => {
    const handlers = createViolationHandlers(services({ signalBelongsToIntersection: async () => false }));
    const { response, result } = makeResponse();

    await handlers.create(request(validBody, {}, { id: "user", role: "TRAFFIC_POLICE" }), response);

    assert.equal(result.statusCode, 404);
});

test("rejects a signal that is not associated with the selected intersection", async () => {
    const handlers = createViolationHandlers(services({
        signalBelongsToIntersection: async () => false,
    }));
    const { response, result } = makeResponse();

    await handlers.create(request(validBody, {}, { id: "user", role: "ADMIN" }), response);

    assert.equal(result.statusCode, 404);
});

test("filters citizen retrieval to the authenticated citizen", async () => {
    let requestedUserId: string | undefined;
    const handlers = createViolationHandlers(services({
        listViolations: async (userId) => {
            requestedUserId = userId;
            return [violation];
        },
    }));
    const { response, result } = makeResponse();

    await handlers.list(request({}, {}, { id: citizenId, role: "CITIZEN" }), response);

    assert.equal(result.statusCode, 200);
    assert.equal(requestedUserId, citizenId);
});

test("allows administrators and traffic police to retrieve all violations", async () => {
    const requestedUserIds: Array<string | undefined> = [];
    const handlers = createViolationHandlers(services({
        listViolations: async (userId) => {
            requestedUserIds.push(userId);
            return [violation];
        },
    }));

    for (const role of ["ADMIN", "TRAFFIC_POLICE"] as const) {
        const { response, result } = makeResponse();
        await handlers.list(request({}, {}, { id: `${role}-id`, role }), response);
        assert.equal(result.statusCode, 200);
    }

    assert.deepEqual(requestedUserIds, [undefined, undefined]);
});

test("rejects unexpected roles and prevents citizen access to another violation", async () => {
    const unexpected = createViolationHandlers(services());
    const unexpectedResponse = makeResponse();
    await unexpected.list(request({}, {}, { id: "user", role: "SUPERVISOR" }), unexpectedResponse.response);
    assert.equal(unexpectedResponse.result.statusCode, 403);

    let requestedUserId: string | undefined;
    const citizen = createViolationHandlers(services({
        getViolation: async (_id, userId) => {
            requestedUserId = userId;
            return null;
        },
    }));
    const citizenResponse = makeResponse();
    await citizen.getOne(request({}, { id: violation.id }, { id: "other-citizen", role: "CITIZEN" }), citizenResponse.response);
    assert.equal(requestedUserId, "other-citizen");
    assert.equal(citizenResponse.result.statusCode, 404);
});

test("returns 404 for a missing violation", async () => {
    const handlers = createViolationHandlers(services({ getViolation: async () => null }));
    const { response, result } = makeResponse();

    await handlers.getOne(request({}, { id: violation.id }, { id: "admin", role: "ADMIN" }), response);

    assert.equal(result.statusCode, 404);
});
