import { Router } from "express";
import {
    getAppeal,
    listAppeals,
    submitAppeal,
    updateAppealStatus,
} from "../controllers/appealController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const appealRoutes = Router();

appealRoutes.get("/", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), listAppeals);
appealRoutes.post("/", authMiddleware, requireRole("ADMIN", "CITIZEN"), submitAppeal);
appealRoutes.get("/:id", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), getAppeal);
appealRoutes.patch("/:id/status", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE"), updateAppealStatus);
appealRoutes.put("/:id/status", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE"), updateAppealStatus);

export default appealRoutes;

