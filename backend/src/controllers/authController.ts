import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

const PASSWORD_MIN_LENGTH = 8;

type RegisterBody = {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    phone?: unknown;
};

type LoginBody = {
    email?: unknown;
    password?: unknown;
};

type ChangePasswordBody = {
    currentPassword?: unknown;
    newPassword?: unknown;
};

type RegistrationUser = {
    id: string;
    name: string;
    email: string;
    role: string;
    phone: string | null;
    isActive: boolean;
};

export type RegistrationServices = {
    findByEmail(email: string): Promise<RegistrationUser | null>;
    createCitizen(data: {
        name: string;
        email: string;
        passwordHash: string;
        phone: string;
        role: "CITIZEN";
    }): Promise<RegistrationUser>;
    hashPassword(password: string): Promise<string>;
};

export type ChangePasswordServices = {
    findById(userId: string): Promise<{ id: string; passwordHash: string } | null>;
    comparePassword(password: string, passwordHash: string): Promise<boolean>;
    hashPassword(password: string): Promise<string>;
    updatePassword(userId: string, passwordHash: string): Promise<void>;
};

type SafeUser = {
    id: string;
    name: string;
    email: string;
    role: string;
    phone?: string | null;
    isActive?: boolean;
};

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("JWT_SECRET is not configured");
    }

    return secret;
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, "");
    return /^[+]?[-().\s\d]+$/.test(phone) && digits.length >= 7 && digits.length <= 15;
}

function isDuplicateEmailError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function toSafeUser(user: {
    id: string;
    name: string;
    email: string;
    role: string;
    phone: string | null;
    isActive: boolean;
}, includeStatus = false): SafeUser {
    const safeUser: SafeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
    };

    if (includeStatus) {
        safeUser.phone = user.phone;
        safeUser.isActive = user.isActive;
    }

    return safeUser;
}

export function createRegisterHandler(services: RegistrationServices) {
    return async function registerHandler(req: Request, res: Response): Promise<void> {
        const body = (req.body ?? {}) as RegisterBody;

        if (
            typeof body.name !== "string" ||
            !body.name.trim() ||
            typeof body.email !== "string" ||
            !isValidEmail(body.email.trim()) ||
            typeof body.password !== "string" ||
            body.password.length < PASSWORD_MIN_LENGTH ||
            typeof body.phone !== "string" ||
            !isValidPhone(body.phone.trim())
        ) {
            res.status(400).json({ success: false, message: "Invalid request data" });
            return;
        }

        const email = normalizeEmail(body.email);

        try {
            const existingUser = await services.findByEmail(email);

            if (existingUser) {
                res.status(409).json({ success: false, message: "Email already registered" });
                return;
            }

            const passwordHash = await services.hashPassword(body.password);
            const user = await services.createCitizen({
                name: body.name.trim(),
                email,
                passwordHash,
                phone: body.phone.trim(),
                role: "CITIZEN",
            });

            res.status(201).json({
                success: true,
                message: "User registered successfully",
                user: toSafeUser(user),
            });
        } catch (error) {
            if (isDuplicateEmailError(error)) {
                res.status(409).json({ success: false, message: "Email already registered" });
                return;
            }

            console.error("User registration failed:", error);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    };
}

export const register = createRegisterHandler({
    findByEmail: async (email) => prisma.user.findUnique({ where: { email } }),
    createCitizen: async (data) => prisma.user.create({ data }),
    hashPassword: async (password) => bcrypt.hash(password, 12),
});

export function createChangePasswordHandler(services: ChangePasswordServices) {
    return async function changePasswordHandler(
        req: AuthenticatedRequest,
        res: Response,
    ): Promise<void> {
        const body = (req.body ?? {}) as ChangePasswordBody;

        if (
            typeof body.currentPassword !== "string" ||
            !body.currentPassword ||
            typeof body.newPassword !== "string" ||
            !body.newPassword
        ) {
            res.status(400).json({
                success: false,
                message: "Current password and new password are required",
            });
            return;
        }

        if (body.newPassword.length < PASSWORD_MIN_LENGTH) {
            res.status(400).json({
                success: false,
                message: "New password does not meet the password requirements",
            });
            return;
        }

        const authenticatedUser = req.authenticatedUser;

        if (!authenticatedUser) {
            res.status(401).json({ success: false, message: "Authentication required" });
            return;
        }

        try {
            const user = await services.findById(authenticatedUser.id);

            if (!user) {
                res.status(404).json({ success: false, message: "User not found" });
                return;
            }

            const currentPasswordMatches = await services.comparePassword(
                body.currentPassword,
                user.passwordHash,
            );

            if (!currentPasswordMatches) {
                res.status(401).json({
                    success: false,
                    message: "Current password is incorrect",
                });
                return;
            }

            if (body.newPassword === body.currentPassword) {
                res.status(400).json({
                    success: false,
                    message: "New password must be different from the current password",
                });
                return;
            }

            const passwordHash = await services.hashPassword(body.newPassword);
            await services.updatePassword(authenticatedUser.id, passwordHash);

            res.json({
                success: true,
                message: "Password changed successfully",
            });
        } catch (error) {
            console.error("Password change failed:", error);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    };
}

export const changePassword = createChangePasswordHandler({
    findById: async (userId) =>
        prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, passwordHash: true },
        }),
    comparePassword: (password, passwordHash) => bcrypt.compare(password, passwordHash),
    hashPassword: (password) => bcrypt.hash(password, 12),
    updatePassword: async (userId, passwordHash) => {
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
        });
    },
});

export async function login(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as LoginBody;

    if (
        typeof body.email !== "string" ||
        !isValidEmail(body.email.trim()) ||
        typeof body.password !== "string" ||
        !body.password
    ) {
        res.status(400).json({ success: false, message: "Invalid request data" });
        return;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: normalizeEmail(body.email) },
        });

        if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
            res.status(401).json({ success: false, message: "Invalid email or password" });
            return;
        }

        if (!user.isActive) {
            res.status(403).json({ success: false, message: "Account is inactive" });
            return;
        }

        const token = jwt.sign({ id: user.id, role: user.role }, getJwtSecret(), {
            expiresIn: "1h",
        });

        res.json({
            success: true,
            message: "Login successful",
            token,
            user: toSafeUser(user),
        });
    } catch (error) {
        console.error("User login failed:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

export async function getCurrentUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    const authenticatedUser = req.authenticatedUser;

    if (!authenticatedUser) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: authenticatedUser.id } });

        if (!user) {
            res.status(404).json({ success: false, message: "User not found" });
            return;
        }

        if (!user.isActive) {
            res.status(403).json({ success: false, message: "Account is inactive" });
            return;
        }

        res.json({ success: true, user: toSafeUser(user, true) });
    } catch (error) {
        console.error("Fetching current user failed:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}