import type { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PAYMENT_METHODS = new Set([
    "SIMULATED_UPI",
    "SIMULATED_CARD",
    "SIMULATED_NETBANKING",
]);

export const DEFAULT_FINE_AMOUNTS: Record<string, number> = {
    RED_LIGHT: 1000,
    SPEEDING: 1500,
    OVER_SPEEDING: 2000,
    NO_HELMET: 500,
    NO_SEATBELT: 500,
    WRONG_WAY: 1000,
    ILLEGAL_PARKING: 500,
    DRIVING_WITHOUT_LICENSE: 2000,
    RASH_DRIVING: 2500,
};
export const FALLBACK_FINE_AMOUNT = 500;

export type ChallanRecord = {
    id: string;
    challanNumber: string;
    violationId: string;
    citizenId: string;
    amount: number;
    status: "UNPAID" | "PAID" | "CANCELLED";
    paidAt: Date | null;
    paymentReference: string | null;
    paymentMethod: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    violation?: {
        id: string;
        occurredAt: Date;
        violationType: string;
        description: string | null;
        intersection?: { id: string; name: string; location: string } | null;
        trafficSignal?: { id: string; status: string } | null;
    } | null;
    citizen?: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
    } | null;
    transactions?: Array<{
        id: string;
        amount: number;
        status: string;
        reference: string;
        paymentMethod: string;
        failureReason: string | null;
        createdAt: Date;
    }>;
};

export type ViolationLookup = {
    id: string;
    violatingUserId: string | null;
    violationType: string;
};

export type ChallanServices = {
    listChallans(citizenId?: string): Promise<ChallanRecord[]>;
    getChallan(idOrNumber: string, citizenId?: string): Promise<ChallanRecord | null>;
    getViolation(id: string): Promise<ViolationLookup | null>;
    challanExistsForViolation(violationId: string): Promise<boolean>;
    createChallan(data: {
        violationId: string;
        citizenId: string;
        amount: number;
        notes?: string;
    }): Promise<ChallanRecord>;
    processPayment(params: {
        challanId: string;
        amount: number;
        status: "SUCCESS" | "FAILED";
        reference: string;
        paymentMethod: string;
        failureReason?: string;
        idempotencyKey?: string;
        paidAt?: Date;
    }): Promise<{ challan: ChallanRecord; transaction: { id: string; reference: string; status: string } }>;
    getTransactionByIdempotencyKey?(key: string): Promise<{
        id: string;
        reference: string;
        status: string;
        challanId: string;
        amount: number;
        failureReason: string | null;
        createdAt: Date;
    } | null>;
};

function getAuthenticatedUser(req: Request): { id: string; role: string } | null {
    return (req as AuthenticatedRequest).authenticatedUser ?? null;
}

function generateChallanNumber(): string {
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHex = Math.random().toString(16).slice(2, 8).toUpperCase();
    return `CHAL-${datePrefix}-${randomHex}`;
}

function generatePaymentReference(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomHex = Math.random().toString(16).slice(2, 6).toUpperCase();
    return `SIMPAY-${timestamp}-${randomHex}`;
}

