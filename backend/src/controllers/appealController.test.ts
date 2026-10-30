import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
    createAppealHandlers,
    type AppealRecord,
    type AppealServices,
    type ViolationLookup,
} from "./appealController.js";

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

const citizenId = "111e8400-e29b-41d4-a716-446655440001";
const otherCitizenId = "222e8400-e29b-41d4-a716-446655440002";
const violationId = "333e8400-e29b-41d4-a716-446655440003";
const otherViolationId = "444e8400-e29b-41d4-a716-446655440004";
const appealId = "555e8400-e29b-41d4-a716-446655440005";

const mockPendingAppeal: AppealRecord = {
    id: appealId,
    violationId,
    citizenId,
    reason: "I was yielding to an approaching ambulance during an emergency.",
    status: "PENDING",
    reviewNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date("2026-10-29T10:00:00.000Z"),
    updatedAt: new Date("2026-10-29T10:00:00.000Z"),
    violation: {
        id: violationId,
        occurredAt: new Date("2026-10-28T14:30:00.000Z"),
        violationType: "RED_LIGHT",
        description: "Crossed stop line at red signal",
        intersection: { id: "int-1", name: "Main & 5th", location: "Downtown" },
        trafficSignal: { id: "sig-1", status: "RED" },
        challan: { id: "chal-1", challanNumber: "CHAL-20261028-001", amount: 1000, status: "UNPAID" },
    },
    citizen: {
        id: citizenId,
        name: "Jordan Lee",
        email: "jordan@example.com",
        phone: "+15551234567",
    },
};

const mockCitizenViolation: ViolationLookup = {
    id: violationId,
    violatingUserId: citizenId,
    violationType: "RED_LIGHT",
    occurredAt: new Date("2026-10-28T14:30:00.000Z"),
    description: "Crossed stop line at red signal",
};

const mockOtherCitizenViolation: ViolationLookup = {
    id: otherViolationId,
    violatingUserId: otherCitizenId,
    violationType: "SPEEDING",
    occurredAt: new Date("2026-10-28T16:00:00.000Z"),
    description: "Exceeded speed limit",
};

function createMockServices(overrides: Partial<AppealServices> = {}): AppealServices {
    return {
        listAppeals: async (cId) => (cId ? [mockPendingAppeal] : [mockPendingAppeal]),
        getAppeal: async (id) => (id === appealId ? mockPendingAppeal : null),
        getViolation: async (vId) => {
            if (vId === violationId) return mockCitizenViolation;
            if (vId === otherViolationId) return mockOtherCitizenViolation;
            return null;
        },
        appealExistsForViolation: async () => false,
        createAppeal: async (data) => ({
            id: "new-appeal-id",
            violationId: data.violationId,
            citizenId: data.citizenId,
            reason: data.reason,
            status: "PENDING",
            reviewNotes: null,
            reviewedBy: null,
            reviewedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        }),
        updateAppealStatus: async (params) => ({
            ...mockPendingAppeal,
            status: params.status,
            reviewNotes: params.reviewNotes ?? null,
            reviewedBy: params.reviewedBy,
            reviewedAt: params.reviewedAt,
        }),
        ...overrides,
    };
}

