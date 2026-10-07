import { Router } from "express";
import {
    getTrafficSignal,
    getTrafficSignalHistory,
    listTrafficSignals,
    updateTrafficSignalConfig,
} from "../controllers/trafficSignalController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const trafficSignalRoutes = Router();

trafficSignalRoutes.get("/", authMiddleware, requireRole("ADMIN"), listTrafficSignals);
trafficSignalRoutes.get("/:id", authMiddleware, requireRole("ADMIN"), getTrafficSignal);
trafficSignalRoutes.get("/:id/history", authMiddleware, requireRole("ADMIN"), getTrafficSignalHistory);
trafficSignalRoutes.put("/:id/config", authMiddleware, requireRole("ADMIN"), updateTrafficSignalConfig);

export default trafficSignalRoutes;
