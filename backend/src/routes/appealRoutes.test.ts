import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import app from "../server.js";

const JWT_SECRET = "appeal-route-test-secret";
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

test("the appeal route stack rejects unauthenticated requests with 401", async () => {
    for (const [method, path] of [
        ["GET", "/api/appeals"],
        ["POST", "/api/appeals"],
        ["GET", "/api/appeals/550e8400-e29b-41d4-a716-446655440000"],
        ["PATCH", "/api/appeals/550e8400-e29b-41d4-a716-446655440000/status"],
    ] as const) {
        const response = await request(path, method);
        assert.equal(response.status, 401);
    }
});

test("citizens cannot update appeal status (403)", async () => {
    const response = await request(
        "/api/appeals/550e8400-e29b-41d4-a716-446655440000/status",
        "PATCH",
        tokenFor("citizen-id", "CITIZEN"),
        { status: "APPROVED" },
    );
    assert.equal(response.status, 403);
});

test("traffic police cannot submit an appeal (403)", async () => {
    const response = await request(
        "/api/appeals",
        "POST",
        tokenFor("police-id", "TRAFFIC_POLICE"),
        { violationId: "550e8400-e29b-41d4-a716-446655440000", reason: "Traffic police cannot appeal" },
    );
    assert.equal(response.status, 403);
});

test("citizen and admin can access appeal endpoints", async () => {
    const citizenList = await request("/api/appeals", "GET", tokenFor("citizen-id", "CITIZEN"));
    assert.notEqual(citizenList.status, 401);
    assert.notEqual(citizenList.status, 403);

    const adminList = await request("/api/appeals", "GET", tokenFor("admin-id", "ADMIN"));
    assert.notEqual(adminList.status, 401);
    assert.notEqual(adminList.status, 403);
});

