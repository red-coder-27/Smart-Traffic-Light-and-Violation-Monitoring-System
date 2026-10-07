import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createTrafficSignalHandlers, type TrafficSignalServices } from "./trafficSignalController.js";

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

function request(body: Record<string, unknown>, params: Record<string, string> = {}, authenticatedUser?: { id: string; role: string }) {
    return { body, params, authenticatedUser } as unknown as Request;
}

const signalId = "550e8400-e29b-41d4-a716-446655440000";
const signal = {
    id: signalId,
    intersectionId: "660e8400-e29b-41d4-a716-446655440001",
    status: "RED" as const,
    greenDuration: 30,
    yellowDuration: 5,
    redDuration: 30,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    intersection: {
        id: "660e8400-e29b-41d4-a716-446655440001",
        name: "PSG Junction",
        location: "Avinashi Road",
        status: "ACTIVE" as const,
    },
};

const history = [{
    id: "770e8400-e29b-41d4-a716-446655440002",
    signalId,
    previousConfig: JSON.stringify({ status: "RED", greenDuration: 30, yellowDuration: 5, redDuration: 30 }),
    newConfig: JSON.stringify({ status: "GREEN", greenDuration: 45, yellowDuration: 5, redDuration: 30 }),
    changedByUserId: "user-1",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    changedByUser: { id: "user-1", name: "Admin User" },
}];

function services(overrides: Partial<TrafficSignalServices> = {}): TrafficSignalServices {
    return {
        listSignals: async () => [signal],
        getSignal: async () => signal,
        updateSignalConfig: async (_id, data) => ({ ...signal, ...data }),
        getSignalHistory: async () => history,
        ...overrides,
    };
}

test("lists registered traffic signals with the current status and timing values", async () => {
    const handlers = createTrafficSignalHandlers(services());
    const { response, result } = makeResponse();

    await handlers.list(request({}), response);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body?.signals, [signal]);
});

test("fetches a specific signal and its current status", async () => {
    const handlers = createTrafficSignalHandlers(services());
    const { response, result } = makeResponse();

    await handlers.getOne(request({}, { id: signalId }), response);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body?.signal, signal);
});

test("updates a signal configuration and records the change", async () => {
    let persisted: Record<string, unknown> | undefined;
    const handlers = createTrafficSignalHandlers(services({
        updateSignalConfig: async (id, data, userId) => {
            persisted = { id, data, userId };
            return { ...signal, ...data };
        },
    }));
    const { response, result } = makeResponse();

    await handlers.updateConfig(request({
        status: "GREEN",
        greenDuration: 45,
        yellowDuration: 5,
        redDuration: 30,
    }, { id: signalId }, { id: "admin-user", role: "ADMIN" }), response);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(persisted, {
        id: signalId,
        data: { status: "GREEN", greenDuration: 45, yellowDuration: 5, redDuration: 30 },
        userId: "admin-user",
    });
    assert.equal(result.body?.message, "Signal configuration updated successfully.");
});

test("rejects invalid timing values before persisting", async () => {
    let called = false;
    const handlers = createTrafficSignalHandlers(services({
        updateSignalConfig: async () => {
            called = true;
            return signal;
        },
    }));
    const { response, result } = makeResponse();

    await handlers.updateConfig(request({
        status: "GREEN",
        greenDuration: 0,
        yellowDuration: -1,
        redDuration: 30,
    }, { id: signalId }), response);

    assert.equal(result.statusCode, 400);
    assert.equal(called, false);
});

test("returns signal history for configuration changes", async () => {
    const handlers = createTrafficSignalHandlers(services());
    const { response, result } = makeResponse();

    await handlers.getHistory(request({}, { id: signalId }), response);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body?.history, history);
});

test("rejects malformed signal IDs and missing signals", async () => {
    const handlers = createTrafficSignalHandlers(services({
        getSignal: async () => null,
        updateSignalConfig: async () => {
            throw Object.assign(new Error("not found"), { code: "P2025" });
        },
    }));

    const malformed = makeResponse();
    const missing = makeResponse();
    const missingUpdate = makeResponse();

    await handlers.getOne(request({}, { id: "not-a-uuid" }), malformed.response);
    await handlers.getOne(request({}, { id: signalId }), missing.response);
    await handlers.updateConfig(request({
        status: "RED",
        greenDuration: 30,
        yellowDuration: 5,
        redDuration: 30,
    }, { id: signalId }), missingUpdate.response);

    assert.equal(malformed.result.statusCode, 400);
    assert.equal(missing.result.statusCode, 404);
    assert.equal(missingUpdate.result.statusCode, 404);
});
