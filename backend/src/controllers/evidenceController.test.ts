import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
    createEvidenceHandlers,
    type EvidenceCreateInput,
    type EvidenceRecord,
    type EvidenceServices,
} from "./evidenceController.js";
import {
    createMemoryEvidenceStorage,
    type EvidenceStorage,
} from "../evidence/evidenceStorage.js";

type Result = { statusCode: number; body?: Record<string, unknown>; headers?: Record<string, string>; sent?: Buffer };

function makeResponse(): { response: Response; result: Result } {
    const result: Result = { statusCode: 200, headers: {} };
    const response = {
        status(statusCode: number) {
            result.statusCode = statusCode;
            return this;
        },
        json(body: Record<string, unknown>) {
            result.body = body;
            return this;
        },
        setHeader(name: string, value: string) {
            result.headers = result.headers ?? {};
            result.headers[name] = value;
            return this;
        },
        send(data: Buffer) {
            result.sent = data;
            return this;
        },
    };
    return { response: response as unknown as Response, result };
}

function makeRequest(
    body: Record<string, unknown>,
    params: Record<string, string> = {},
    authenticatedUser?: { id: string; role: string },
): Request {
    return { body, params, authenticatedUser } as unknown as Request;
}

const violationId = "550e8400-e29b-41d4-a716-446655440000";
const policeId = "660e8400-e29b-41d4-a716-446655440001";
const citizenId = "770e8400-e29b-41d4-a716-446655440002";
const otherCitizenId = "880e8400-e29b-41d4-a716-446655440003";

const sampleEvidence: EvidenceRecord = {
    id: "990e8400-e29b-41d4-a716-446655440004",
    violationId,
    originalName: "dashcam.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    storageKey: `violations/${violationId}/990e8400-e29b-41d4-a716-446655440004/file.jpg`,
    uploaderId: policeId,
    createdAt: new Date("2026-10-11T10:00:00.000Z"),
};

function createMockServices(overrides: Partial<EvidenceServices> = {}): {
    services: EvidenceServices;
    dbStore: EvidenceRecord[];
    deletedStorageKeys: string[];
} {
    const dbStore: EvidenceRecord[] = [sampleEvidence];
    const deletedStorageKeys: string[] = [];
    const memoryStorage = createMemoryEvidenceStorage();

    const services: EvidenceServices = {
        createEvidence: async (data: EvidenceCreateInput) => {
            const record: EvidenceRecord = {
                ...data,
                createdAt: new Date(),
            };
            dbStore.push(record);
            return record;
        },
        listEvidence: async (vId: string) => dbStore.filter((e) => e.violationId === vId),
        getEvidence: async (vId: string, eId: string) =>
            dbStore.find((e) => e.violationId === vId && e.id === eId) ?? null,
        getViolation: async (id: string) => {
            if (id === violationId) {
                return { id, violatingUserId: citizenId };
            }
            return null;
        },
        getUser: async (id: string) => {
            if (id === policeId) return { id, role: "TRAFFIC_POLICE", isActive: true };
            if (id === citizenId) return { id, role: "CITIZEN", isActive: true };
            return { id, role: "ADMIN", isActive: true };
        },
        storage: {
            ...memoryStorage,
            delete: async (key: string) => {
                deletedStorageKeys.push(key);
                await memoryStorage.delete(key);
            },
        },
        ...overrides,
    };

    return { services, dbStore, deletedStorageKeys };
}

const validJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x10, 0x20]);
const validPayload = {
    originalName: "camera.jpg",
    mimeType: "image/jpeg",
    sizeBytes: validJpegBytes.length,
    content: Buffer.from(validJpegBytes).toString("base64"),
};

