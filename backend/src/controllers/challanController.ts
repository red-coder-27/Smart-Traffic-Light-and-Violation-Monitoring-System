import type { Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { generateChallanNumber, getFineAmount } from "../services/challanRules.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_QUERY_PARAMETERS = new Set([
    "search",
    "status",
    "violationType",
    "dateFrom",
    "dateTo",
    "appealStatus",
    "sortOrder",
    "page",
    "pageSize",
]);
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 100_000;
const ALLOWED_PAYMENT_METHODS = new Set([
    "SIMULATED_UPI",
    "SIMULATED_CARD",
    "SIMULATED_NETBANKING",
]);

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
        appeal?: {
            id: string;
            status: "PENDING" | "APPROVED" | "REJECTED";
            reason?: string;
            reviewNotes?: string | null;
            reviewedAt?: Date | null;
            createdAt?: Date;
        } | null;
        evidence?: Array<{ id: string; originalName: string; mimeType: string; createdAt: Date }>;
    } | null;
    citizen?: {
        id: string;
        name: string;
        email?: string;
        phone?: string | null;
    } | null;
    transactions?: Array<{
        status: string;
        id?: string;
        amount?: number;
        reference?: string;
        paymentMethod?: string;
        failureReason?: string | null;
        createdAt?: Date;
    }>;
};

export type ChallanListFilters = {
    search?: string;
    status?: "UNPAID" | "PAID" | "CANCELLED";
    violationType?: string;
    dateFrom?: Date;
    dateToExclusive?: Date;
    appealStatus?: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
    sortOrder: "asc" | "desc";
    page: number;
    pageSize: number;
};

export type ChallanSummary = {
    total: number;
    pending: number;
    paid: number;
    cancelled: number;
    appealed: number;
    pendingAmount: number;
};

export type ChallanListResult = {
    challans: ChallanRecord[];
    totalRecords: number;
    summary: ChallanSummary;
};

export type ViolationLookup = {
    id: string;
    violatingUserId: string | null;
    violationType: string;
};

