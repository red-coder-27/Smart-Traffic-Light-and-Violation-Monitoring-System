import { Router } from "express";
import {
    createIntersection,
    associateTrafficSignal,
    getIntersection,
    listIntersections,
    updateIntersection,
} from "../controllers/intersectionController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const intersectionRoutes = Router();

intersectionRoutes.use(authMiddleware, requireRole("ADMIN"));
intersectionRoutes.post("/", createIntersection);
intersectionRoutes.get("/", listIntersections);
intersectionRoutes.get("/:id", getIntersection);
intersectionRoutes.put("/:id", updateIntersection);
intersectionRoutes.put("/:id/signals/:signalId", associateTrafficSignal);

export default intersectionRoutes;
