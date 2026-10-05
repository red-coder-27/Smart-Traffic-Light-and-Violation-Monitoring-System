import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
    createIntersectionHandlers,
    type IntersectionServices,
} from "./intersectionController.js";

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

function request(body: Record<string, unknown>, params: Record<string, string> = {}): Request {
    return { body, params } as unknown as Request;
}

const record = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "PSG Junction",
    location: "Avinashi Road, Coimbatore",
    latitude: 11.0168,
    longitude: 76.9558,
    status: "ACTIVE" as const,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
};

function services(overrides: Partial<IntersectionServices> = {}): IntersectionServices {
    return {
        createIntersection: async () => record,
        listIntersections: async () => [record],
        getIntersection: async () => record,
        updateIntersection: async () => record,
        ...overrides,
    };
}

test("creates a valid intersection with trimmed values", async () => {
    let saved: Record<string, unknown> | undefined;
    const handlers = createIntersectionHandlers(services({
        createIntersection: async (data) => {
            saved = data;
            return record;
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(request({
        name: " PSG Junction ",
        location: " Avinashi Road, Coimbatore ",
        latitude: 11.0168,
        longitude: 76.9558,
        status: "ACTIVE",
    }), response);

    assert.equal(result.statusCode, 201);
    assert.deepEqual(saved, {
        name: "PSG Junction",
        location: "Avinashi Road, Coimbatore",
        latitude: 11.0168,
        longitude: 76.9558,
        status: "ACTIVE",
    });
    assert.equal(result.body?.success, true);
});

test("rejects invalid intersection input", async () => {
    let called = false;
    const handlers = createIntersectionHandlers(services({
        createIntersection: async () => {
            called = true;
            return record;
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(request({ name: " ", location: "Main Road", latitude: "invalid" }), response);

    assert.equal(result.statusCode, 400);
    assert.equal(called, false);
});

test("maps duplicate database errors to conflict", async () => {
    const handlers = createIntersectionHandlers(services({
        createIntersection: async () => {
            throw { code: "P2002" };
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(request({ name: "PSG Junction", location: "Avinashi Road" }), response);

    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.success, false);
});

test("lists, gets, and updates intersections", async () => {
    const handlers = createIntersectionHandlers(services());
    const list = makeResponse();
    const one = makeResponse();
    const updated = makeResponse();

    await handlers.list(request({}), list.response);
    await handlers.getOne(request({}, { id: record.id }), one.response);
    await handlers.update(request({ status: "INACTIVE" }, { id: record.id }), updated.response);

    assert.equal(list.result.statusCode, 200);
    assert.deepEqual(list.result.body?.intersections, [record]);
    assert.equal(one.result.statusCode, 200);
    assert.deepEqual(one.result.body?.intersection, record);
    assert.equal(updated.result.statusCode, 200);
});

test("rejects malformed IDs and reports missing intersections", async () => {
    const handlers = createIntersectionHandlers(services({
        getIntersection: async () => null,
        updateIntersection: async () => null,
    }));
    const malformed = makeResponse();
    const missing = makeResponse();
    const missingUpdate = makeResponse();

    await handlers.getOne(request({}, { id: "not-a-uuid" }), malformed.response);
    await handlers.getOne(request({}, { id: record.id }), missing.response);
    await handlers.update(request({ name: "Updated" }, { id: record.id }), missingUpdate.response);

    assert.equal(malformed.result.statusCode, 400);
    assert.equal(missing.result.statusCode, 404);
    assert.equal(missingUpdate.result.statusCode, 404);
});

test("associates an existing traffic signal with an intersection", async () => {
    let association: string[] = [];
    const handlers = createIntersectionHandlers(services({
        associateSignal: async (intersectionId, signalId) => {
            association = [intersectionId, signalId];
            return true;
        },
    }));
    const response = makeResponse();

    await handlers.associateSignal(request({}, {
        id: record.id,
        signalId: "650e8400-e29b-41d4-a716-446655440000",
    }), response.response);

    assert.equal(response.result.statusCode, 200);
    assert.deepEqual(association, [record.id, "650e8400-e29b-41d4-a716-446655440000"]);
});
