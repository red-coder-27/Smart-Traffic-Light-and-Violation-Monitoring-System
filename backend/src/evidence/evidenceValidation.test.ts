import assert from "node:assert/strict";
import test from "node:test";
import {
    createEvidenceStorageKey,
    matchesMimeTypeSignature,
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

test("rejects empty evidence files and invalid size metadata", () => {
    const zeroSize = validateEvidenceFile({
        originalName: "empty.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 0,
    });
    assert.equal(zeroSize.valid, false);
    if (!zeroSize.valid) {
        assert.equal(zeroSize.statusCode, 400);
        assert.equal(zeroSize.message, "Evidence file cannot be empty");
    }

    const negativeSize = validateEvidenceFile({
        originalName: "negative.jpg",
        mimeType: "image/jpeg",
        sizeBytes: -1,
    });
    assert.equal(negativeSize.valid, false);
    if (!negativeSize.valid) {
        assert.equal(negativeSize.statusCode, 400);
    }

    const emptyBuffer = validateEvidenceFile(
        {
            originalName: "empty.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 0,
        },
        new Uint8Array(0),
    );
    assert.equal(emptyBuffer.valid, false);
    if (!emptyBuffer.valid) {
        assert.equal(emptyBuffer.statusCode, 400);
    }
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

test("validates actual content signatures for allowed MIME types", () => {
    const validJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const validPdf = Buffer.from("%PDF-1.4 sample");
    const validWebp = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    const validMp4 = new Uint8Array([
        0x00, 0x00, 0x00, 0x18,
        0x66, 0x74, 0x79, 0x70, // ftyp
    ]);

    assert.equal(matchesMimeTypeSignature("image/jpeg", validJpeg), true);
    assert.equal(matchesMimeTypeSignature("image/png", validPng), true);
    assert.equal(matchesMimeTypeSignature("application/pdf", validPdf), true);
    assert.equal(matchesMimeTypeSignature("image/webp", validWebp), true);
    assert.equal(matchesMimeTypeSignature("video/mp4", validMp4), true);

    const jpegResult = validateEvidenceFile(
        { originalName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: validJpeg.length },
        validJpeg,
    );
    assert.equal(jpegResult.valid, true);
});

test("rejects malformed file content that does not match declared MIME type", () => {
    const fakeJpeg = Buffer.from("plain text content, definitely not jpeg");
    const result = validateEvidenceFile(
        { originalName: "fake.jpg", mimeType: "image/jpeg", sizeBytes: fakeJpeg.length },
        fakeJpeg,
    );

    assert.equal(result.valid, false);
    if (!result.valid) {
        assert.equal(result.statusCode, 400);
        assert.equal(result.message, "Malformed or invalid evidence file content");
    }
});

test("rejects mismatch between declared size and actual payload length", () => {
    const validJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = validateEvidenceFile(
        { originalName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 9999 },
        validJpeg,
    );

    assert.equal(result.valid, false);
    if (!result.valid) {
        assert.equal(result.statusCode, 400);
        assert.equal(result.message, "Evidence file size does not match declared size");
    }
});

test("creates a server-controlled storage key", () => {
    assert.equal(
        createEvidenceStorageKey("violation/1", "evidence-1", "../../camera image.JPG"),
        "violations/violation%2F1/evidence-1/file.jpg",
    );
});
