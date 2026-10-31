import { Router } from "express";
import { createViolation, getViolation, listCitizens, listViolations } from "../controllers/violationController.js";
import {
    getEvidence,
    getEvidenceContent,
    listEvidence,
    uploadEvidence,
} from "../controllers/evidenceController.js";
import { getTrafficReport } from "../controllers/trafficReportController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const violationRoutes = Router();

violationRoutes.post("/", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE"), createViolation);
violationRoutes.get("/citizens", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE"), listCitizens);
violationRoutes.get("/report", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE"), getTrafficReport);
violationRoutes.get("/", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), listViolations);
violationRoutes.get("/:id", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), getViolation);

violationRoutes.post("/:id/evidence", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE"), uploadEvidence);
violationRoutes.get("/:id/evidence", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), listEvidence);
violationRoutes.get("/:id/evidence/:evidenceId", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), getEvidence);
violationRoutes.get("/:id/evidence/:evidenceId/content", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), getEvidenceContent);
export default violationRoutes;