test("upload succeeds for TRAFFIC_POLICE and creates evidence record", async () => {
    const { services, dbStore } = createMockServices();
    const handlers = createEvidenceHandlers(services);
    const { response, result } = makeResponse();

    const req = makeRequest(validPayload, { id: violationId }, { id: policeId, role: "TRAFFIC_POLICE" });
    await handlers.upload(req, response);

    assert.equal(result.statusCode, 201);
    assert.equal(result.body?.success, true);
    const created = result.body?.evidence as EvidenceRecord;
    assert.equal(created.violationId, violationId);
    assert.equal(created.originalName, "camera.jpg");
    assert.equal(created.uploaderId, policeId);
    assert.match(created.storageKey, new RegExp(`^violations/${violationId}/`));
    assert.equal(dbStore.some((e) => e.id === created.id), true);
});

test("supports multiple evidence records per violation", async () => {
    const { services } = createMockServices();
    const handlers = createEvidenceHandlers(services);

    const { response: res1, result: res1Result } = makeResponse();
    await handlers.upload(
        makeRequest({ ...validPayload, originalName: "file1.jpg" }, { id: violationId }, { id: policeId, role: "TRAFFIC_POLICE" }),
        res1,
    );
    assert.equal(res1Result.statusCode, 201);

    const { response: res2, result: res2Result } = makeResponse();
    await handlers.upload(
        makeRequest({ ...validPayload, originalName: "file2.jpg" }, { id: violationId }, { id: policeId, role: "TRAFFIC_POLICE" }),
        res2,
    );
    assert.equal(res2Result.statusCode, 201);

    const { response: listRes, result: listResult } = makeResponse();
    await handlers.list(
        makeRequest({}, { id: violationId }, { id: policeId, role: "TRAFFIC_POLICE" }),
        listRes,
    );
    assert.equal(listResult.statusCode, 200);
    const list = listResult.body?.evidence as EvidenceRecord[];
    // Initial sampleEvidence + 2 uploads = 3
    assert.equal(list.length, 3);
});

test("upload rejects unauthenticated and unauthorized users", async () => {
    const { services } = createMockServices();
    const handlers = createEvidenceHandlers(services);

    // Unauthenticated
    const { response: unauthRes, result: unauthResult } = makeResponse();
    await handlers.upload(makeRequest(validPayload, { id: violationId }), unauthRes);
    assert.equal(unauthResult.statusCode, 401);

    // Citizen upload rejected
    const { response: citizenRes, result: citizenResult } = makeResponse();
    await handlers.upload(
        makeRequest(validPayload, { id: violationId }, { id: citizenId, role: "CITIZEN" }),
        citizenRes,
    );
    assert.equal(citizenResult.statusCode, 403);

    // Inactive police user rejected
    const inactiveServices = {
        ...services,
        getUser: async (id: string) => ({ id, role: "TRAFFIC_POLICE", isActive: false }),
    };
    const { response: inactiveRes, result: inactiveResult } = makeResponse();
    await createEvidenceHandlers(inactiveServices).upload(
        makeRequest(validPayload, { id: violationId }, { id: policeId, role: "TRAFFIC_POLICE" }),
        inactiveRes,
    );
    assert.equal(inactiveResult.statusCode, 403);
});

test("upload rejects missing or invalid violation ID", async () => {
    const { services } = createMockServices();
    const handlers = createEvidenceHandlers(services);

    // Malformed UUID
    const { response: badIdRes, result: badIdResult } = makeResponse();
    await handlers.upload(
        makeRequest(validPayload, { id: "not-a-uuid" }, { id: policeId, role: "TRAFFIC_POLICE" }),
        badIdRes,
    );
    assert.equal(badIdResult.statusCode, 400);

    // Non-existent violation (valid UUID format, but not in DB)
    const missingViolationId = "11111111-1111-4111-a111-111111111111";
    const { response: missingRes, result: missingResult } = makeResponse();
    await handlers.upload(
        makeRequest(validPayload, { id: missingViolationId }, { id: policeId, role: "TRAFFIC_POLICE" }),
        missingRes,
    );
    assert.equal(missingResult.statusCode, 404);
});

