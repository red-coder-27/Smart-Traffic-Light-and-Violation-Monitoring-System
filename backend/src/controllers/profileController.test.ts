import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
    createGetProfileHandler,
    createUpdateProfileHandler,
} from "./profileController.js";

type ProfileResult = {
    statusCode: number;
    body?: Record<string, unknown>;
};

function makeResponse(): { response: Response; result: ProfileResult } {
    const result: ProfileResult = { statusCode: 200 };
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

function makeRequest(body: Record<string, unknown> = {}, authUser = { id: "user-1", role: "CITIZEN" }): Request {
    return {
        body,
        authenticatedUser: authUser,
        header: () => undefined,
    } as unknown as Request;
}

test("get profile returns only safe user and profile fields", async () => {
    const getProfile = createGetProfileHandler({
        getUser: async () => ({
            id: "user-1",
            name: "Nithesh Kumar",
            email: "nithesh@example.com",
            role: "CITIZEN",
            phone: "9876543210",
            passwordHash: "secret",
            isActive: true,
            profile: {
                id: "profile-1",
                userId: "user-1",
                address: "123 Main Street",
                city: "Coimbatore",
                state: "Tamil Nadu",
                postalCode: "641001",
                dateOfBirth: new Date("2006-05-10T00:00:00.000Z"),
            },
        }),
    });

    const { response, result } = makeResponse();
    await getProfile(makeRequest(), response);

    assert.equal(result.statusCode, 200);
    assert.equal(result.body?.success, true);
    assert.deepEqual(result.body?.profile, {
        id: "profile-1",
        userId: "user-1",
        name: "Nithesh Kumar",
        email: "nithesh@example.com",
        phone: "9876543210",
        role: "CITIZEN",
        address: "123 Main Street",
        city: "Coimbatore",
        state: "Tamil Nadu",
        postalCode: "641001",
        dateOfBirth: "2006-05-10",
    });
    assert.equal("passwordHash" in (result.body?.profile as Record<string, unknown>), false);
});

test("update profile updates user and profile fields while ignoring forbidden fields", async () => {
    let savedUserUpdate: Record<string, unknown> | undefined;
    let savedProfileUpdate: Record<string, unknown> | undefined;

    const updateProfile = createUpdateProfileHandler({
        getUser: async () => ({
            id: "user-1",
            name: "Old Name",
            email: "nithesh@example.com",
            role: "CITIZEN",
            phone: "1111111111",
            isActive: true,
            passwordHash: "old-hash",
            profile: {
                id: "profile-1",
                userId: "user-1",
                address: "Old Address",
                city: "Old City",
                state: "Old State",
                postalCode: "000000",
                dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
            },
        }),
        updateUser: async (userId, data) => {
            savedUserUpdate = { userId, ...data };
            return {
                id: userId,
                name: data.name ?? "Old Name",
                email: "nithesh@example.com",
                role: "CITIZEN",
                phone: data.phone ?? "1111111111",
                isActive: true,
                passwordHash: "should-not-show",
            };
        },
        upsertProfile: async (userId, data) => {
            savedProfileUpdate = { userId, ...data };
            return {
                id: "profile-1",
                userId,
                address: data.address ?? "Old Address",
                city: data.city ?? "Old City",
                state: data.state ?? "Old State",
                postalCode: data.postalCode ?? "000000",
                dateOfBirth: data.dateOfBirth ?? new Date("2000-01-01T00:00:00.000Z"),
            };
        },
    });

    const { response, result } = makeResponse();
    await updateProfile(makeRequest({
        name: "Nithesh Kumar",
        phone: "9876543210",
        address: "123 Main Street",
        city: "Coimbatore",
        state: "Tamil Nadu",
        postalCode: "641001",
        dateOfBirth: "2006-05-10",
        role: "ADMIN",
        passwordHash: "hacked",
        isActive: false,
    }), response);

    assert.equal(result.statusCode, 200);
    assert.equal(savedUserUpdate?.userId, "user-1");
    assert.equal(savedUserUpdate?.name, "Nithesh Kumar");
    assert.equal(savedUserUpdate?.phone, "9876543210");
    assert.equal(savedProfileUpdate?.userId, "user-1");
    assert.equal(savedProfileUpdate?.address, "123 Main Street");
    assert.equal(savedProfileUpdate?.city, "Coimbatore");
    assert.equal(savedProfileUpdate?.state, "Tamil Nadu");
    assert.equal(savedProfileUpdate?.postalCode, "641001");
    assert.equal(result.body?.profile?.role, "CITIZEN");
    assert.equal("passwordHash" in (result.body?.profile as Record<string, unknown>), false);
});

test("update profile rejects invalid input", async () => {
    const updateProfile = createUpdateProfileHandler({
        getUser: async () => ({
            id: "user-1",
            name: "Nithesh Kumar",
            email: "nithesh@example.com",
            role: "CITIZEN",
            phone: "9876543210",
            isActive: true,
            passwordHash: "secret",
            profile: { id: "profile-1", userId: "user-1" },
        }),
        updateUser: async () => { throw new Error("Should not update"); },
        upsertProfile: async () => { throw new Error("Should not update"); },
    });

    const { response, result } = makeResponse();
    await updateProfile(makeRequest({
        phone: "invalid",
        postalCode: "bad-postal-code",
    }), response);

    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.body, {
        success: false,
        message: "Invalid profile data",
    });
});

test("missing token is rejected by auth middleware", async () => {
    const nextCalled = { value: false };
    const req = {
        header: () => undefined,
    } as unknown as Request;
    const { response, result } = makeResponse();

    authMiddleware(req, response, () => {
        nextCalled.value = true;
    });

    assert.equal(result.statusCode, 401);
    assert.deepEqual(result.body, {
        success: false,
        message: "Authentication required",
    });
    assert.equal(nextCalled.value, false);
});

test("invalid token is rejected by auth middleware", async () => {
    const nextCalled = { value: false };
    const req = {
        header: () => "Bearer invalid-token",
    } as unknown as Request;
    const { response, result } = makeResponse();

    process.env.JWT_SECRET = "profile-test-secret";
    authMiddleware(req, response, () => {
        nextCalled.value = true;
    });

    assert.equal(result.statusCode, 401);
    assert.deepEqual(result.body, {
        success: false,
        message: "Invalid or expired token",
    });
    assert.equal(nextCalled.value, false);
});

const secret = "profile-test-secret";
const token = jwt.sign({ id: "user-1", role: "CITIZEN" }, secret);

test("valid token is accepted by auth middleware", async () => {
    process.env.JWT_SECRET = secret;
    const nextCalled = { value: false };
    const req = {
        header: () => `Bearer ${token}`,
    } as unknown as Request;
    const { response, result } = makeResponse();

    authMiddleware(req, response, () => {
        nextCalled.value = true;
    });

    assert.equal(result.statusCode, 200);
    assert.equal(nextCalled.value, true);
    assert.equal((req as any).authenticatedUser?.id, "user-1");
    assert.equal((req as any).authenticatedUser?.role, "CITIZEN");
});
