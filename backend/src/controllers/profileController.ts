import type { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

type ProfileUpdateBody = {
    name?: unknown;
    phone?: unknown;
    address?: unknown;
    city?: unknown;
    state?: unknown;
    postalCode?: unknown;
    dateOfBirth?: unknown;
};

type UserProfileRecord = {
    id: string;
    userId: string;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    dateOfBirth: Date | string | null;
};

type UserWithProfile = {
    id: string;
    name: string;
    email: string;
    role: string;
    phone: string | null;
    isActive: boolean;
    passwordHash: string;
    profile?: UserProfileRecord | null;
};

export type ProfileServices = {
    getUser(userId: string): Promise<UserWithProfile | null>;
    updateUser(userId: string, data: { name?: string; phone?: string | null }): Promise<UserWithProfile>;
    upsertProfile(
        userId: string,
        data: {
            address?: string | null;
            city?: string | null;
            state?: string | null;
            postalCode?: string | null;
            dateOfBirth?: Date | null;
        },
    ): Promise<UserProfileRecord>;
};

function isValidPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, "");
    return /^[+]?[-().\s\d]+$/.test(phone) && digits.length >= 7 && digits.length <= 15;
}

function isValidPostalCode(value: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9\s-]{2,12}$/.test(value.trim());
}

function isValidDateValue(value: string): boolean {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function formatDateValue(value: Date | string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString().slice(0, 10);
}

function toSafeProfile(user: UserWithProfile) {
    return {
        id: user.profile?.id ?? null,
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        address: user.profile?.address ?? null,
        city: user.profile?.city ?? null,
        state: user.profile?.state ?? null,
        postalCode: user.profile?.postalCode ?? null,
        dateOfBirth: formatDateValue(user.profile?.dateOfBirth ?? null),
    };
}

function getAllowedProfileFields(body: Record<string, unknown>): string[] {
    const allowedKeys = new Set(["name", "phone", "address", "city", "state", "postalCode", "dateOfBirth"]);
    return Object.keys(body).filter((key) => allowedKeys.has(key));
}

function validateProfileUpdate(body: ProfileUpdateBody): {
    userData: { name?: string; phone?: string | null };
    profileData: {
        address?: string | null;
        city?: string | null;
        state?: string | null;
        postalCode?: string | null;
        dateOfBirth?: Date | null;
    };
} | null {
    const userData: { name?: string; phone?: string | null } = {};
    const profileData: {
        address?: string | null;
        city?: string | null;
        state?: string | null;
        postalCode?: string | null;
        dateOfBirth?: Date | null;
    } = {};

    const allowedFields = getAllowedProfileFields(body as Record<string, unknown>);

    if (allowedFields.length === 0) {
        return null;
    }

    if ("name" in body) {
        if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120) {
            return null;
        }
        userData.name = body.name.trim();
    }

    if ("phone" in body) {
        if (typeof body.phone !== "string" || !isValidPhone(body.phone.trim())) {
            return null;
        }
        userData.phone = body.phone.trim();
    }

    if ("address" in body) {
        if (typeof body.address !== "string" || !body.address.trim()) {
            return null;
        }
        profileData.address = body.address.trim();
    }

    if ("city" in body) {
        if (typeof body.city !== "string" || !body.city.trim()) {
            return null;
        }
        profileData.city = body.city.trim();
    }

    if ("state" in body) {
        if (typeof body.state !== "string" || !body.state.trim()) {
            return null;
        }
        profileData.state = body.state.trim();
    }

    if ("postalCode" in body) {
        if (typeof body.postalCode !== "string" || !isValidPostalCode(body.postalCode)) {
            return null;
        }
        profileData.postalCode = body.postalCode.trim();
    }

    if ("dateOfBirth" in body) {
        if (typeof body.dateOfBirth !== "string" || !isValidDateValue(body.dateOfBirth.trim())) {
            return null;
        }
        profileData.dateOfBirth = new Date(body.dateOfBirth.trim());
    }

    return { userData, profileData };
}

export function createGetProfileHandler(services: ProfileServices) {
    return async function getProfileHandler(req: Request, res: Response): Promise<void> {
        const authenticatedUser = (req as AuthenticatedRequest).authenticatedUser;

        if (!authenticatedUser) {
            res.status(401).json({ success: false, message: "Authentication required" });
            return;
        }

        try {
            const user = await services.getUser(authenticatedUser.id);

            if (!user) {
                res.status(404).json({ success: false, message: "User not found" });
                return;
            }

            if (!user.isActive) {
                res.status(403).json({ success: false, message: "Account is inactive" });
                return;
            }

            res.json({ success: true, profile: toSafeProfile(user) });
        } catch (error) {
            console.error("Fetching profile failed:", error);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    };
}

export function createUpdateProfileHandler(services: ProfileServices) {
    return async function updateProfileHandler(req: Request, res: Response): Promise<void> {
        const authenticatedUser = (req as AuthenticatedRequest).authenticatedUser;

        if (!authenticatedUser) {
            res.status(401).json({ success: false, message: "Authentication required" });
            return;
        }

        const body = (req.body ?? {}) as ProfileUpdateBody;
        const validation = validateProfileUpdate(body);

        if (!validation) {
            res.status(400).json({ success: false, message: "Invalid profile data" });
            return;
        }

        try {
            const user = await services.getUser(authenticatedUser.id);

            if (!user) {
                res.status(404).json({ success: false, message: "User not found" });
                return;
            }

            if (!user.isActive) {
                res.status(403).json({ success: false, message: "Account is inactive" });
                return;
            }

            const updatedUser = Object.keys(validation.userData).length > 0
                ? await services.updateUser(authenticatedUser.id, validation.userData)
                : user;

            const profileData = validation.profileData;
            const updatedProfile = await services.upsertProfile(authenticatedUser.id, {
                ...(user.profile ? {} : {
                    address: null,
                    city: null,
                    state: null,
                    postalCode: null,
                    dateOfBirth: null,
                }),
                ...profileData,
            });

            const finalUser = {
                ...updatedUser,
                profile: updatedProfile,
            };

            res.json({ success: true, profile: toSafeProfile(finalUser) });
        } catch (error) {
            console.error("Updating profile failed:", error);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    };
}

export const getProfile = createGetProfileHandler({
    getUser: async (userId) => prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
    }),
    updateUser: async (userId, data) => prisma.user.update({
        where: { id: userId },
        data,
        include: { profile: true },
    }),
    upsertProfile: async (userId, data) => prisma.userProfile.upsert({
        where: { userId },
        update: data,
        create: {
            userId,
            ...data,
        },
    }),
});

export const updateProfile = createUpdateProfileHandler({
    getUser: async (userId) => prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
    }),
    updateUser: async (userId, data) => prisma.user.update({
        where: { id: userId },
        data,
        include: { profile: true },
    }),
    upsertProfile: async (userId, data) => prisma.userProfile.upsert({
        where: { userId },
        update: data,
        create: {
            userId,
            ...data,
        },
    }),
});
