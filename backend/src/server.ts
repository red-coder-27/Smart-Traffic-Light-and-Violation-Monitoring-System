import "dotenv/config";
import express from "express";
import cors from "cors";
import prisma from "./lib/prisma.js";
import authRoutes from "./routes/authRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);

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

if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

export default app;