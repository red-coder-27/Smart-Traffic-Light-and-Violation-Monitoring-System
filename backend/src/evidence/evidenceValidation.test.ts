import assert from "node:assert/strict";
import test from "node:test";
import {
    createEvidenceStorageKey,
    validateEvidenceFile,
    validateEvidenceFiles,
} from "./evidenceValidation.js";

test("accepts supported evidence metadata within the size limit", () => {
    const result = validateEvidenceFile({
        originalName: "camera image.JPG",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
    });

    assert.equal(result.valid, true);
    if (result.valid) {
        assert.equal(result.file.originalName, "camera image.JPG");
    }
});

test("rejects missing and unsupported evidence files", () => {
    assert.equal(validateEvidenceFile(undefined).statusCode, 400);
    assert.equal(validateEvidenceFiles([]).statusCode, 400);
    assert.equal(validateEvidenceFiles([
        { originalName: "one.jpg", mimeType: "image/jpeg", sizeBytes: 1 },
        { originalName: "two.jpg", mimeType: "image/jpeg", sizeBytes: 1 },
    ]).statusCode, 400);
    assert.equal(validateEvidenceFile({
        originalName: "payload.exe",
        mimeType: "application/octet-stream",
        sizeBytes: 10,
    }).statusCode, 415);
});

test("rejects evidence larger than 10 MB", () => {
    const result = validateEvidenceFile({
        originalName: "large.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10 * 1024 * 1024 + 1,
    });

    assert.equal(result.valid, false);
    if (!result.valid) {
        assert.equal(result.statusCode, 413);
    }
});

test("creates a server-controlled storage key", () => {
    assert.equal(
        createEvidenceStorageKey("violation/1", "evidence-1", "../../camera image.JPG"),
        "violations/violation%2F1/evidence-1/file.jpg",
    );
});
