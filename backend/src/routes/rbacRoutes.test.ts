import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import app from "../server.js";

const JWT_SECRET = "rbac-test-secret";
process.env.JWT_SECRET = JWT_SECRET;

type Role = "ADMIN" | "TRAFFIC_POLICE" | "CITIZEN";

function tokenFor(role: Role): string {
    return jwt.sign({ id: `${role.toLowerCase()}-id`, role }, JWT_SECRET);
}

async function request(path: string, role?: Role, token = role ? tokenFor(role) : undefined) {
    const server = app.listen(0);
    const address = server.address();

    if (!address || typeof address === "string") {
        server.close();
        throw new Error("Test server did not bind to a TCP port");
    }

    try {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        return { status: response.status, body: await response.json() };
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
}

test("ADMIN can access the ADMIN route", async () => {
    const response = await request("/api/rbac/admin", "ADMIN");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
        success: true,
        message: "Admin resource accessed",
        role: "ADMIN",
    });
});

test("TRAFFIC_POLICE and CITIZEN cannot access the ADMIN route", async () => {
    for (const role of ["TRAFFIC_POLICE", "CITIZEN"] as const) {
        const response = await request("/api/rbac/admin", role);
        assert.equal(response.status, 403);
        assert.deepEqual(response.body, {
            success: false,
            message: "Forbidden: insufficient permissions",
        });
    }
});

test("ADMIN and TRAFFIC_POLICE can access the police route", async () => {
    for (const role of ["ADMIN", "TRAFFIC_POLICE"] as const) {
        const response = await request("/api/rbac/police", role);
        assert.equal(response.status, 200);
        assert.deepEqual(response.body, {
            success: true,
            message: "Police resource accessed",
            role,
        });
    }
});

test("CITIZEN cannot access the police route", async () => {
    const response = await request("/api/rbac/police", "CITIZEN");
    assert.equal(response.status, 403);
});

test("CITIZEN can access the citizen route", async () => {
    const response = await request("/api/rbac/citizen", "CITIZEN");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
        success: true,
        message: "Citizen resource accessed",
        role: "CITIZEN",
    });
});

test("missing authentication returns 401", async () => {
    const response = await request("/api/rbac/admin");
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
        success: false,
        message: "Authentication required",
    });
});

test("invalid token returns 401", async () => {
    const response = await request("/api/rbac/admin", undefined, "invalid-token");
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
        success: false,
        message: "Invalid or expired token",
    });
});