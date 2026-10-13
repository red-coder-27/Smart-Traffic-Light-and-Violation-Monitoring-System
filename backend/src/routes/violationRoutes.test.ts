import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import app from "../server.js";

const JWT_SECRET = "violation-route-test-secret";
process.env.JWT_SECRET = JWT_SECRET;

function tokenFor(id: string, role: string): string {
    return jwt.sign({ id, role }, JWT_SECRET);
}

async function request(path: string, method = "GET", token?: string) {
    const server = app.listen(0);
    const address = server.address();

    if (!address || typeof address === "string") {
        server.close();
        throw new Error("Test server did not bind to a TCP port");
    }

    try {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
            method,
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        return { status: response.status, body: await response.json() };
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
}

test("the route stack rejects unauthenticated create, list, and detail requests", async () => {
    for (const [method, path] of [
        ["POST", "/api/violations"],
        ["GET", "/api/violations"],
        ["GET", "/api/violations/report"],
        ["GET", "/api/violations/550e8400-e29b-41d4-a716-446655440000"],
        ["POST", "/api/violations/550e8400-e29b-41d4-a716-446655440000/evidence"],
        ["GET", "/api/violations/550e8400-e29b-41d4-a716-446655440000/evidence"],
        ["GET", "/api/violations/550e8400-e29b-41d4-a716-446655440000/evidence/660e8400-e29b-41d4-a716-446655440001"],
    ] as const) {
        const response = await request(path, method);
        assert.equal(response.status, 401);
    }
});

test("the route stack rejects citizen creation and upload", async () => {
    const violationRes = await request(
        "/api/violations",
        "POST",
        tokenFor("citizen-id", "CITIZEN"),
    );

    assert.equal(violationRes.status, 403);
    assert.deepEqual(violationRes.body, {
        success: false,
        message: "Forbidden: insufficient permissions",
    });

    const evidenceRes = await request(
        "/api/violations/550e8400-e29b-41d4-a716-446655440000/evidence",
        "POST",
        tokenFor("citizen-id", "CITIZEN"),
    );

    assert.equal(evidenceRes.status, 403);
    assert.deepEqual(evidenceRes.body, {
        success: false,
        message: "Forbidden: insufficient permissions",
    });

    const reportRes = await request(
        "/api/violations/report",
        "GET",
        tokenFor("citizen-id", "CITIZEN"),
    );
    assert.equal(reportRes.status, 403);
    assert.deepEqual(reportRes.body, {
        success: false,
        message: "Forbidden: insufficient permissions",
    });
});

test("the route stack rejects unexpected roles for retrieval", async () => {
    const violationRes = await request(
        "/api/violations",
        "GET",
        tokenFor("unknown-id", "SUPERVISOR"),
    );
    assert.equal(violationRes.status, 403);

    const evidenceRes = await request(
        "/api/violations/550e8400-e29b-41d4-a716-446655440000/evidence",
        "GET",
        tokenFor("unknown-id", "SUPERVISOR"),
    );
    assert.equal(evidenceRes.status, 403);
});
