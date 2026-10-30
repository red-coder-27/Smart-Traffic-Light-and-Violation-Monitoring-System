import "dotenv/config";
import express from "express";
import cors from "cors";
import prisma from "./lib/prisma.js";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import rbacRoutes from "./routes/rbacRoutes.js";
import intersectionRoutes from "./routes/intersectionRoutes.js";
import trafficSignalRoutes from "./routes/trafficSignalRoutes.js";
import violationRoutes from "./routes/violationRoutes.js";
import challanRoutes from "./routes/challanRoutes.js";
import emergencyPriorityRoutes from "./routes/emergencyPriorityRoutes.js";
import appealRoutes from "./routes/appealRoutes.js";
import { emergencyPriorityServices } from "./services/emergencyPriorityService.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/rbac", rbacRoutes);
app.use("/api/intersections", intersectionRoutes);
app.use("/api/traffic-signals", trafficSignalRoutes);
app.use("/api/violations", violationRoutes);
app.use("/api/challans", challanRoutes);
app.use("/api/emergency-priorities", emergencyPriorityRoutes);
app.use("/api/appeals", appealRoutes);

app.get("/api/health", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;

        res.json({
            success: true,
            message: "Smart Traffic Monitoring API is running",
            database: "connected",
        });
    } catch (error) {
        console.error("Database connection failed:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed",
        });
    }
});

const isTestEnvironment =
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.NODE_TEST_CONTEXT) ||
    process.argv.includes("--test");

if (!isTestEnvironment) {
    void emergencyPriorityServices.expireStaleRequests().catch((error: unknown) => {
        console.error("Initial emergency priority timeout sweep failed:", error);
    });
    const priorityTimeoutSweep = setInterval(() => {
        void emergencyPriorityServices.expireStaleRequests().catch((error: unknown) => {
            console.error("Emergency priority timeout sweep failed:", error);
        });
    }, 15_000);
    priorityTimeoutSweep.unref();

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

export default app;