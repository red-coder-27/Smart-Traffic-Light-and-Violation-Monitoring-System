import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
    createChallanHandlers,
    type ChallanRecord,
    type ChallanServices,
} from "./challanController.js";

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
    headers: Record<string, string> = {},
): Request {
    return {
        body,
        params,
        authenticatedUser,
        header: (name: string) => headers[name] || headers[name.toLowerCase()],
    } as unknown as Request;
}

const citizenId = "111e8400-e29b-41d4-a716-446655440001";
const otherCitizenId = "222e8400-e29b-41d4-a716-446655440002";
const violationId = "333e8400-e29b-41d4-a716-446655440003";
const challanId = "444e8400-e29b-41d4-a716-446655440004";

const mockUnpaidChallan: ChallanRecord = {
    id: challanId,
    challanNumber: "CHAL-20261024-ABC1",
    violationId,
    citizenId,
    amount: 1000,
    status: "UNPAID",
    paidAt: null,
    paymentReference: null,
    paymentMethod: null,
    notes: "Red light violation at Cross St",
    createdAt: new Date("2026-10-24T10:00:00.000Z"),
    updatedAt: new Date("2026-10-24T10:00:00.000Z"),
    violation: {
        id: violationId,
        occurredAt: new Date("2026-10-24T09:30:00.000Z"),
        violationType: "RED_LIGHT",
        description: "Vehicle ran red light",
        intersection: { id: "int-1", name: "Main & 5th", location: "Downtown" },
        trafficSignal: { id: "sig-1", status: "RED" },
    },
    citizen: {
        id: citizenId,
        name: "Jordan Lee",
        email: "jordan@example.com",
        phone: "+15551234567",
    },
};

const mockPaidChallan: ChallanRecord = {
    ...mockUnpaidChallan,
    status: "PAID",
    paidAt: new Date("2026-10-24T11:00:00.000Z"),
    paymentReference: "SIMPAY-1234-XYZ",
    paymentMethod: "SIMULATED_UPI",
};

function createMockServices(overrides: Partial<ChallanServices> = {}): ChallanServices {
    return {
        listChallans: async (cId) => (cId ? [mockUnpaidChallan] : [mockUnpaidChallan, mockPaidChallan]),
        getChallan: async (id) => (id === challanId || id === mockUnpaidChallan.challanNumber ? mockUnpaidChallan : null),
        getViolation: async (vId) => (vId === violationId ? { id: violationId, violatingUserId: citizenId, violationType: "RED_LIGHT" } : null),
        challanExistsForViolation: async () => false,
        createChallan: async (data) => ({
            id: "new-challan-id",
            challanNumber: "CHAL-20261024-NEW1",
            violationId: data.violationId,
            citizenId: data.citizenId,
            amount: data.amount,
            status: "UNPAID",
            paidAt: null,
            paymentReference: null,
            paymentMethod: null,
            notes: data.notes ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
        }),
        processPayment: async (params) => {
            const updatedChallan: ChallanRecord = {
                ...mockUnpaidChallan,
                status: params.status === "SUCCESS" ? "PAID" : "UNPAID",
                paidAt: params.paidAt ?? null,
                paymentReference: params.status === "SUCCESS" ? params.reference : null,
                paymentMethod: params.status === "SUCCESS" ? params.paymentMethod : null,
            };
            return {
                challan: updatedChallan,
                transaction: { id: "tx-1", reference: params.reference, status: params.status },
            };
        },
        ...overrides,
    };
}

