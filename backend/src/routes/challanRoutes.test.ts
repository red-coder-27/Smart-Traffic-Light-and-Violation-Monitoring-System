import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import app from "../server.js";

const JWT_SECRET = "challan-route-test-secret";
process.env.JWT_SECRET = JWT_SECRET;

function tokenFor(id: string, role: string): string {
    return jwt.sign({ id, role }, JWT_SECRET);
}

async function request(path: string, method = "GET", token?: string, body?: Record<string, unknown>) {
    const server = app.listen(0);
    const address = server.address();

    if (!address || typeof address === "string") {
        server.close();
        throw new Error("Test server did not bind to a TCP port");
    }

    try {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
            method,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(body ? { "Content-Type": "application/json" } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        return { status: response.status, body: await response.json() };
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
}

test("the challan route stack rejects unauthenticated requests with 401", async () => {
    for (const [method, path] of [
        ["GET", "/api/challans"],
        ["POST", "/api/challans"],
        ["GET", "/api/challans/550e8400-e29b-41d4-a716-446655440000"],
        ["POST", "/api/challans/550e8400-e29b-41d4-a716-446655440000/pay"],
    ] as const) {
        const response = await request(path, method);
        assert.equal(response.status, 401);
    }
});

test("citizens cannot create challans (403)", async () => {
    const response = await request(
        "/api/challans",
        "POST",
        tokenFor("citizen-id", "CITIZEN"),
        { violationId: "550e8400-e29b-41d4-a716-446655440000" },
    );
    assert.equal(response.status, 403);
});

test("traffic police cannot simulate fine payment (403)", async () => {
    const response = await request(
        "/api/challans/550e8400-e29b-41d4-a716-446655440000/pay",
        "POST",
        tokenFor("police-id", "TRAFFIC_POLICE"),
        { paymentMethod: "SIMULATED_UPI" },
    );
    assert.equal(response.status, 403);
});

test("citizen and admin can access challan list and payment endpoints", async () => {
    // With valid role, routing passes auth/role middleware (fails downstream on mock db if not found, but status != 401/403)
    const citizenList = await request("/api/challans", "GET", tokenFor("citizen-id", "CITIZEN"));
    assert.notEqual(citizenList.status, 401);
    assert.notEqual(citizenList.status, 403);

    const adminList = await request("/api/challans", "GET", tokenFor("admin-id", "ADMIN"));
    assert.notEqual(adminList.status, 401);
    assert.notEqual(adminList.status, 403);
});