test("successful appeal submission records appeal with PENDING status", async () => {
    let createdPayload: { violationId: string; citizenId: string; reason: string } | null = null;
    const services = createMockServices({
        createAppeal: async (data) => {
            createdPayload = data;
            return {
                id: "new-appeal-id",
                violationId: data.violationId,
                citizenId: data.citizenId,
                reason: data.reason,
                status: "PENDING",
                reviewNotes: null,
                reviewedBy: null,
                reviewedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        },
    });

    const handlers = createAppealHandlers(services);
    const { response, result } = makeResponse();

    await handlers.submit(
        request(
            {
                violationId,
                reason: "I was yielding to an emergency vehicle as permitted by traffic rules.",
            },
            {},
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 201);
    assert.equal(result.body?.success, true);
    const appeal = result.body?.appeal as AppealRecord;
    assert.equal(appeal.status, "PENDING");
    assert.equal(appeal.violationId, violationId);
    assert.equal(createdPayload?.citizenId, citizenId);
    assert.equal(createdPayload?.reason, "I was yielding to an emergency vehicle as permitted by traffic rules.");
});

test("missing or invalid appeal reason is rejected with 400", async () => {
    const handlers = createAppealHandlers(createMockServices());

    // Missing reason
    {
        const { response, result } = makeResponse();
        await handlers.submit(
            request({ violationId }, {}, { id: citizenId, role: "CITIZEN" }),
            response,
        );
        assert.equal(result.statusCode, 400);
        assert.equal(result.body?.success, false);
    }

    // Reason too short (< 10 characters)
    {
        const { response, result } = makeResponse();
        await handlers.submit(
            request({ violationId, reason: "Too short" }, {}, { id: citizenId, role: "CITIZEN" }),
            response,
        );
        assert.equal(result.statusCode, 400);
        assert.equal(result.body?.success, false);
        assert.ok(String(result.body?.message).includes("between 10 and 1000"));
    }

    // Reason too long (> 1000 characters)
    {
        const { response, result } = makeResponse();
        await handlers.submit(
            request({ violationId, reason: "A".repeat(1001) }, {}, { id: citizenId, role: "CITIZEN" }),
            response,
        );
        assert.equal(result.statusCode, 400);
        assert.equal(result.body?.success, false);
    }

    // Invalid violation ID format
    {
        const { response, result } = makeResponse();
        await handlers.submit(
            request({ violationId: "not-a-uuid", reason: "Valid reason for appeal here." }, {}, { id: citizenId, role: "CITIZEN" }),
            response,
        );
        assert.equal(result.statusCode, 400);
        assert.equal(result.body?.success, false);
    }
});

test("nonexistent violation returns 404", async () => {
    const handlers = createAppealHandlers(createMockServices());
    const { response, result } = makeResponse();

    await handlers.submit(
        request(
            {
                violationId: "999e8400-e29b-41d4-a716-446655440099",
                reason: "Valid reason for this nonexistent violation.",
            },
            {},
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 404);
    assert.equal(result.body?.success, false);
    assert.equal(result.body?.message, "Violation not found");
});

test("user attempting to appeal another user's violation is rejected with 403 Forbidden", async () => {
    const handlers = createAppealHandlers(createMockServices());
    const { response, result } = makeResponse();

    // citizenId attempts to appeal otherViolationId (belonging to otherCitizenId)
    await handlers.submit(
        request(
            {
                violationId: otherViolationId,
                reason: "Attempting to appeal someone else's traffic ticket.",
            },
            {},
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 403);
    assert.equal(result.body?.success, false);
    assert.ok(String(result.body?.message).includes("not authorized"));
});

test("unauthenticated requests return 401 across all appeal handlers", async () => {
    const handlers = createAppealHandlers(createMockServices());

    // submit
    {
        const { response, result } = makeResponse();
        await handlers.submit(request({ violationId, reason: "Valid appeal reason text" }), response);
        assert.equal(result.statusCode, 401);
    }

    // list
    {
        const { response, result } = makeResponse();
        await handlers.list(request(), response);
        assert.equal(result.statusCode, 401);
    }

    // getOne
    {
        const { response, result } = makeResponse();
        await handlers.getOne(request({}, { id: appealId }), response);
        assert.equal(result.statusCode, 401);
    }

    // updateStatus
    {
        const { response, result } = makeResponse();
        await handlers.updateStatus(request({ status: "APPROVED" }, { id: appealId }), response);
        assert.equal(result.statusCode, 401);
    }
});

test("duplicate appeal submission returns 409 Conflict", async () => {
    const services = createMockServices({
        appealExistsForViolation: async () => true, // simulate appeal already exists
    });
    const handlers = createAppealHandlers(services);
    const { response, result } = makeResponse();

    await handlers.submit(
        request(
            {
                violationId,
                reason: "Attempting a duplicate appeal for the same violation.",
            },
            {},
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.success, false);
    assert.ok(String(result.body?.message).includes("already been submitted"));
});

test("status update: citizen attempting to approve/reject appeal is rejected with 403 Forbidden", async () => {
    const handlers = createAppealHandlers(createMockServices());
    const { response, result } = makeResponse();

    await handlers.updateStatus(
        request({ status: "APPROVED" }, { id: appealId }, { id: citizenId, role: "CITIZEN" }),
        response,
    );

    assert.equal(result.statusCode, 403);
    assert.equal(result.body?.success, false);
});

test("status update: invalid or unsupported status returns 400 Bad Request", async () => {
    const handlers = createAppealHandlers(createMockServices());

    // Invalid status string
    {
        const { response, result } = makeResponse();
        await handlers.updateStatus(
            request({ status: "DISMISSED" }, { id: appealId }, { id: "admin-1", role: "ADMIN" }),
            response,
        );
        assert.equal(result.statusCode, 400);
        assert.equal(result.body?.success, false);
        assert.ok(String(result.body?.message).includes("must be APPROVED or REJECTED"));
    }

    // Missing status
    {
        const { response, result } = makeResponse();
        await handlers.updateStatus(
            request({}, { id: appealId }, { id: "admin-1", role: "ADMIN" }),
            response,
        );
        assert.equal(result.statusCode, 400);
        assert.equal(result.body?.success, false);
    }

    // Review notes too long (> 1000)
    {
        const { response, result } = makeResponse();
        await handlers.updateStatus(
            request({ status: "APPROVED", reviewNotes: "X".repeat(1001) }, { id: appealId }, { id: "admin-1", role: "ADMIN" }),
            response,
        );
        assert.equal(result.statusCode, 400);
        assert.equal(result.body?.success, false);
    }
});

test("status update: ADMIN and TRAFFIC_POLICE can approve and reject appeals", async () => {
    let updatedPayload: Record<string, unknown> | null = null;
    const services = createMockServices({
        updateAppealStatus: async (params) => {
            updatedPayload = params;
            return {
                ...mockPendingAppeal,
                status: params.status,
                reviewNotes: params.reviewNotes ?? null,
                reviewedBy: params.reviewedBy,
                reviewedAt: params.reviewedAt,
            };
        },
    });
    const handlers = createAppealHandlers(services);

    // ADMIN approves
    {
        const { response, result } = makeResponse();
        await handlers.updateStatus(
            request(
                { status: "APPROVED", reviewNotes: "Evidence confirms ambulance clearance." },
                { id: appealId },
                { id: "admin-id", role: "ADMIN" },
            ),
            response,
        );

        assert.equal(result.statusCode, 200);
        assert.equal(result.body?.success, true);
        const appeal = result.body?.appeal as AppealRecord;
        assert.equal(appeal.status, "APPROVED");
        assert.equal(updatedPayload?.reviewedBy, "admin-id");
        assert.equal(updatedPayload?.reviewNotes, "Evidence confirms ambulance clearance.");
    }

    // TRAFFIC_POLICE rejects
    {
        const { response, result } = makeResponse();
        await handlers.updateStatus(
            request(
                { status: "REJECTED", reviewNotes: "No emergency vehicle was in the vicinity." },
                { id: appealId },
                { id: "police-id", role: "TRAFFIC_POLICE" },
            ),
            response,
        );

        assert.equal(result.statusCode, 200);
        assert.equal(result.body?.success, true);
        const appeal = result.body?.appeal as AppealRecord;
        assert.equal(appeal.status, "REJECTED");
        assert.equal(updatedPayload?.reviewedBy, "police-id");
    }
});

test("status update: returns 404 when appeal does not exist", async () => {
    const services = createMockServices({
        updateAppealStatus: async () => null,
    });
    const handlers = createAppealHandlers(services);
    const { response, result } = makeResponse();

    await handlers.updateStatus(
        request(
            { status: "APPROVED" },
            { id: "999e8400-e29b-41d4-a716-446655440099" },
            { id: "admin-id", role: "ADMIN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 404);
    assert.equal(result.body?.success, false);
});

test("citizen listAppeals scopes results to authenticated citizen", async () => {
    let capturedCitizenId: string | undefined;
    const services = createMockServices({
        listAppeals: async (cId) => {
            capturedCitizenId = cId;
            return [mockPendingAppeal];
        },
    });
    const handlers = createAppealHandlers(services);
    const { response, result } = makeResponse();

    await handlers.list(
        request({}, {}, { id: citizenId, role: "CITIZEN" }),
        response,
    );

    assert.equal(result.statusCode, 200);
    assert.equal(capturedCitizenId, citizenId);
    assert.equal((result.body?.appeals as AppealRecord[]).length, 1);
});

test("admin listAppeals returns all appeals without citizen scope", async () => {
    let capturedCitizenId: string | undefined;
    const services = createMockServices({
        listAppeals: async (cId) => {
            capturedCitizenId = cId;
            return [mockPendingAppeal];
        },
    });
    const handlers = createAppealHandlers(services);
    const { response, result } = makeResponse();

    await handlers.list(
        request({}, {}, { id: "admin-1", role: "ADMIN" }),
        response,
    );

    assert.equal(result.statusCode, 200);
    assert.equal(capturedCitizenId, undefined);
});

test("citizen getAppeal prevents access to another citizen's appeal (403)", async () => {
    const services = createMockServices({
        getAppeal: async () => ({
            ...mockPendingAppeal,
            citizenId: otherCitizenId, // belongs to other citizen
        }),
    });
    const handlers = createAppealHandlers(services);
    const { response, result } = makeResponse();

    await handlers.getOne(
        request({}, { id: appealId }, { id: citizenId, role: "CITIZEN" }),
        response,
    );

    assert.equal(result.statusCode, 403);
    assert.equal(result.body?.success, false);
    assert.ok(String(result.body?.message).includes("not authorized"));
});

