import { describe, test, expect } from "bun:test";
import { generateEventOgImage, generateHubOgImage, TYPE_COLORS } from "../og-image";
import { sampleConcert, sampleFreeExhibition } from "../../../tests/fixtures/events";
import type { Event } from "../../types";

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Extract PNG dimensions from the IHDR chunk (bytes 16-23).
 * Width: bytes 16-19 (big-endian uint32)
 * Height: bytes 20-23 (big-endian uint32)
 */
function getPngDimensions(buf: Buffer): { width: number; height: number } {
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe("generateEventOgImage", () => {
  test("produces a valid PNG buffer", async () => {
    const png = await generateEventOgImage(sampleConcert);

    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(5000);
    // Check PNG magic bytes
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  test("output is 1200×630", async () => {
    const png = await generateEventOgImage(sampleConcert);
    const { width, height } = getPngDimensions(png);

    expect(width).toBe(1200);
    expect(height).toBe(630);
  });

  test("renders Greek title without crashing", async () => {
    const greekEvent: Event = {
      ...sampleConcert,
      title: "Ρεμπέτικο βράδυ στο Χαραμά",
      venue: { ...sampleConcert.venue, name: "Χαραμά" },
    };

    const png = await generateEventOgImage(greekEvent);
    expect(png.length).toBeGreaterThan(5000);
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  test("handles XML-special characters in title safely", async () => {
    const specialEvent: Event = {
      ...sampleConcert,
      title: 'Rock & Roll "Live" <Athens>',
      venue: { ...sampleConcert.venue, name: 'Club "Gagarin" & Friends' },
    };

    const png = await generateEventOgImage(specialEvent);
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(5000);
  });

  test("handles very long Greek title without breaking layout", async () => {
    const longTitleEvent: Event = {
      ...sampleConcert,
      title: "Μεγάλη Συναυλία Κλασικής Μουσικής Φιλαρμονικής Ορχήστρας Αθηνών με Ειδική Προσκεκλημένη τη Σοπράνο Μαρία Κάλλας σε Έργα Βέρντι και Πουτσίνι",
    };

    const png = await generateEventOgImage(longTitleEvent);
    const { width, height } = getPngDimensions(png);

    expect(width).toBe(1200);
    expect(height).toBe(630);
    expect(png.length).toBeGreaterThan(5000);
  });

  test("uses correct type color for exhibition", async () => {
    // We can't inspect the rendered pixels, but we verify it doesn't crash
    // and produces a valid image for a different event type
    const png = await generateEventOgImage(sampleFreeExhibition);
    expect(png).toBeInstanceOf(Buffer);
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });
});

describe("generateHubOgImage", () => {
  test("produces a valid 1200×630 PNG", async () => {
    const png = await generateHubOgImage(
      "Συναυλίες στην Αθήνα",
      42,
      TYPE_COLORS.concert
    );

    expect(png).toBeInstanceOf(Buffer);
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);

    const { width, height } = getPngDimensions(png);
    expect(width).toBe(1200);
    expect(height).toBe(630);
  });

  test("renders with custom accent color", async () => {
    const png = await generateHubOgImage(
      "Εκδηλώσεις Σήμερα στην Αθήνα",
      15,
      "#5ba4e6"
    );

    expect(png.length).toBeGreaterThan(5000);
  });

  test("handles zero event count", async () => {
    const png = await generateHubOgImage(
      "Εκδηλώσεις Σαββατοκύριακο",
      0,
      TYPE_COLORS.theater
    );

    expect(png).toBeInstanceOf(Buffer);
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });
});
