import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import emergencyPriorityRoutes from "./emergencyPriorityRoutes.js";

test("requires administrator or traffic-police authorization for priority control", async () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "test-only-priority-secret";
    const app = express();
    app.use("/api/emergency-priorities", emergencyPriorityRoutes);
    const server = app.listen(0, "127.0.0.1");

    try {
        await new Promise<void>((resolve, reject) => {
            server.once("listening", resolve);
            server.once("error", reject);
        });
        const address = server.address() as AddressInfo;
        const citizenToken = jwt.sign({
            id: "citizen-user",
            role: "CITIZEN",
        }, process.env.JWT_SECRET);

        const response = await fetch(
            `http://127.0.0.1:${address.port}/api/emergency-priorities/${"550e8400-e29b-41d4-a716-446655440000"}/activate`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${citizenToken}` },
            },
        );

        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), {
            success: false,
            message: "Forbidden: insufficient permissions",
        });
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    }
});
