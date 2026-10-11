import { Router } from "express";
import { createViolation, getViolation, listViolations } from "../controllers/violationController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const violationRoutes = Router();

violationRoutes.post("/", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE"), createViolation);
violationRoutes.get("/", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), listViolations);
violationRoutes.get("/:id", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), getViolation);

export default violationRoutes;
