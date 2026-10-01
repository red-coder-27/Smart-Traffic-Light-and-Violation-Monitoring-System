import type { NextFunction, Response } from "express";
import type { Role } from "../generated/prisma/enums.js";
import type { AuthenticatedRequest } from "./authMiddleware.js";

export function requireRole(...allowedRoles: Role[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        const authenticatedUser = req.authenticatedUser;

        if (!authenticatedUser) {
            res.status(401).json({ success: false, message: "Authentication required" });
            return;
        }

        if (!allowedRoles.some((allowedRole) => allowedRole === authenticatedUser.role)) {
            res.status(403).json({
                success: false,
                message: "Forbidden: insufficient permissions",
            });
            return;
        }

        next();
    };
}