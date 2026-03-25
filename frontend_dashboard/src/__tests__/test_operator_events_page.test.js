import React from "react";
import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { OperatorEventsPage } from "../pages/OperatorEvents";

/**
 * Note: This app runs in "mock" mode when REACT_APP_API_BASE is not set.
 * These tests intentionally rely on the in-memory mock store in src/services/mockData.js
 * and validate end-to-end UI workflows (not isolated unit tests).
 */

function renderOperatorEventsAtRoute() {
  return render(
    <MemoryRouter initialEntries={["/events"]}>
      <OperatorEventsPage />
    </MemoryRouter>
  );
}

function getHistoryTable() {
  return screen.getByRole("table", { name: /event history/i });
}

function getHistoryRows() {
  // Filter out the header row by selecting tbody rows only.
  const table = getHistoryTable();
  const body = within(table).getAllByRole("rowgroup")[1];
  return within(body).queryAllByRole("row");
}

function openFirstRowAction(actionName) {
  const table = getHistoryTable();
  const body = within(table).getAllByRole("rowgroup")[1];
  const firstRow = within(body).getAllByRole("row")[0];
  const actionCell = within(firstRow).getAllByRole("cell")[7];
  fireEvent.click(within(actionCell).getByRole("button", { name: actionName }));
  return { firstRow, actionCell };
}

