/**
 * Tests for createUrl — specifically the self-hosted branch that caused
 * the billing proxy ECONNREFUSED regression.
 *
 * The function's self-hosted branch picks "https + no port" whenever the
 * resolved hostname differs from a default containerName that points at
 * the API container. Passing { containerName: hostName } is the escape
 * hatch so non-API upstreams (billing, MCP) keep the http + port
 * behavior. These tests lock both branches in.
 */

jest.mock("server-only", () => ({}), { virtual: true });
// helpers.ts imports jose (ESM) for JWT utilities and a deep type from
// the (app) tree. createUrl doesn't touch either, so stub them to keep
// the test hermetic.
jest.mock("jose", () => ({
    decodeJwt: jest.fn(),
    decodeProtectedHeader: jest.fn(),
}));
jest.mock(
    "src/app/(app)/settings/code-review/_types",
    () => ({}),
    { virtual: true },
);

describe("createUrl", () => {
    const ENV_ORIG = {
        webNodeEnv: process.env.WEB_NODE_ENV,
        apiContainer: process.env.GLOBAL_API_CONTAINER_NAME,
    };

    afterEach(() => {
        process.env.WEB_NODE_ENV = ENV_ORIG.webNodeEnv;
        process.env.GLOBAL_API_CONTAINER_NAME = ENV_ORIG.apiContainer;
        jest.resetModules();
    });

    function loadCreateUrl(env: {
        nodeEnv?: string;
        apiContainer?: string;
    }): typeof import("./helpers").createUrl {
        if (env.nodeEnv !== undefined) {
            process.env.WEB_NODE_ENV = env.nodeEnv;
        } else {
            delete process.env.WEB_NODE_ENV;
        }
        if (env.apiContainer !== undefined) {
            process.env.GLOBAL_API_CONTAINER_NAME = env.apiContainer;
        } else {
            delete process.env.GLOBAL_API_CONTAINER_NAME;
        }
        let mod: typeof import("./helpers");
        jest.isolateModules(() => {
            mod = require("./helpers");
        });
        return mod!.createUrl;
    }

    describe("self-hosted mode", () => {
        it("billing container without containerName option picks https/no-port (regression repro)", () => {
            // This is the shape of the ECONNREFUSED bug: hostName
            // differed from the API container default, so createUrl
            // concluded the caller wanted a public https endpoint.
            const createUrl = loadCreateUrl({
                nodeEnv: "self-hosted",
                apiContainer: "kodus_api",
            });
            const url = createUrl(
                "kodus-service-billing",
                "3992",
                "/api/billing/trial",
            );
            expect(url).toBe(
                "https://kodus-service-billing/api/billing/trial",
            );
        });

        it("billing container WITH { containerName: hostName } picks http+port (fix)", () => {
            const createUrl = loadCreateUrl({
                nodeEnv: "self-hosted",
                apiContainer: "kodus_api",
            });
            const url = createUrl(
                "kodus-service-billing",
                "3992",
                "/api/billing/trial",
                { containerName: "kodus-service-billing" },
            );
            expect(url).toBe(
                "http://kodus-service-billing:3992/api/billing/trial",
            );
        });

        it("localhost always picks http+port regardless of options", () => {
            const createUrl = loadCreateUrl({
                nodeEnv: "self-hosted",
                apiContainer: "kodus_api",
            });
            expect(createUrl("localhost", "3001", "/x")).toBe(
                "http://localhost:3001/x",
            );
        });

        it("hostname matching the API container default picks http+port", () => {
            const createUrl = loadCreateUrl({
                nodeEnv: "self-hosted",
                apiContainer: "kodus_api",
            });
            expect(createUrl("kodus_api", "3001", "/team")).toBe(
                "http://kodus_api:3001/team",
            );
        });
    });

    describe("non-self-hosted modes", () => {
        it("development: http+port for any host", () => {
            const createUrl = loadCreateUrl({ nodeEnv: "development" });
            expect(createUrl("anything", "1234", "/p")).toBe(
                "http://anything:1234/p",
            );
        });

        it("production: https, no port", () => {
            const createUrl = loadCreateUrl({ nodeEnv: "production" });
            expect(createUrl("api.example.com", "443", "/p")).toBe(
                "https://api.example.com/p",
            );
        });
    });

    describe("protocol detection from hostName", () => {
        it("preserves http:// prefix", () => {
            const createUrl = loadCreateUrl({ nodeEnv: "development" });
            expect(createUrl("http://host", "80", "/p")).toBe(
                "http://host:80/p",
            );
        });

        it("preserves https:// prefix", () => {
            const createUrl = loadCreateUrl({ nodeEnv: "development" });
            expect(createUrl("https://host", "443", "/p")).toBe(
                "https://host:443/p",
            );
        });
    });
});
