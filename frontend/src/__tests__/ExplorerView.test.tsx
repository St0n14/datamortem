import { render, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { ExplorerView } from "../views/ExplorerView";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    token: "token-123",
  }),
}));

const mockResponse = (data: any) =>
  ({
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }) as Response;

describe("ExplorerView search integration", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/search/query") {
        return Promise.resolve(
          mockResponse({
            hits: { hits: [{ "@timestamp": "2024-01-01T00:00:00Z", message: "ping", _score: 1 }], total: { value: 1 } },
            took: 5,
          })
        );
      }
      if (url === "/api/search/aggregate") {
        return Promise.resolve(mockResponse({ buckets: [], field: "event.type", total: 0 }));
      }
      return Promise.resolve(mockResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  test("adds bearer token header to search requests", async () => {
    render(<ExplorerView darkMode currentCaseId="case-alpha" />);

    await waitFor(() => {
      const queryCall = fetchMock.mock.calls.find((call) => call[0] === "/api/search/query");
      expect(queryCall).toBeTruthy();
      const options = queryCall?.[1] as RequestInit;
      expect(options.headers).toMatchObject({
        Authorization: "Bearer token-123",
      });
    });
  });

  test("re-issues search when case changes", async () => {
    const { rerender } = render(<ExplorerView darkMode currentCaseId="case-a" />);

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter((call) => call[0] === "/api/search/query")).toHaveLength(1);
    });

    rerender(<ExplorerView darkMode currentCaseId="case-b" />);

    await waitFor(() => {
      const queryCalls = fetchMock.mock.calls.filter((call) => call[0] === "/api/search/query");
      expect(queryCalls).toHaveLength(2);
      const lastCallOptions = queryCalls[1][1] as RequestInit;
      const body = JSON.parse((lastCallOptions.body as string) ?? "{}");
      expect(body.case_id).toBe("case-b");
    });
  });
});
