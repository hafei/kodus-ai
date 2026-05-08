import { PostHog } from "posthog-node";

import { evaluateCatalogGate } from "@libs/feature-gate/domain/decision";
import type { ReleaseTrack } from "@libs/feature-gate/domain/release-track";

import { auth } from "src/core/config/auth";

import { findFeature } from "./snapshot";

export interface IsFeatureEnabledOptions {
    feature: string;
    identifier?: "user" | "organization";
    /**
     * The org's release track. When omitted, callers should pass the
     * value from `getOrganizationReleaseTrack()` so the stage gate is
     * enforced. If undefined, the safe default `beta` is used (legacy
     * permissive behavior).
     */
    releaseTrack?: ReleaseTrack;
}

/**
 * Next.js adapter around the pure `evaluateCatalogGate` decision in
 * `libs/feature-gate/domain/decision.ts`. Web is always cloud, so the
 * audience is hardcoded; runtime specifics are next-auth + posthog-node
 * per call.
 *
 * The lib mirror at `libs/feature-gate/application/feature-gate.service.ts`
 * calls the same `evaluateCatalogGate` — there's exactly one source of
 * gate logic.
 */
export const isFeatureEnabled = async ({
    feature,
    identifier = "user",
    releaseTrack,
}: IsFeatureEnabledOptions): Promise<boolean> => {
    try {
        const entry = findFeature(feature);
        const decision = evaluateCatalogGate({
            entry,
            audience: "cloud",
            track: releaseTrack,
        });

        if (decision === "deny") return false;

        // Self-hosted web bundles run without a PostHog key. After the
        // catalog already passed us, fall through to the legacy
        // permissive behavior so the app keeps working.
        if (!process.env.WEB_POSTHOG_KEY) return true;

        const jwtPayload = await auth();
        const orgId = jwtPayload?.user?.organizationId;
        const id =
            identifier === "user" ? jwtPayload?.user?.userId : orgId;
        if (!id) return false;

        const posthog = new PostHog(process.env.WEB_POSTHOG_KEY, {
            flushAt: 1,
            flushInterval: 0,
            host: "https://us.i.posthog.com",
        });
        try {
            const value = await posthog
                .isFeatureEnabled(feature, id, {
                    groups: { organization: orgId || "" },
                })
                .catch(() => false);
            return value === true;
        } finally {
            await posthog.shutdown();
        }
    } catch (error) {
        console.error("Error checking feature flag:", error);
        return false;
    }
};