export type ChallanServices = {
    listChallans(citizenId: string | undefined, filters: ChallanListFilters): Promise<ChallanListResult>;
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

function generatePaymentReference(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomHex = Math.random().toString(16).slice(2, 6).toUpperCase();
    return `SIMPAY-${timestamp}-${randomHex}`;
}

function getQueryString(query: Record<string, unknown>, key: string): string | undefined | null {
    const value = query[key];
    if (value === undefined) return undefined;
    return typeof value === "string" ? value.trim() : null;
}

function parseIntegerQuery(
    query: Record<string, unknown>,
    key: string,
    defaultValue: number,
): number | null {
    const value = getQueryString(query, key);
    if (value === undefined) return defaultValue;
    if (value === null || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseDateQuery(value: string | undefined | null): Date | undefined | null {
    if (value === undefined) return undefined;
    if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function parseChallanListFilters(query: Record<string, unknown>):
    { filters: ChallanListFilters } | { error: string } {
    if (Object.keys(query).some((key) => !ALLOWED_QUERY_PARAMETERS.has(key))) {
        return { error: "Unsupported challan list query parameter" };
    }

    const search = getQueryString(query, "search");
    const rawStatus = getQueryString(query, "status");
    const violationType = getQueryString(query, "violationType");
    const rawAppealStatus = getQueryString(query, "appealStatus");
    const rawSortOrder = getQueryString(query, "sortOrder");
    const dateFrom = parseDateQuery(getQueryString(query, "dateFrom"));
    const dateTo = parseDateQuery(getQueryString(query, "dateTo"));
    const page = parseIntegerQuery(query, "page", 1);
    const pageSize = parseIntegerQuery(query, "pageSize", 10);

    if (search === null || (search !== undefined && search.length > 100)) {
        return { error: "Search must be a string up to 100 characters" };
    }
    if (
        rawStatus === null ||
        (rawStatus !== undefined && !["UNPAID", "PAID", "CANCELLED"].includes(rawStatus.toUpperCase()))
    ) {
        return { error: "status must be UNPAID, PAID, or CANCELLED" };
    }
    if (violationType === null || (violationType !== undefined && (!violationType || violationType.length > 80))) {
        return { error: "violationType must be a non-empty string up to 80 characters" };
    }
    if (
        rawAppealStatus === null ||
        (rawAppealStatus !== undefined &&
            !["NONE", "PENDING", "APPROVED", "REJECTED"].includes(rawAppealStatus.toUpperCase()))
    ) {
        return { error: "appealStatus must be NONE, PENDING, APPROVED, or REJECTED" };
    }
    if (rawSortOrder === null || (rawSortOrder !== undefined && !["asc", "desc"].includes(rawSortOrder.toLowerCase()))) {
        return { error: "sortOrder must be asc or desc" };
    }
    if (dateFrom === null || dateTo === null || (dateFrom && dateTo && dateFrom > dateTo)) {
        return { error: "dateFrom and dateTo must be valid dates with dateFrom no later than dateTo" };
    }
    if (page === null || page < 1 || pageSize === null || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
        return { error: `page must be positive and pageSize must be between 1 and ${MAX_PAGE_SIZE}` };
    }
    if ((page - 1) * pageSize > MAX_OFFSET) {
        return { error: "Requested page is too far into the result set" };
    }

    return {
        filters: {
            ...(search ? { search } : {}),
            ...(rawStatus ? { status: rawStatus.toUpperCase() as ChallanListFilters["status"] } : {}),
            ...(violationType ? { violationType } : {}),
            ...(dateFrom ? { dateFrom } : {}),
            ...(dateTo ? { dateToExclusive: new Date(dateTo.getTime() + 24 * 60 * 60 * 1000) } : {}),
            ...(rawAppealStatus
                ? { appealStatus: rawAppealStatus.toUpperCase() as ChallanListFilters["appealStatus"] }
                : {}),
            sortOrder: (rawSortOrder?.toLowerCase() as "asc" | "desc" | undefined) ?? "desc",
            page,
            pageSize,
        },
    };
}

export function createChallanHandlers(services: ChallanServices) {
    return {
        list: async (req: Request, res: Response): Promise<void> => {
            const user = getAuthenticatedUser(req);
            if (!user) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            const parsedQuery = parseChallanListFilters(req.query as Record<string, unknown>);
            if ("error" in parsedQuery) {
                res.status(400).json({ success: false, message: parsedQuery.error });
                return;
            }

            try {
                const citizenId = user.role === "CITIZEN" ? user.id : undefined;
                const result = await services.listChallans(citizenId, parsedQuery.filters);
                res.json({
                    success: true,
                    challans: result.challans,
                    pagination: {
                        page: parsedQuery.filters.page,
                        pageSize: parsedQuery.filters.pageSize,
                        totalRecords: result.totalRecords,
                        totalPages: Math.ceil(result.totalRecords / parsedQuery.filters.pageSize),
                    },
                    summary: result.summary,
                });
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

            const id = req.params.id ?? req.params.challanNumber;
            if (
                typeof id !== "string" ||
                id.trim().length === 0 ||
                id.length > 128 ||
                /[\u0000-\u001f]/.test(id)
            ) {
                res.status(400).json({ success: false, message: "Invalid challan identifier" });
                return;
            }

            try {
                const citizenId = user.role === "CITIZEN" ? user.id : undefined;
                const challan = await services.getChallan(id.trim(), citizenId);
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
            if (Object.keys(body).some((key) => key !== "violationId" && key !== "notes")) {
                res.status(400).json({
                    success: false,
                    message: "Only violationId and notes may be supplied; fine amounts are configured by violation type",
                });
                return;
            }
            const violationId = body.violationId;
            if (typeof violationId !== "string" || !UUID_PATTERN.test(violationId)) {
                res.status(400).json({ success: false, message: "Valid violationId is required" });
                return;
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
                const amount = getFineAmount(violation.violationType);
                if (amount === null) {
                    res.status(400).json({ success: false, message: "Unknown violation type; no configured fine amount" });
                    return;
                }

                const exists = await services.challanExistsForViolation(violationId);
                if (exists) {
                    res.status(409).json({ success: false, message: "Challan already exists for this violation" });
                    return;
                }

                const challan = await services.createChallan({
                    violationId,
                    citizenId: violation.violatingUserId,
                    amount,
                    notes,
                });

                res.status(201).json({ success: true, challan });
            } catch (error) {
                if (isUniqueConstraintError(error)) {
                    res.status(409).json({
                        success: false,
                        message: "Challan creation conflicted with an existing unique value; retry the request",
                    });
                    return;
                }
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

function isUniqueConstraintError(error: unknown): boolean {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "P2002";
}

const defaultServices: ChallanServices = {
    listChallans: async (citizenId, filters) => {
        const scope: Prisma.ChallanWhereInput = citizenId ? { citizenId } : {};
        const violationFilter: Prisma.ViolationWhereInput = {
            ...(filters.violationType
                ? { violationType: { equals: filters.violationType, mode: "insensitive" } }
                : {}),
            ...(filters.appealStatus
                ? {
                    appeal: filters.appealStatus === "NONE"
                        ? { is: null }
                        : { is: { status: filters.appealStatus } },
                }
                : {}),
        };
        const where: Prisma.ChallanWhereInput = {
            ...scope,
            ...(filters.search
                ? { challanNumber: { contains: filters.search, mode: "insensitive" } }
                : {}),
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.dateFrom || filters.dateToExclusive
                ? {
                    createdAt: {
                        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                        ...(filters.dateToExclusive ? { lt: filters.dateToExclusive } : {}),
                    },
                }
                : {}),
            ...(Object.keys(violationFilter).length ? { violation: { is: violationFilter } } : {}),
        };

        const [challans, totalRecords, groupedStatuses, pendingAmount, appealed] = await Promise.all([
            prisma.challan.findMany({
                where,
                orderBy: { createdAt: filters.sortOrder },
                skip: (filters.page - 1) * filters.pageSize,
                take: filters.pageSize,
                include: {
                    violation: {
                        select: {
                            id: true,
                            occurredAt: true,
                            violationType: true,
                            description: true,
                            intersection: { select: { id: true, name: true, location: true } },
                            appeal: {
                                select: { id: true, status: true },
                            },
                        },
                    },
                    citizen: { select: { id: true, name: true } },
                    transactions: {
                        select: { status: true },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                    },
                },
            }) as Promise<ChallanRecord[]>,
            prisma.challan.count({ where }),
            prisma.challan.groupBy({
                by: ["status"],
                where: scope,
                _count: { _all: true },
            }),
            prisma.challan.aggregate({
                where: { ...scope, status: "UNPAID" },
                _sum: { amount: true },
            }),
            prisma.challan.count({
                where: { ...scope, violation: { is: { appeal: { isNot: null } } } },
            }),
        ]);
        const counts = new Map(groupedStatuses.map((group) => [group.status, group._count._all]));

        return {
            challans,
            totalRecords,
            summary: {
                total: groupedStatuses.reduce((total, group) => total + group._count._all, 0),
                pending: counts.get("UNPAID") ?? 0,
                paid: counts.get("PAID") ?? 0,
                cancelled: counts.get("CANCELLED") ?? 0,
                appealed,
                pendingAmount: pendingAmount._sum.amount ?? 0,
            },
        };
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
                        appeal: {
                            select: {
                                id: true,
                                status: true,
                                reason: true,
                                reviewNotes: true,
                                reviewedAt: true,
                                createdAt: true,
                            },
                        },
                    },
                },
                citizen: { select: { id: true, name: true } },
                transactions: {
                    select: {
                        id: true,
                        amount: true,
                        status: true,
                        reference: true,
                        paymentMethod: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: "desc" },
                    take: 10,
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
                        evidence: { select: { id: true, originalName: true, mimeType: true, createdAt: true } },
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
                                evidence: { select: { id: true, originalName: true, mimeType: true, createdAt: true } },
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
                            evidence: { select: { id: true, originalName: true, mimeType: true, createdAt: true } },
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
