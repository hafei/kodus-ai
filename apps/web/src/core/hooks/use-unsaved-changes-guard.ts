import { useEffect, useRef } from "react";
import { registerNavigationGuard } from "src/core/utils/navigation-guard";

type UnsavedChangesGuardConfig = {
    id: string;
    isDirty: boolean;
    onBlock: () => void;
};

export function useUnsavedChangesGuard(config: UnsavedChangesGuardConfig) {
    const configRef = useRef(config);
    configRef.current = config;

    useEffect(() => {
        const cleanup = registerNavigationGuard(config.id, {
            isDirty: () => configRef.current.isDirty,
            onBlock: () => configRef.current.onBlock(),
        });

        return cleanup;
    }, [config.id]);

    useEffect(() => {
        if (!config.isDirty) return;

        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };

        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [config.isDirty]);
}
