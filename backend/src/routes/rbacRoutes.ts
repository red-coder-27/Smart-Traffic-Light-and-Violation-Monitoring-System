import { Router } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const rbacRoutes = Router();

rbacRoutes.get(
    "/admin",
    authMiddleware,
    requireRole("ADMIN"),
    (req: AuthenticatedRequest, res) => {
        res.json({
            success: true,
            message: "Admin resource accessed",
            role: req.authenticatedUser?.role,
        });
    },
);

rbacRoutes.get(
    "/police",
    authMiddleware,
    requireRole("ADMIN", "TRAFFIC_POLICE"),
    (req: AuthenticatedRequest, res) => {
        res.json({
            success: true,
            message: "Police resource accessed",
            role: req.authenticatedUser?.role,
        });
    },
);

rbacRoutes.get(
    "/citizen",
    authMiddleware,
    requireRole("CITIZEN"),
    (req: AuthenticatedRequest, res) => {
        res.json({
            success: true,
            message: "Citizen resource accessed",
            role: req.authenticatedUser?.role,
        });
    },
);

export default rbacRoutes;