test("upload rejects empty, oversized, unsupported, and malformed files", async () => {
    const { services } = createMockServices();
    const handlers = createEvidenceHandlers(services);

    // Empty file (sizeBytes: 0)
    const { response: emptyRes, result: emptyResult } = makeResponse();
    await handlers.upload(
        makeRequest(
            { originalName: "empty.jpg", mimeType: "image/jpeg", sizeBytes: 0, content: "" },
            { id: violationId },
            { id: policeId, role: "TRAFFIC_POLICE" },
        ),
        emptyRes,
    );
    assert.equal(emptyResult.statusCode, 400);

    // Unsupported MIME type
    const { response: unsuppRes, result: unsuppResult } = makeResponse();
    await handlers.upload(
        makeRequest(
            { originalName: "script.sh", mimeType: "text/x-shellscript", sizeBytes: 7, content: Buffer.from("echo hi").toString("base64") },
            { id: violationId },
            { id: policeId, role: "TRAFFIC_POLICE" },
        ),
        unsuppRes,
    );
    assert.equal(unsuppResult.statusCode, 415);

    // Oversized (>10MB)
    const { response: overRes, result: overResult } = makeResponse();
    await handlers.upload(
        makeRequest(
            { originalName: "huge.pdf", mimeType: "application/pdf", sizeBytes: 10 * 1024 * 1024 + 10 },
            { id: violationId },
            { id: policeId, role: "TRAFFIC_POLICE" },
        ),
        overRes,
    );
    assert.equal(overResult.statusCode, 413);

    // Malformed content (content does not match JPEG magic bytes)
    const { response: malformedRes, result: malformedResult } = makeResponse();
    await handlers.upload(
        makeRequest(
            { originalName: "fake.jpg", mimeType: "image/jpeg", sizeBytes: 20, content: Buffer.from("not a real jpeg file").toString("base64") },
            { id: violationId },
            { id: policeId, role: "TRAFFIC_POLICE" },
        ),
        malformedRes,
    );
    assert.equal(malformedResult.statusCode, 400);

    // Malformed Base64 string
    const { response: badB64Res, result: badB64Result } = makeResponse();
    await handlers.upload(
        makeRequest(
            { originalName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 10, content: "not-valid-base64!!!" },
            { id: violationId },
            { id: policeId, role: "TRAFFIC_POLICE" },
        ),
        badB64Res,
    );
    assert.equal(badB64Result.statusCode, 400);

    // Size mismatch between declared sizeBytes and decoded content length
    const { response: mismatchRes, result: mismatchResult } = makeResponse();
    await handlers.upload(
        makeRequest(
            { originalName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 9999, content: Buffer.from(validJpegBytes).toString("base64") },
            { id: violationId },
            { id: policeId, role: "TRAFFIC_POLICE" },
        ),
        mismatchRes,
    );
    assert.equal(mismatchResult.statusCode, 400);

    // Missing content entirely
    const { response: noContentRes, result: noContentResult } = makeResponse();
    await handlers.upload(
        makeRequest(
            { originalName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 100 },
            { id: violationId },
            { id: policeId, role: "TRAFFIC_POLICE" },
        ),
        noContentRes,
    );
    assert.equal(noContentResult.statusCode, 400);
});

test("failed storage upload does not leave orphaned database records", async () => {
    const initialDbCount = 1;
    const { services, dbStore } = createMockServices({
        storage: {
            upload: async () => {
                throw new Error("Storage provider network error");
            },
            delete: async () => {},
        },
    });

    const handlers = createEvidenceHandlers(services);
    const { response, result } = makeResponse();

    await handlers.upload(
        makeRequest(validPayload, { id: violationId }, { id: policeId, role: "TRAFFIC_POLICE" }),
        response,
    );

    assert.equal(result.statusCode, 500);
    assert.equal(result.body?.success, false);
    assert.equal(dbStore.length, initialDbCount); // No orphaned record created!
});

test("failed database save cleans up uploaded storage file", async () => {
    const { services, deletedStorageKeys } = createMockServices({
        createEvidence: async () => {
            throw new Error("Database connection dropped");
        },
    });

    const handlers = createEvidenceHandlers(services);
    const { response, result } = makeResponse();

    await handlers.upload(
        makeRequest(validPayload, { id: violationId }, { id: policeId, role: "TRAFFIC_POLICE" }),
        response,
    );

    assert.equal(result.statusCode, 500);
    assert.equal(result.body?.success, false);
    assert.equal(deletedStorageKeys.length, 1); // Storage key deleted to prevent orphaned file!
});

