import { Router } from "express";
import {
    activateEmergencyPriority,
    cancelEmergencyPriority,
    completeEmergencyPriority,
    createEmergencyPriorityRequest,
    getEmergencyPriorityOptions,
    listEmergencyPriorityRequests,
} from "../controllers/emergencyPriorityController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const emergencyPriorityRoutes = Router();

emergencyPriorityRoutes.use(authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE"));
emergencyPriorityRoutes.get("/options", getEmergencyPriorityOptions);
emergencyPriorityRoutes.get("/", listEmergencyPriorityRequests);
emergencyPriorityRoutes.post("/", createEmergencyPriorityRequest);
emergencyPriorityRoutes.post("/:id/activate", activateEmergencyPriority);
emergencyPriorityRoutes.post("/:id/complete", completeEmergencyPriority);
emergencyPriorityRoutes.post("/:id/cancel", cancelEmergencyPriority);

export default emergencyPriorityRoutes;