test("successful simulated payment marks challan as paid and returns payment reference", async () => {
    let capturedPayment: Record<string, unknown> | undefined;
    const services = createMockServices({
        processPayment: async (params) => {
            capturedPayment = params;
            return {
                challan: {
                    ...mockUnpaidChallan,
                    status: "PAID",
                    paidAt: params.paidAt ?? new Date(),
                    paymentReference: params.reference,
                    paymentMethod: params.paymentMethod,
                },
                transaction: { id: "tx-100", reference: params.reference, status: "SUCCESS" },
            };
        },
    });

    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.simulatePayment(
        request(
            { paymentMethod: "SIMULATED_UPI", simulationOutcome: "SUCCESS" },
            { id: challanId },
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.body?.success, true);
    assert.equal(result.body?.message, "Simulated payment processed successfully");
    const payment = result.body?.payment as Record<string, unknown>;
    assert.equal(payment.status, "PAID");
    assert.equal(payment.amount, 1000);
    assert.equal(payment.paymentMethod, "SIMULATED_UPI");
    assert.ok(typeof payment.reference === "string" && payment.reference.startsWith("SIMPAY-"));

    assert.equal(capturedPayment?.status, "SUCCESS");
    assert.equal(capturedPayment?.amount, 1000);
});

test("failed simulated payment records failure, leaves challan UNPAID, and returns 400", async () => {
    let capturedPayment: Record<string, unknown> | undefined;
    const services = createMockServices({
        processPayment: async (params) => {
            capturedPayment = params;
            return {
                challan: mockUnpaidChallan,
                transaction: { id: "tx-fail-1", reference: params.reference, status: "FAILED" },
            };
        },
    });

    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.simulatePayment(
        request(
            { paymentMethod: "SIMULATED_CARD", simulationOutcome: "FAILURE" },
            { id: challanId },
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 400);
    assert.equal(result.body?.success, false);
    assert.equal(result.body?.status, "FAILED");
    assert.equal(result.body?.failureReason, "TRANSACTION_DECLINED");
    assert.ok(typeof result.body?.message === "string" && result.body.message.includes("failed"));

    assert.equal(capturedPayment?.status, "FAILED");
    assert.equal(capturedPayment?.amount, 1000);
});

test("payment attempt on already-paid challan is rejected with 409 Conflict", async () => {
    const services = createMockServices({
        getChallan: async () => mockPaidChallan,
    });

    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.simulatePayment(
        request(
            { paymentMethod: "SIMULATED_UPI" },
            { id: challanId },
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.success, false);
    assert.equal(result.body?.message, "Challan has already been paid");
});

test("payment attempt by non-owner citizen is rejected with 403 Forbidden", async () => {
    const services = createMockServices();
    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.simulatePayment(
        request(
            { paymentMethod: "SIMULATED_UPI" },
            { id: challanId },
            { id: otherCitizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 403);
    assert.equal(result.body?.success, false);
    assert.ok(typeof result.body?.message === "string" && result.body.message.includes("Forbidden"));
});

test("payment attempt on nonexistent challan returns 404 Not Found", async () => {
    const services = createMockServices({
        getChallan: async () => null,
    });

    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.simulatePayment(
        request(
            { paymentMethod: "SIMULATED_UPI" },
            { id: "nonexistent-id" },
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 404);
    assert.equal(result.body?.success, false);
    assert.equal(result.body?.message, "Challan not found");
});

test("server strictly derives payable amount from trusted challan data and ignores client amount", async () => {
    let chargedAmount: number | undefined;
    const services = createMockServices({
        processPayment: async (params) => {
            chargedAmount = params.amount;
            return {
                challan: { ...mockUnpaidChallan, status: "PAID" },
                transaction: { id: "tx-2", reference: params.reference, status: "SUCCESS" },
            };
        },
    });

    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    // Client maliciously attempts to pay ₹1 instead of trusted ₹1000
    await handlers.simulatePayment(
        request(
            { paymentMethod: "SIMULATED_UPI", amount: 1 },
            { id: challanId },
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 200);
    // Server must have used the trusted ₹1000 from the challan record
    assert.equal(chargedAmount, 1000);
    const payment = result.body?.payment as Record<string, unknown>;
    assert.equal(payment.amount, 1000);
});

test("duplicate payment request with idempotency key returns cached successful outcome", async () => {
    const cachedTx = {
        id: "tx-idem-1",
        reference: "SIMPAY-IDEMPOTENT-REF",
        status: "SUCCESS",
        challanId,
        amount: 1000,
        failureReason: null,
        createdAt: new Date("2026-10-24T10:05:00.000Z"),
    };

    let processPaymentCalled = false;
    const services = createMockServices({
        getTransactionByIdempotencyKey: async (key) => (key === "idem-key-123" ? cachedTx : null),
        processPayment: async () => {
            processPaymentCalled = true;
            throw new Error("Should not be called for duplicate idempotent request");
        },
    });

    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.simulatePayment(
        request(
            { paymentMethod: "SIMULATED_UPI", idempotencyKey: "idem-key-123" },
            { id: challanId },
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.body?.success, true);
    assert.ok(typeof result.body?.message === "string" && result.body.message.includes("idempotent"));
    const payment = result.body?.payment as Record<string, unknown>;
    assert.equal(payment.reference, "SIMPAY-IDEMPOTENT-REF");
    assert.equal(processPaymentCalled, false);
});

test("payment attempt with invalid payment method is rejected with 400", async () => {
    const services = createMockServices();
    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.simulatePayment(
        request(
            { paymentMethod: "REAL_CREDIT_CARD_GATEWAY" },
            { id: challanId },
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 400);
    assert.equal(result.body?.success, false);
    assert.ok(typeof result.body?.message === "string" && result.body.message.includes("Valid paymentMethod is required"));
});

test("citizen listChallans scopes results to authenticated citizen", async () => {
    let queriedCitizenId: string | undefined;
    const services = createMockServices({
        listChallans: async (cId) => {
            queriedCitizenId = cId;
            return [mockUnpaidChallan];
        },
    });

    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.list(
        request({}, {}, { id: citizenId, role: "CITIZEN" }),
        response,
    );

    assert.equal(result.statusCode, 200);
    assert.equal(queriedCitizenId, citizenId);
});

test("admin listChallans returns all challans without citizen scope", async () => {
    let queriedCitizenId: string | undefined;
    const services = createMockServices({
        listChallans: async (cId) => {
            queriedCitizenId = cId;
            return [mockUnpaidChallan, mockPaidChallan];
        },
    });

    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.list(
        request({}, {}, { id: "admin-id", role: "ADMIN" }),
        response,
    );

    assert.equal(result.statusCode, 200);
    assert.equal(queriedCitizenId, undefined);
    const list = result.body?.challans as unknown[];
    assert.equal(list.length, 2);
});

test("admin can generate a challan for a violation", async () => {
    let capturedAmount: number | undefined;
    const services = createMockServices({
        createChallan: async (data) => {
            capturedAmount = data.amount;
            return {
                ...mockUnpaidChallan,
                amount: data.amount,
                notes: data.notes ?? null,
            };
        },
    });
    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.create(
        request(
            { violationId, notes: "Red light at intersection" },
            {},
            { id: "admin-id", role: "ADMIN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 201);
    assert.equal(result.body?.success, true);
    const created = result.body?.challan as Record<string, unknown>;
    assert.equal(created.amount, 1000);
    assert.equal(capturedAmount, 1000);
});

test("manual challan creation rejects unknown violation types", async () => {
    const services = createMockServices({
        getViolation: async () => ({ id: violationId, violatingUserId: citizenId, violationType: "UNLISTED_TYPE" }),
    });
    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.create(
        request({ violationId }, {}, { id: "admin-id", role: "ADMIN" }),
        response,
    );

    assert.equal(result.statusCode, 400);
    assert.equal(result.body?.success, false);
});

test("manual challan creation reports concurrent duplicate conflicts", async () => {
    const handlers = createChallanHandlers(createMockServices({
        createChallan: async () => {
            throw { code: "P2002" };
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(
        request({ violationId }, {}, { id: "admin-id", role: "ADMIN" }),
        response,
    );

    assert.equal(result.statusCode, 409);
});

test("manual challan creation prevents duplicate challans for one violation", async () => {
    let createCalled = false;
    const handlers = createChallanHandlers(createMockServices({
        challanExistsForViolation: async () => true,
        createChallan: async () => {
            createCalled = true;
            return mockUnpaidChallan;
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(
        request({ violationId }, {}, { id: "admin-id", role: "ADMIN" }),
        response,
    );

    assert.equal(result.statusCode, 409);
    assert.equal(createCalled, false);
});

test("manual challan creation rejects caller-supplied fine amounts", async () => {
    let createCalled = false;
    const handlers = createChallanHandlers(createMockServices({
        createChallan: async () => {
            createCalled = true;
            return mockUnpaidChallan;
        },
    }));
    const { response, result } = makeResponse();

    await handlers.create(
        request({ violationId, amount: 1 }, {}, { id: "admin-id", role: "ADMIN" }),
        response,
    );

    assert.equal(result.statusCode, 400);
    assert.equal(createCalled, false);
});

test("challan details can be retrieved using the unique challan number", async () => {
    let requestedIdentifier = "";
    const handlers = createChallanHandlers(createMockServices({
        getChallan: async (identifier) => {
            requestedIdentifier = identifier;
            return identifier === mockUnpaidChallan.challanNumber ? mockUnpaidChallan : null;
        },
    }));
    const { response, result } = makeResponse();

    await handlers.getOne(
        request({}, { id: mockUnpaidChallan.challanNumber }, { id: citizenId, role: "CITIZEN" }),
        response,
    );

    assert.equal(result.statusCode, 200);
    assert.equal(requestedIdentifier, mockUnpaidChallan.challanNumber);
});

test("citizens cannot retrieve another citizen's challan", async () => {
    let requestedCitizenId: string | undefined;
    const handlers = createChallanHandlers(createMockServices({
        getChallan: async (_identifier, ownerId) => {
            requestedCitizenId = ownerId;
            return null;
        },
    }));
    const { response, result } = makeResponse();

    await handlers.getOne(
        request({}, { id: challanId }, { id: otherCitizenId, role: "CITIZEN" }),
        response,
    );

    assert.equal(result.statusCode, 404);
    assert.equal(requestedCitizenId, otherCitizenId);
});

test("citizen cannot generate a challan", async () => {
    const services = createMockServices();
    const handlers = createChallanHandlers(services);
    const { response, result } = makeResponse();

    await handlers.create(
        request(
            { violationId, amount: 1000 },
            {},
            { id: citizenId, role: "CITIZEN" },
        ),
        response,
    );

    assert.equal(result.statusCode, 403);
    assert.equal(result.body?.success, false);
});