describe("OperatorEventsPage", () => {
  beforeEach(() => {
    // Ensure timer/favorites don't leak between tests
    window.localStorage.clear();
  });

  test("downtime timer start/stop creates an event and clears active timer banner", async () => {
    jest.useFakeTimers();

    renderOperatorEventsAtRoute();

    // Wait for initial history to render with mock events
    expect(await screen.findByRole("table", { name: /event history/i })).toBeInTheDocument();
    const initialRowCount = getHistoryRows().length;
    expect(initialRowCount).toBeGreaterThan(0);

    // Select a reason code (required to start downtime)
    const reasonCodeSelect = screen.getByLabelText(/reason code/i);
    fireEvent.change(reasonCodeSelect, { target: { value: "JAM" } });

    // Start timer
    fireEvent.click(screen.getByRole("button", { name: /start downtime timer/i }));

    // Banner should appear
    expect(await screen.findByText(/downtime running/i)).toBeInTheDocument();
    expect(screen.getByTitle(/downtime is currently running/i)).toBeInTheDocument();

    // Let timer tick a bit (ensures UI is driven by interval)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Stop & save
    fireEvent.click(screen.getByRole("button", { name: /stop & save/i }));

    // Wait until banner disappears and history updates
    expect(await screen.findByRole("table", { name: /event history/i })).toBeInTheDocument();
    expect(screen.queryByText(/downtime running/i)).not.toBeInTheDocument();

    const afterRowCount = getHistoryRows().length;
    expect(afterRowCount).toBe(initialRowCount + 1);

    jest.useRealTimers();
  });

  test("quality event submission validates required defect reason and creates event with quality summary", async () => {
    renderOperatorEventsAtRoute();

    expect(await screen.findByRole("table", { name: /event history/i })).toBeInTheDocument();

    // Switch to QUALITY
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "QUALITY" } });

    // Choose a reason code that supports QUALITY (QC_HOLD)
    fireEvent.change(screen.getByLabelText(/reason code/i), { target: { value: "QC_HOLD" } });

    // Scrap is default quality mode; defect reason is required. Try submit without defect reason.
    fireEvent.click(screen.getByRole("button", { name: /submit event/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/select a defect reason/i);

    // Provide defect reason and submit
    fireEvent.change(screen.getByLabelText(/defect reason/i), { target: { value: "SEAL" } });
    fireEvent.change(screen.getByLabelText(/^count$/i), { target: { value: "2" } });

    const initialCount = getHistoryRows().length;
    fireEvent.click(screen.getByRole("button", { name: /submit event/i }));

    // History should add one row and include a scrap summary with defect label
    const afterCount = await screen.findByText((content) => content.includes("Scrap: 2"));
    expect(afterCount).toBeInTheDocument();
    expect(getHistoryRows().length).toBe(initialCount + 1);
    expect(screen.getByText(/seal defect/i)).toBeInTheDocument();
  });

  test("reason code search filters options and favorites can be toggled", async () => {
    renderOperatorEventsAtRoute();

    // wait for catalogs to load and favorites to auto-seed (defaults include JAM and MAT_SHORT)
    expect(await screen.findByText(/log a production event/i)).toBeInTheDocument();

    // Favorites section should appear due to default seeding
    expect(await screen.findByRole("list", { name: /favorite reason codes/i })).toBeInTheDocument();
    const favList = screen.getByRole("list", { name: /favorite reason codes/i });
    // At least one default favorite chip (e.g., Machine jam / Material shortage)
    expect(within(favList).getAllByRole("button").length).toBeGreaterThan(0);

    // Search should narrow the reason code select options
    const reasonSearch = screen.getByLabelText(/reason codes/i);
    fireEvent.change(reasonSearch, { target: { value: "jam" } });

    const reasonCodeSelect = screen.getByLabelText(/reason code/i);
    const options = within(reasonCodeSelect).getAllByRole("option").map((o) => o.textContent || "");
    // Should include Machine jam option, and typically exclude unrelated ones for DOWNTIME
    expect(options.join(" ")).toMatch(/Machine jam/i);

    // Pick JAM and favorite/unfavorite it (button label flips)
    fireEvent.change(reasonCodeSelect, { target: { value: "JAM" } });

    const favBtn = await screen.findByRole("button", { name: /unfavorite|favorite/i });
    const before = favBtn.textContent;

    fireEvent.click(favBtn);
    const after = (await screen.findByRole("button", { name: /unfavorite|favorite/i })).textContent;

    expect(after).not.toEqual(before);

    // LocalStorage should reflect favorites list
    const stored = JSON.parse(window.localStorage.getItem("oee.reasonFavorites") || "[]");
    expect(Array.isArray(stored)).toBe(true);
    expect(stored.includes("JAM")).toBe(after.includes("Unfavorite"));
  });

  test("history filters: type filter reduces rows and include-voided toggles visibility", async () => {
    renderOperatorEventsAtRoute();

    expect(await screen.findByRole("table", { name: /event history/i })).toBeInTheDocument();

    // Baseline: some rows
    const baseCount = getHistoryRows().length;
    expect(baseCount).toBeGreaterThan(0);

    // Filter to QUALITY
    fireEvent.change(screen.getByLabelText(/^type$/i, { selector: "#histType" }), { target: { value: "QUALITY" } });
    const qualityCount = getHistoryRows().length;
    expect(qualityCount).toBeGreaterThan(0);
    expect(qualityCount).toBeLessThanOrEqual(baseCount);

    // Void the first visible row (might be QUALITY or DOWNTIME depending on sorting).
    // Ensure voided isn't included by default (hide).
    openFirstRowAction("Void");

    // Submit without reason -> error
    fireEvent.click(screen.getByRole("button", { name: /void event/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/void reason is required/i);

    // Provide reason and void
    fireEvent.change(screen.getByLabelText(/void reason/i), { target: { value: "Duplicate entry" } });
    fireEvent.click(screen.getByRole("button", { name: /void event/i }));

    // With includeVoided=Hide, the voided row should not be shown.
    // We can't easily identify which event disappeared, but the shown count should be <= prior count.
    const afterVoidHiddenCount = getHistoryRows().length;
    expect(afterVoidHiddenCount).toBeLessThanOrEqual(qualityCount);

    // Toggle include voided
    fireEvent.change(screen.getByLabelText(/show voided/i), { target: { value: "yes" } });

    // Now, a "Voided:" marker should be visible in the table
    expect(await screen.findByText(/Voided:/i)).toBeInTheDocument();
  });

  test("edit workflow marks row as edited and audit trail shows EDITED action", async () => {
    renderOperatorEventsAtRoute();

    expect(await screen.findByRole("table", { name: /event history/i })).toBeInTheDocument();

    // Open edit for first row
    openFirstRowAction("Edit");
    expect(await screen.findByRole("dialog", { name: /edit event dialog/i })).toBeInTheDocument();

    // Change notes and save
    fireEvent.change(screen.getByLabelText(/notes/i, { selector: "#editNotes" }), { target: { value: "Updated notes from test" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    // After closing dialog, first row should have edited marker (CSS adds "(edited)" after strong in first cell)
    // We check by class name used in UI: tableRowEdited
    const rows = getHistoryRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].className).toMatch(/tableRowEdited/);

    // Open audit for the same (top) row and verify EDITED action appears
    openFirstRowAction("Audit");
    expect(await screen.findByRole("dialog", { name: /audit trail dialog/i })).toBeInTheDocument();

    const auditTable = screen.getByRole("table", { name: /audit trail/i });
    expect(within(auditTable).getByText("EDITED")).toBeInTheDocument();

    // Close audit
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog", { name: /audit trail dialog/i })).not.toBeInTheDocument();
  });
});
