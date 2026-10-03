import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import {
    createChangePasswordHandler,
    createRegisterHandler,
    type ChangePasswordServices,
    type RegistrationServices,
} from "./authController.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

type RegistrationResult = {
    statusCode: number;
    body?: Record<string, unknown>;
};

function makeResponse(): { response: Response; result: RegistrationResult } {
    const result: RegistrationResult = { statusCode: 200 };
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

function makeRequest(body: Record<string, unknown>): Request {
    return { body } as Request;
}

function makeChangePasswordRequest(
    body: Record<string, unknown>,
    authenticatedUser = { id: "user-1", role: "CITIZEN" },
): AuthenticatedRequest {
    return { body, authenticatedUser } as AuthenticatedRequest;
}

function makeServices(overrides: Partial<RegistrationServices> = {}): RegistrationServices {
    return {
        findByEmail: async () => null,
        createCitizen: async (data) => ({
            id: "citizen-id",
            name: data.name,
            email: data.email,
            role: data.role,
            phone: data.phone,
            isActive: true,
        }),
        hashPassword: async (password) => bcrypt.hash(password, 12),
        ...overrides,
    };
}

function makeChangePasswordServices(
    overrides: Partial<ChangePasswordServices> = {},
): ChangePasswordServices {
    return {
        findById: async () => ({
            id: "user-1",
            passwordHash: await bcrypt.hash("OldPassword@123", 12),
        }),
        comparePassword: async (password, passwordHash) => bcrypt.compare(password, passwordHash),
        hashPassword: async (password) => bcrypt.hash(password, 12),
        updatePassword: async () => {},
        ...overrides,
    };
}

test("register creates a citizen with a bcrypt hash and returns no password hash", async () => {
    let savedData: Record<string, unknown> | undefined;
    const register = createRegisterHandler(makeServices({
        createCitizen: async (data) => {
            savedData = data as Record<string, unknown>;
            return {
                id: "citizen-id",
                name: data.name,
                email: data.email,
                role: data.role,
                phone: data.phone,
                isActive: true,
                passwordHash: data.passwordHash,
            };
        },
    }));

    const { response, result } = makeResponse();
    await register(makeRequest({
        name: "Jordan Lee",
        email: "JORDAN@example.com",
        password: "trafficPass8",
        phone: "+1 (555) 123-4567",
        role: "ADMIN",
    }), response);

    assert.equal(result.statusCode, 201);
    assert.equal(savedData?.role, "CITIZEN");
    assert.equal(savedData?.email, "jordan@example.com");
    assert.notEqual(savedData?.passwordHash, "trafficPass8");
    assert.equal(await bcrypt.compare("trafficPass8", String(savedData?.passwordHash)), true);
    assert.equal(typeof result.body?.user, "object");
    assert.equal("passwordHash" in (result.body?.user as Record<string, unknown>), false);
});

test("register rejects duplicate email", async () => {
    let createCalled = false;
    const register = createRegisterHandler(makeServices({
        findByEmail: async () => ({
            id: "existing",
            name: "Jordan Lee",
            email: "jordan@example.com",
            role: "CITIZEN",
            phone: "5551234567",
            isActive: true,
        }),
        createCitizen: async () => {
            createCalled = true;
            throw new Error("Should not create a duplicate");
        },
    }));
    const { response, result } = makeResponse();

    await register(makeRequest({
        name: "Jordan Lee",
        email: "jordan@example.com",
        password: "trafficPass8",
        phone: "5551234567",
    }), response);

    assert.equal(result.statusCode, 409);
    assert.equal(createCalled, false);
});

test("register rejects invalid email", async () => {
    let findCalled = false;
    const register = createRegisterHandler(makeServices({
        findByEmail: async () => {
            findCalled = true;
            return null;
        },
    }));
    const { response, result } = makeResponse();

    await register(makeRequest({
        name: "Jordan Lee",
        email: "not-an-email",
        password: "trafficPass8",
        phone: "5551234567",
    }), response);

    assert.equal(result.statusCode, 400);
    assert.equal(findCalled, false);
});

test("register rejects missing required fields and short passwords", async () => {
    let findCalled = false;
    const register = createRegisterHandler(makeServices({
        findByEmail: async () => {
            findCalled = true;
            return null;
        },
    }));

    for (const body of [
        { email: "jordan@example.com", password: "trafficPass8", phone: "5551234567" },
        { name: "Jordan Lee", email: "jordan@example.com", password: "trafficPass8" },
        { name: "Jordan Lee", email: "jordan@example.com", password: "short", phone: "5551234567" },
    ]) {
        const { response, result } = makeResponse();
        await register(makeRequest(body), response);
        assert.equal(result.statusCode, 400);
    }

    assert.equal(findCalled, false);
});

test("register rejects unreasonable phone numbers", async () => {
    let findCalled = false;
    const register = createRegisterHandler(makeServices({
        findByEmail: async () => {
            findCalled = true;
            return null;
        },
    }));
    const { response, result } = makeResponse();

    await register(makeRequest({
        name: "Jordan Lee",
        email: "jordan@example.com",
        password: "trafficPass8",
        phone: "123",
    }), response);

    assert.equal(result.statusCode, 400);
    assert.equal(findCalled, false);
});

test("register maps a concurrent email uniqueness conflict to 409", async () => {
    const register = createRegisterHandler(makeServices({
        createCitizen: async () => {
            throw { code: "P2002" };
        },
    }));
    const { response, result } = makeResponse();

    await register(makeRequest({
        name: "Jordan Lee",
        email: "jordan@example.com",
        password: "trafficPass8",
        phone: "5551234567",
    }), response);

    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.message, "Email already registered");
});

