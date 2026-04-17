import { describe, test, expect } from "bun:test";
import {
  renderActionBarHtml,
  renderCardSaveButton,
  renderSavedEventsScript,
  renderSaveButtonScript,
  renderCardSaveScript,
  renderShareButtonScript,
  renderSavedPageScript,
  escapeAttr,
} from "../action-bar";

describe("escapeAttr", () => {
  test("escapes quotes and angle brackets", () => {
    expect(escapeAttr('DJ "Night" <Athens>')).toBe('DJ &quot;Night&quot; &lt;Athens&gt;');
  });

  test("escapes ampersands", () => {
    expect(escapeAttr("Rock & Roll")).toBe("Rock &amp; Roll");
  });

  test("escapes single quotes", () => {
    expect(escapeAttr("It's showtime")).toBe("It&#39;s showtime");
  });
});

describe("renderActionBarHtml", () => {
  const html = renderActionBarHtml("evt-123", "evt-slug", "Jazz Night", "https://agentathens.com/events/evt-slug/", "el");

  test("renders save button with correct data attributes", () => {
    expect(html).toContain('data-event-id="evt-123"');
    expect(html).toContain('data-event-slug="evt-slug"');
    expect(html).toContain('data-event-title="Jazz Night"');
    expect(html).toContain('data-save-event');
  });

  test("renders share button with canonical URL", () => {
    expect(html).toContain('data-share-url="https://agentathens.com/events/evt-slug/"');
  });

  test("renders Greek labels by default", () => {
    expect(html).toContain("Αποθήκευση");
    expect(html).toContain("Κοινοποίηση");
  });

  test("renders English labels for en locale", () => {
    const enHtml = renderActionBarHtml("evt-123", "evt-slug", "Jazz Night", "https://agentathens.com/events/evt-slug/", "en");
    expect(enHtml).toContain("Save");
    expect(enHtml).toContain("Share");
  });

  test("has aria-pressed on save button", () => {
    expect(html).toContain('aria-pressed="false"');
  });

  test("escapes title with special characters", () => {
    const specialHtml = renderActionBarHtml("e1", "s1", 'DJ "Athens" Night', "https://example.com", "el");
    expect(specialHtml).toContain('data-event-title="DJ &quot;Athens&quot; Night"');
  });

  test("includes bookmark SVG icon", () => {
    expect(html).toContain('<svg width="20" height="20"');
    expect(html).toContain("M19 21l-7-5-7 5V5");
  });
});

describe("renderCardSaveButton", () => {
  const html = renderCardSaveButton("card-1", "card-slug", "Concert Title");

  test("renders with card-save-btn class", () => {
    expect(html).toContain('class="card-save-btn"');
  });

  test("has correct data attributes with bare slug (no /events/ prefix)", () => {
    expect(html).toContain('data-event-id="card-1"');
    expect(html).toContain('data-event-slug="card-slug"');
    expect(html).not.toContain('data-event-slug="/events/');
  });

  test("has aria-pressed and aria-label", () => {
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Save"');
  });

  test("uses 16px icon", () => {
    expect(html).toContain('<svg width="16" height="16"');
  });
});

describe("renderSavedEventsScript", () => {
  const script = renderSavedEventsScript();

  test("is wrapped in script tags", () => {
    expect(script).toContain("<script>");
    expect(script).toContain("</script>");
  });

  test("defines window.__aaSaved namespace", () => {
    expect(script).toContain("window.__aaSaved");
  });

  test("uses correct localStorage key", () => {
    expect(script).toContain("agent-athens-saved");
  });

  test("enforces max 200 items", () => {
    expect(script).toContain("MAX = 200");
  });

  test("dispatches aa:saved-change custom event", () => {
    expect(script).toContain("aa:saved-change");
  });

  test("handles cross-tab sync via storage event", () => {
    expect(script).toContain("addEventListener('storage'");
  });

  test("wraps localStorage access in try/catch", () => {
    expect(script).toContain("try {");
    expect(script).toContain("catch(e)");
  });
});

describe("renderSaveButtonScript", () => {
  const script = renderSaveButtonScript();

  test("queries data-save-event buttons", () => {
    expect(script).toContain("[data-save-event]");
  });

  test("toggles is-saved class", () => {
    expect(script).toContain("is-saved");
  });

  test("updates aria-pressed attribute", () => {
    expect(script).toContain("aria-pressed");
  });

  test("guards against missing __aaSaved", () => {
    expect(script).toContain("if (!window.__aaSaved) return");
  });
});

describe("renderCardSaveScript", () => {
  const script = renderCardSaveScript();

  test("uses event delegation for card-save-btn clicks", () => {
    expect(script).toContain(".card-save-btn");
    expect(script).toContain("e.target.closest");
  });

  test("prevents card navigation with stopPropagation", () => {
    expect(script).toContain("stopPropagation");
  });

  test("prevents default action", () => {
    expect(script).toContain("preventDefault");
  });
});

describe("renderShareButtonScript", () => {
  const script = renderShareButtonScript();

  test("detects Web Share API", () => {
    expect(script).toContain("navigator.share");
  });

  test("falls back to clipboard API", () => {
    expect(script).toContain("navigator.clipboard");
  });

  test("falls back to execCommand copy", () => {
    expect(script).toContain("execCommand('copy')");
  });

  test("creates accessible toast with role=status", () => {
    expect(script).toContain("'role', 'status'");
    expect(script).toContain("'aria-live', 'polite'");
  });

  test("removes toast after 2 seconds", () => {
    expect(script).toContain("2000");
  });

  test("uses aa-toast class", () => {
    expect(script).toContain("aa-toast");
  });
});

describe("renderSavedPageScript", () => {
  test("renders Greek remove label for el locale", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("Αφαίρεση");
  });

  test("renders English remove label for en locale", () => {
    const script = renderSavedPageScript("en");
    expect(script).toContain("Remove");
  });

  test("reads saved events list container", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("saved-events-list");
  });

  test("handles empty state", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("saved-empty");
  });

  test("uses safe DOM construction", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("createElement");
    expect(script).toContain("textContent");
  });

  test("includes slug migration that strips /events/ prefix", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("/events/");
    expect(script).toContain("migrate");
    // Handles both /events/ and /en/events/ prefixes
    expect(script).toContain("(en\\/)?events\\/");
  });

  test("migration is idempotent — only writes if entries changed", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("if (changed)");
  });
});
