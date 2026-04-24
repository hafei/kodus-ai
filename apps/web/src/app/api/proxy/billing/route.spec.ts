/**
 * /api/proxy/billing/[...path]/route.ts — forwards browser fetches to
 * the internal billing service.
 */

jest.mock("server-only", () => ({}), { virtual: true });

const createUrlMock = jest.fn(
    (host: string, port: string, path: string) =>
        `http://${host}:${port}${path}`,
);
jest.mock("src/core/utils/helpers", () => ({
    createUrl: (...args: unknown[]) => (createUrlMock as any)(...args),
}));

import { GET, POST } from "./[...path]/route";

function mockReq(method: string, init?: { search?: string; body?: any }): any {
    const headers = new Headers({
        host: "app.example.com",
        cookie: "auth=abc",
    });
    return {
        method,
        headers,
        body: init?.body ?? null,
        nextUrl: { search: init?.search ?? "" },
    };
}

function ctx(path: string[]) {
    return { params: Promise.resolve({ path }) };
}

describe("/api/proxy/billing/[...path]", () => {
    const originalFetch = global.fetch;
    let fetchMock: jest.Mock;
    const ENV_ORIG = {
        host: process.env.WEB_HOSTNAME_BILLING,
        port: process.env.WEB_PORT_BILLING,
        container: process.env.GLOBAL_BILLING_CONTAINER_NAME,
    };

    beforeEach(() => {
        createUrlMock.mockClear();
        fetchMock = jest
            .fn()
            .mockResolvedValue(new Response("ok", { status: 200 }));
        global.fetch = fetchMock as any;
        process.env.WEB_HOSTNAME_BILLING = "billing.internal";
        process.env.WEB_PORT_BILLING = "3992";
        delete process.env.GLOBAL_BILLING_CONTAINER_NAME;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    afterAll(() => {
        process.env.WEB_HOSTNAME_BILLING = ENV_ORIG.host;
        process.env.WEB_PORT_BILLING = ENV_ORIG.port;
        process.env.GLOBAL_BILLING_CONTAINER_NAME = ENV_ORIG.container;
    });

    it("GET: rewrites to the internal billing host + port", async () => {
        await GET(
            mockReq("GET", { search: "?org=abc" }),
            ctx(["license", "users"]),
        );
        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe(
            "http://billing.internal:3992/api/billing/license/users?org=abc",
        );
    });

    it("resolves localhost to GLOBAL_BILLING_CONTAINER_NAME", async () => {
        process.env.WEB_HOSTNAME_BILLING = "localhost";
        process.env.GLOBAL_BILLING_CONTAINER_NAME = "my-billing";
        await GET(mockReq("GET"), ctx(["status"]));
        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe("http://my-billing:3992/api/billing/status");
    });

    it("strips Host header, preserves Cookie", async () => {
        await GET(mockReq("GET"), ctx(["x"]));
        const [, init] = fetchMock.mock.calls[0];
        expect((init.headers as Headers).get("host")).toBeNull();
        expect((init.headers as Headers).get("cookie")).toBe("auth=abc");
    });

    it("POST: forwards streaming body with duplex", async () => {
        const body = new ReadableStream();
        await POST(mockReq("POST", { body }), ctx(["checkout"]));
        const [, init] = fetchMock.mock.calls[0];
        expect(init.body).toBe(body);
        expect((init as any).duplex).toBe("half");
    });

    it("passes through upstream status and body", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("upstream error", { status: 502 }),
        );
        const res = await GET(mockReq("GET"), ctx(["x"]));
        expect(res.status).toBe(502);
    });

    // Regression: in self-hosted, createUrl's default containerName
    // points at the API container (kodus_api). Without the explicit
    // { containerName: hostName } option, the billing hostname
    // (kodus-service-billing) failed the "hostName !== containerName"
    // check and the helper produced an https/no-port URL — ECONNREFUSED
    // at port 443. The billing route must always pass the resolved
    // hostName as the containerName so the http+port branch fires for
    // any upstream, regardless of which default createUrl uses.
    it("passes resolved hostName as containerName option to createUrl", async () => {
        process.env.WEB_HOSTNAME_BILLING = "localhost";
        process.env.GLOBAL_BILLING_CONTAINER_NAME = "my-billing";
        await GET(mockReq("GET"), ctx(["trial"]));
        const [, , , options] = createUrlMock.mock.calls[0];
        expect(options).toEqual({ containerName: "my-billing" });
    });

    it("passes hostName as containerName even when not resolved from localhost", async () => {
        process.env.WEB_HOSTNAME_BILLING = "billing.internal";
        await GET(mockReq("GET"), ctx(["status"]));
        const [, , , options] = createUrlMock.mock.calls[0];
        expect(options).toEqual({ containerName: "billing.internal" });
    });
});