test("list and detail retrieval access control for citizen vs police/admin", async () => {
    const { services } = createMockServices();
    const handlers = createEvidenceHandlers(services);

    // Police can list evidence
    const { response: policeListRes, result: policeListResult } = makeResponse();
    await handlers.list(
        makeRequest({}, { id: violationId }, { id: policeId, role: "TRAFFIC_POLICE" }),
        policeListRes,
    );
    assert.equal(policeListResult.statusCode, 200);

    // Citizen who owns violation can list evidence
    const { response: ownerListRes, result: ownerListResult } = makeResponse();
    await handlers.list(
        makeRequest({}, { id: violationId }, { id: citizenId, role: "CITIZEN" }),
        ownerListRes,
    );
    assert.equal(ownerListResult.statusCode, 200);

    // Another citizen CANNOT list evidence for this violation (returns 404)
    const { response: otherListRes, result: otherListResult } = makeResponse();
    await handlers.list(
        makeRequest({}, { id: violationId }, { id: otherCitizenId, role: "CITIZEN" }),
        otherListRes,
    );
    assert.equal(otherListResult.statusCode, 404);

    // Detail: Owner citizen can get detail
    const { response: ownerDetailRes, result: ownerDetailResult } = makeResponse();
    await handlers.getOne(
        makeRequest({}, { id: violationId, evidenceId: sampleEvidence.id }, { id: citizenId, role: "CITIZEN" }),
        ownerDetailRes,
    );
    assert.equal(ownerDetailResult.statusCode, 200);
    assert.equal((ownerDetailResult.body?.evidence as EvidenceRecord).id, sampleEvidence.id);

    // Detail: Other citizen gets 404
    const { response: otherDetailRes, result: otherDetailResult } = makeResponse();
    await handlers.getOne(
        makeRequest({}, { id: violationId, evidenceId: sampleEvidence.id }, { id: otherCitizenId, role: "CITIZEN" }),
        otherDetailRes,
    );
    assert.equal(otherDetailResult.statusCode, 404);

    // Missing evidence ID returns 404
    const { response: missingEvidenceRes, result: missingEvidenceResult } = makeResponse();
    await handlers.getOne(
        makeRequest({}, { id: violationId, evidenceId: "22222222-2222-4222-a222-222222222222" }, { id: policeId, role: "TRAFFIC_POLICE" }),
        missingEvidenceRes,
    );
    assert.equal(missingEvidenceResult.statusCode, 404);
});

test("content download endpoint serves stored file and respects authorization", async () => {
    const memoryStorage = createMemoryEvidenceStorage();
    await memoryStorage.upload({
        key: sampleEvidence.storageKey,
        contentType: sampleEvidence.mimeType,
        body: validJpegBytes,
    });

    const { services } = createMockServices({ storage: memoryStorage });
    const handlers = createEvidenceHandlers(services);

    // Authorized download by police
    const { response: policeRes, result: policeResult } = makeResponse();
    await handlers.getContent(
        makeRequest({}, { id: violationId, evidenceId: sampleEvidence.id }, { id: policeId, role: "TRAFFIC_POLICE" }),
        policeRes,
    );
    assert.equal(policeResult.statusCode, 200);
    assert.equal(policeResult.headers?.["Content-Type"], "image/jpeg");
    assert.deepEqual(policeResult.sent, Buffer.from(validJpegBytes));

    // Unauthorized download by another citizen returns 404
    const { response: otherRes, result: otherResult } = makeResponse();
    await handlers.getContent(
        makeRequest({}, { id: violationId, evidenceId: sampleEvidence.id }, { id: otherCitizenId, role: "CITIZEN" }),
        otherRes,
    );
    assert.equal(otherResult.statusCode, 404);
});
