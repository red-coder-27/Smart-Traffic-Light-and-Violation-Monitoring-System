import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

export type AuthenticatedUser = {
    id: string;
    role: string;
};

export type AuthenticatedRequest = Request & {
    authenticatedUser?: AuthenticatedUser;
};

type AuthTokenPayload = JwtPayload & AuthenticatedUser;

export function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): void {
    const authorization = req.header("Authorization");
    const [scheme, token] = authorization?.split(" ") ?? [];
    const secret = process.env.JWT_SECRET;

    if (scheme !== "Bearer" || !token || !secret) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
    }

    try {
        const payload = jwt.verify(token, secret);

        if (
            typeof payload === "string" ||
            typeof payload.id !== "string" ||
            typeof payload.role !== "string"
        ) {
            res.status(401).json({ success: false, message: "Invalid or expired token" });
            return;
        }

        const authenticatedPayload = payload as AuthTokenPayload;
        req.authenticatedUser = {
            id: authenticatedPayload.id,
            role: authenticatedPayload.role,
        };
        next();
    } catch {
        res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
}