test("change password updates the authenticated user's password with a bcrypt hash", async () => {
    let savedUserId = "";
    let savedHash = "";
    const changePassword = createChangePasswordHandler(makeChangePasswordServices({
        updatePassword: async (userId, passwordHash) => {
            savedUserId = userId;
            savedHash = passwordHash;
        },
    }));
    const { response, result } = makeResponse();

    await changePassword(makeChangePasswordRequest({
        currentPassword: "OldPassword@123",
        newPassword: "NewPassword@123",
        userId: "attacker-controlled-id",
    }), response);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, {
        success: true,
        message: "Password changed successfully",
    });
    assert.equal(savedUserId, "user-1");
    assert.notEqual(savedHash, "NewPassword@123");
    assert.equal(await bcrypt.compare("NewPassword@123", savedHash), true);
    assert.equal(await bcrypt.compare("OldPassword@123", savedHash), false);
});

test("change password rejects an incorrect current password", async () => {
    const changePassword = createChangePasswordHandler(makeChangePasswordServices());
    const { response, result } = makeResponse();

    await changePassword(makeChangePasswordRequest({
        currentPassword: "WrongPassword@123",
        newPassword: "NewPassword@123",
    }), response);

    assert.equal(result.statusCode, 401);
    assert.equal(result.body?.message, "Current password is incorrect");
});

test("change password validates required and new password fields", async () => {
    const changePassword = createChangePasswordHandler(makeChangePasswordServices());

    for (const body of [
        {},
        { newPassword: "NewPassword@123" },
        { currentPassword: "OldPassword@123" },
        { currentPassword: "OldPassword@123", newPassword: "short" },
    ]) {
        const { response, result } = makeResponse();
        await changePassword(makeChangePasswordRequest(body), response);
        assert.equal(result.statusCode, 400);
    }
});

test("change password rejects the same password", async () => {
    const changePassword = createChangePasswordHandler(makeChangePasswordServices());
    const { response, result } = makeResponse();

    await changePassword(makeChangePasswordRequest({
        currentPassword: "OldPassword@123",
        newPassword: "OldPassword@123",
    }), response);

    assert.equal(result.statusCode, 400);
    assert.equal(result.body?.message, "New password must be different from the current password");
});