export function createChallanHandlers(services: ChallanServices) {
    return {
        list: async (req: Request, res: Response): Promise<void> => {
            const user = getAuthenticatedUser(req);
            if (!user) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            try {
                const citizenId = user.role === "CITIZEN" ? user.id : undefined;
                const challans = await services.listChallans(citizenId);
                res.json({ success: true, challans });
            } catch (error) {
                console.error("Listing challans failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },

        getOne: async (req: Request, res: Response): Promise<void> => {
            const user = getAuthenticatedUser(req);
            if (!user) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            const id = req.params.id;
            if (!id || typeof id !== "string") {
                res.status(400).json({ success: false, message: "Invalid challan identifier" });
                return;
            }

            try {
                const citizenId = user.role === "CITIZEN" ? user.id : undefined;
                const challan = await services.getChallan(id, citizenId);
                if (!challan) {
                    res.status(404).json({ success: false, message: "Challan not found" });
                    return;
                }

                res.json({ success: true, challan });
            } catch (error) {
                console.error("Fetching challan failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },

        create: async (req: Request, res: Response): Promise<void> => {
            const user = getAuthenticatedUser(req);
            if (!user) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }
            if (user.role !== "ADMIN" && user.role !== "TRAFFIC_POLICE") {
                res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
                return;
            }

            const body = (req.body ?? {}) as Record<string, unknown>;
            const violationId = body.violationId;
            if (typeof violationId !== "string" || !UUID_PATTERN.test(violationId)) {
                res.status(400).json({ success: false, message: "Valid violationId is required" });
                return;
            }

            let amount: number | undefined;
            if (body.amount !== undefined) {
                if (typeof body.amount !== "number" || Number.isNaN(body.amount) || body.amount <= 0 || body.amount > 100000) {
                    res.status(400).json({ success: false, message: "Amount must be a positive number up to 100000" });
                    return;
                }
                amount = body.amount;
            }

            let notes: string | undefined;
            if (body.notes !== undefined) {
                if (typeof body.notes !== "string" || body.notes.trim().length > 500) {
                    res.status(400).json({ success: false, message: "Notes must be a string up to 500 characters" });
                    return;
                }
                notes = body.notes.trim();
            }

            try {
                const violation = await services.getViolation(violationId);
                if (!violation) {
                    res.status(404).json({ success: false, message: "Referenced violation was not found" });
                    return;
                }
                if (!violation.violatingUserId) {
                    res.status(400).json({ success: false, message: "Violation has no citizen assigned" });
                    return;
                }

                const exists = await services.challanExistsForViolation(violationId);
                if (exists) {
                    res.status(409).json({ success: false, message: "Challan already exists for this violation" });
                    return;
                }

                const finalAmount = amount ?? (DEFAULT_FINE_AMOUNTS[violation.violationType] ?? FALLBACK_FINE_AMOUNT);
                const challan = await services.createChallan({
                    violationId,
                    citizenId: violation.violatingUserId,
                    amount: finalAmount,
                    notes,
                });

                res.status(201).json({ success: true, challan });
            } catch (error) {
                console.error("Creating challan failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },

        simulatePayment: async (req: Request, res: Response): Promise<void> => {
            const user = getAuthenticatedUser(req);
            if (!user) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            const id = req.params.id;
            if (!id || typeof id !== "string") {
                res.status(400).json({ success: false, message: "Invalid challan identifier" });
                return;
            }

            const body = (req.body ?? {}) as Record<string, unknown>;
            const rawMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim().toUpperCase() : "";
            if (!ALLOWED_PAYMENT_METHODS.has(rawMethod)) {
                res.status(400).json({
                    success: false,
                    message: "Valid paymentMethod is required (SIMULATED_UPI, SIMULATED_CARD, SIMULATED_NETBANKING)",
                });
                return;
            }

            const simulationOutcome = body.simulationOutcome === "FAILURE" ? "FAILURE" : "SUCCESS";
            const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length <= 128
                ? body.idempotencyKey.trim()
                : (req.header("Idempotency-Key") ?? undefined);

            try {
                // Check idempotency if key provided
                if (idempotencyKey && services.getTransactionByIdempotencyKey) {
                    const existingTx = await services.getTransactionByIdempotencyKey(idempotencyKey);
                    if (existingTx) {
                        if (existingTx.status === "SUCCESS") {
                            res.json({
                                success: true,
                                message: "Payment previously processed successfully (idempotent response)",
                                payment: {
                                    reference: existingTx.reference,
                                    amount: existingTx.amount,
                                    status: "PAID",
                                    paidAt: existingTx.createdAt,
                                },
                            });
                            return;
                        }
                        res.status(400).json({
                            success: false,
                            status: "FAILED",
                            message: "Previous simulated payment failed (idempotent response)",
                            failureReason: existingTx.failureReason ?? "TRANSACTION_DECLINED",
                        });
                        return;
                    }
                }

                // Retrieve challan to check existence and ownership
                const challan = await services.getChallan(id);
                if (!challan) {
                    res.status(404).json({ success: false, message: "Challan not found" });
                    return;
                }

                // Verify ownership: citizen must own the challan
                if (user.role === "CITIZEN" && challan.citizenId !== user.id) {
                    res.status(403).json({ success: false, message: "Forbidden: You are not authorized to pay this challan" });
                    return;
                }

                // Verify payment eligibility
                if (challan.status === "PAID") {
                    res.status(409).json({
                        success: false,
                        message: "Challan has already been paid",
                        paidAt: challan.paidAt,
                        paymentReference: challan.paymentReference,
                    });
                    return;
                }
                if (challan.status === "CANCELLED") {
                    res.status(400).json({ success: false, message: "Cancelled challans cannot be paid" });
                    return;
                }

                // Derive amount strictly from trusted database record
                const trustedAmount = challan.amount;

                // Handle simulated failure outcome
                if (simulationOutcome === "FAILURE") {
                    const failureRef = `SIMFAIL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
                    const failureReason = "SIMULATED_DECLINE: Transaction declined by issuing bank or insufficient funds.";
                    await services.processPayment({
                        challanId: challan.id,
                        amount: trustedAmount,
                        status: "FAILED",
                        reference: failureRef,
                        paymentMethod: rawMethod,
                        failureReason,
                        idempotencyKey,
                    });

                    res.status(400).json({
                        success: false,
                        status: "FAILED",
                        message: "Simulated payment failed: Card or bank declined the transaction.",
                        failureReason: "TRANSACTION_DECLINED",
                        reference: failureRef,
                    });
                    return;
                }

                // Handle simulated success outcome
                const paymentReference = generatePaymentReference();
                const paidAt = new Date();
                const result = await services.processPayment({
                    challanId: challan.id,
                    amount: trustedAmount,
                    status: "SUCCESS",
                    reference: paymentReference,
                    paymentMethod: rawMethod,
                    paidAt,
                    idempotencyKey,
                });

                res.json({
                    success: true,
                    message: "Simulated payment processed successfully",
                    payment: {
                        reference: paymentReference,
                        amount: trustedAmount,
                        paidAt,
                        paymentMethod: rawMethod,
                        status: "PAID",
                        challanNumber: result.challan.challanNumber,
                    },
                    challan: result.challan,
                });
            } catch (error) {
                console.error("Processing simulated payment failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
    };
}

const defaultServices: ChallanServices = {
    listChallans: async (citizenId) => {
        // Find existing challans
        const challans: ChallanRecord[] = await prisma.challan.findMany({
            where: citizenId ? { citizenId } : undefined,
            orderBy: { createdAt: "desc" },
            include: {
                violation: {
                    select: {
                        id: true,
                        occurredAt: true,
                        violationType: true,
                        description: true,
                        intersection: { select: { id: true, name: true, location: true } },
                        trafficSignal: { select: { id: true, status: true } },
                    },
                },
                citizen: {
                    select: { id: true, name: true, email: true, phone: true },
                },
                transactions: {
                    select: {
                        id: true,
                        amount: true,
                        status: true,
                        reference: true,
                        paymentMethod: true,
                        failureReason: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        // If citizenId provided, also check if there are violations for this citizen without a challan,
        // and auto-generate an initial challan for them so citizen can view and pay immediately
        if (citizenId) {
            const existingViolationIds = new Set(challans.map((c) => c.violationId));
            const unbilledViolations = await prisma.violation.findMany({
                where: {
                    violatingUserId: citizenId,
                    id: { notIn: Array.from(existingViolationIds) },
                },
                select: { id: true, violationType: true },
            });

            if (unbilledViolations.length > 0) {
                for (const unbilled of unbilledViolations) {
                    try {
                        const amount = DEFAULT_FINE_AMOUNTS[unbilled.violationType] ?? FALLBACK_FINE_AMOUNT;
                        const newChallan = await prisma.challan.create({
                            data: {
                                challanNumber: generateChallanNumber(),
                                violationId: unbilled.id,
                                citizenId,
                                amount,
                                status: "UNPAID",
                            },
                            include: {
                                violation: {
                                    select: {
                                        id: true,
                                        occurredAt: true,
                                        violationType: true,
                                        description: true,
                                        intersection: { select: { id: true, name: true, location: true } },
                                        trafficSignal: { select: { id: true, status: true } },
                                    },
                                },
                                citizen: {
                                    select: { id: true, name: true, email: true, phone: true },
                                },
                                transactions: {
                                    select: {
                                        id: true,
                                        amount: true,
                                        status: true,
                                        reference: true,
                                        paymentMethod: true,
                                        failureReason: true,
                                        createdAt: true,
                                    },
                                    orderBy: { createdAt: "desc" },
                                },
                            },
                        });
                        challans.unshift(newChallan as ChallanRecord);
                    } catch {
                        // Concurrent creation or already created, ignore error
                    }
                }
            }
        }

        return challans as ChallanRecord[];
    },

    getChallan: async (idOrNumber, citizenId) => {
        const challan = await prisma.challan.findFirst({
            where: {
                OR: [{ id: idOrNumber }, { challanNumber: idOrNumber }],
                ...(citizenId ? { citizenId } : {}),
            },
            include: {
                violation: {
                    select: {
                        id: true,
                        occurredAt: true,
                        violationType: true,
                        description: true,
                        intersection: { select: { id: true, name: true, location: true } },
                        trafficSignal: { select: { id: true, status: true } },
                    },
                },
                citizen: {
                    select: { id: true, name: true, email: true, phone: true },
                },
                transactions: {
                    select: {
                        id: true,
                        amount: true,
                        status: true,
                        reference: true,
                        paymentMethod: true,
                        failureReason: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
        });
        return challan as ChallanRecord | null;
    },

    getViolation: async (id) => {
        const violation = await prisma.violation.findUnique({
            where: { id },
            select: { id: true, violatingUserId: true, violationType: true },
        });
        return violation;
    },

    challanExistsForViolation: async (violationId) => {
        const count = await prisma.challan.count({ where: { violationId } });
        return count > 0;
    },

    createChallan: async (data) => {
        const challan = await prisma.challan.create({
            data: {
                challanNumber: generateChallanNumber(),
                violationId: data.violationId,
                citizenId: data.citizenId,
                amount: data.amount,
                notes: data.notes,
                status: "UNPAID",
            },
            include: {
                violation: {
                    select: {
                        id: true,
                        occurredAt: true,
                        violationType: true,
                        description: true,
                        intersection: { select: { id: true, name: true, location: true } },
                        trafficSignal: { select: { id: true, status: true } },
                    },
                },
                citizen: {
                    select: { id: true, name: true, email: true, phone: true },
                },
            },
        });
        return challan as ChallanRecord;
    },

    processPayment: async (params) => {
        return prisma.$transaction(async (tx) => {
            if (params.status === "SUCCESS") {
                const updatedChallan = await tx.challan.update({
                    where: { id: params.challanId },
                    data: {
                        status: "PAID",
                        paidAt: params.paidAt ?? new Date(),
                        paymentReference: params.reference,
                        paymentMethod: params.paymentMethod,
                    },
                    include: {
                        violation: {
                            select: {
                                id: true,
                                occurredAt: true,
                                violationType: true,
                                description: true,
                                intersection: { select: { id: true, name: true, location: true } },
                                trafficSignal: { select: { id: true, status: true } },
                            },
                        },
                        citizen: {
                            select: { id: true, name: true, email: true, phone: true },
                        },
                    },
                });

                const transaction = await tx.paymentTransaction.create({
                    data: {
                        challanId: params.challanId,
                        amount: params.amount,
                        status: "SUCCESS",
                        reference: params.reference,
                        paymentMethod: params.paymentMethod,
                        idempotencyKey: params.idempotencyKey,
                    },
                    select: { id: true, reference: true, status: true },
                });

                return { challan: updatedChallan as ChallanRecord, transaction };
            }

            // FAILED transaction
            const currentChallan = await tx.challan.findUniqueOrThrow({
                where: { id: params.challanId },
                include: {
                    violation: {
                        select: {
                            id: true,
                            occurredAt: true,
                            violationType: true,
                            description: true,
                            intersection: { select: { id: true, name: true, location: true } },
                            trafficSignal: { select: { id: true, status: true } },
                        },
                    },
                    citizen: {
                        select: { id: true, name: true, email: true, phone: true },
                    },
                },
            });

            const transaction = await tx.paymentTransaction.create({
                data: {
                    challanId: params.challanId,
                    amount: params.amount,
                    status: "FAILED",
                    reference: params.reference,
                    paymentMethod: params.paymentMethod,
                    failureReason: params.failureReason,
                    idempotencyKey: params.idempotencyKey,
                },
                select: { id: true, reference: true, status: true },
            });

            return { challan: currentChallan as ChallanRecord, transaction };
        });
    },

    getTransactionByIdempotencyKey: async (key: string) => {
        const tx = await prisma.paymentTransaction.findUnique({
            where: { idempotencyKey: key },
            select: {
                id: true,
                reference: true,
                status: true,
                challanId: true,
                amount: true,
                failureReason: true,
                createdAt: true,
            },
        });
        return tx;
    },
};

const handlers = createChallanHandlers(defaultServices);

export const listChallans = handlers.list;
export const getChallan = handlers.getOne;
export const createChallan = handlers.create;
export const simulatePayment = handlers.simulatePayment;
