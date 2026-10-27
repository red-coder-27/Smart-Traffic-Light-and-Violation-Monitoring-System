import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
    createEmergencyPriorityHandlers,
    type EmergencyPriorityServices,
} from "./emergencyPriorityController.js";
import { EmergencyPriorityError } from "../services/emergencyPriorityService.js";

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
    body: Record<string, unknown> = {},
    params: Record<string, string> = {},
    authenticatedUser?: { id: string; role: string },
): Request {
    return { body, params, authenticatedUser } as unknown as Request;
}

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const intersectionId = "660e8400-e29b-41d4-a716-446655440001";
const payload = { id: requestId, status: "REQUESTED" };

function services(overrides: Partial<EmergencyPriorityServices> = {}): EmergencyPriorityServices {
    return {
        getOptions: async () => [],
        listRequests: async () => [payload],
        createRequest: async () => payload,
        activate: async () => ({ ...payload, status: "ACTIVE" }),
        endRequest: async (_id, _userId, status) => ({ ...payload, status }),
        ...overrides,
    };
}

test("creates a validated manual simulation request for the authenticated operator", async () => {
    let saved: unknown;
    const handlers = createEmergencyPriorityHandlers(services({
        createRequest: async (input) => {
            saved = input;
            return payload;
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(request({
        intersectionId,
        direction: "NORTH",
        vehicleType: "AMBULANCE",
    }, {}, { id: "operator-1", role: "TRAFFIC_POLICE" }), response);

    assert.equal(result.statusCode, 201);
    assert.deepEqual(saved, {
        intersectionId,
        direction: "NORTH",
        vehicleType: "AMBULANCE",
        requestedByUserId: "operator-1",
    });
    assert.equal(result.body?.success, true);
});

test("rejects malformed, unsupported, or unauthenticated priority requests", async () => {
    let called = false;
    const handlers = createEmergencyPriorityHandlers(services({
        createRequest: async () => {
            called = true;
            return payload;
        },
    }));
    const invalidDirection = makeResponse();
    const invalidVehicle = makeResponse();
    const invalidIntersection = makeResponse();
    const unauthenticated = makeResponse();

    await handlers.create(request({
        intersectionId,
        direction: "UP",
        vehicleType: "AMBULANCE",
    }, {}, { id: "operator-1", role: "ADMIN" }), invalidDirection.response);
    await handlers.create(request({
        intersectionId,
        direction: "NORTH",
        vehicleType: "BUS",
    }, {}, { id: "operator-1", role: "ADMIN" }), invalidVehicle.response);
    await handlers.create(request({
        intersectionId: "invalid-id",
        direction: "NORTH",
        vehicleType: "AMBULANCE",
    }, {}, { id: "operator-1", role: "ADMIN" }), invalidIntersection.response);
    await handlers.create(request({
        intersectionId,
        direction: "NORTH",
        vehicleType: "AMBULANCE",
    }), unauthenticated.response);

    assert.equal(invalidDirection.result.statusCode, 400);
    assert.equal(invalidVehicle.result.statusCode, 400);
    assert.equal(invalidIntersection.result.statusCode, 400);
    assert.equal(unauthenticated.result.statusCode, 401);
    assert.equal(called, false);
});

test("returns a conflict when the server rejects an unsafe or duplicate activation", async () => {
    const handlers = createEmergencyPriorityHandlers(services({
        activate: async () => {
            throw new EmergencyPriorityError("UNSAFE_SIGNAL_STATE", "Conflicting greens are present.");
        },
    }));
    const { response, result } = makeResponse();

    await handlers.activate(request({}, { id: requestId }, { id: "operator-1", role: "ADMIN" }), response);

    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.message, "Conflicting greens are present.");
});

test("rejects unauthenticated activation and malformed request IDs", async () => {
    const handlers = createEmergencyPriorityHandlers(services());
    const unauthenticated = makeResponse();
    const invalidId = makeResponse();

    await handlers.activate(request({}, { id: requestId }), unauthenticated.response);
    await handlers.activate(request({}, { id: "bad-id" }, { id: "operator-1", role: "ADMIN" }), invalidId.response);

    assert.equal(unauthenticated.result.statusCode, 401);
    assert.equal(invalidId.result.statusCode, 400);
});

test("completes and cancels requests through the corresponding lifecycle transitions", async () => {
    const ended: string[] = [];
    const handlers = createEmergencyPriorityHandlers(services({
        endRequest: async (_id, _userId, status) => {
            ended.push(status);
            return { ...payload, status };
        },
    }));
    const completed = makeResponse();
    const cancelled = makeResponse();

    await handlers.complete(request({}, { id: requestId }, { id: "operator-1", role: "ADMIN" }), completed.response);
    await handlers.cancel(request({}, { id: requestId }, { id: "operator-1", role: "TRAFFIC_POLICE" }), cancelled.response);

    assert.deepEqual(ended, ["COMPLETED", "CANCELLED"]);
    assert.equal(completed.result.statusCode, 200);
    assert.equal(cancelled.result.statusCode, 200);
});
