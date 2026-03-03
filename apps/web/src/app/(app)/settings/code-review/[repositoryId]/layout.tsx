"use client";

import { useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSuspenseGetParameterByKey } from "@services/parameters/hooks";
import { LanguageValue, ParametersConfigKey } from "@services/parameters/types";
import { usePermission } from "@services/permissions/hooks";
import { Action, ResourceType } from "@services/permissions/types";
import { FormProvider, useForm } from "react-hook-form";
import { useSelectedTeamId } from "src/core/providers/selected-team-context";
import { useUnsavedChangesGuard } from "src/core/hooks/use-unsaved-changes-guard";

import { type CodeReviewFormType } from "../_types";
import { useCodeReviewConfig } from "../../_components/context";

export default function Layout(props: React.PropsWithChildren) {
    const { teamId } = useSelectedTeamId();
    const config = useCodeReviewConfig();
    const parameters = useSuspenseGetParameterByKey<LanguageValue>(
        ParametersConfigKey.LANGUAGE_CONFIG,
        teamId,
        {
            fallbackData: {
                uuid: "",
                configKey: "",
                configValue: LanguageValue.ENGLISH,
            },
        },
    );

    const params = useParams();
    const repositoryId = params.repositoryId as string;

    const canEdit = usePermission(
        Action.Update,
        ResourceType.CodeReviewSettings,
        repositoryId,
    );

    const form = useForm<CodeReviewFormType>({
        mode: "all",
        criteriaMode: "firstError",
        reValidateMode: "onChange",
        defaultValues: {
            ...config,
            language: parameters.configValue,
        },
        disabled: !canEdit,
    });

    useEffect(() => {
        form.reset({ ...config, language: parameters.configValue });
    }, [config?.id]);

    // Compute isDirty excluding v2PromptOverrides (Custom Prompts manages its own guard)
    const dirtyFields = form.formState.dirtyFields;
    const formIsDirty = (() => {
        const check = (
            obj: Record<string, any>,
            excludeKeys?: string[],
        ): boolean => {
            for (const key of Object.keys(obj)) {
                if (excludeKeys?.includes(key)) continue;
                const val = obj[key];
                if (typeof val === "object" && val !== null) {
                    if (check(val)) return true;
                } else if (val === true) {
                    return true;
                }
            }
            return false;
        };
        return check(
            dirtyFields as Record<string, any>,
            ["v2PromptOverrides"],
        );
    })();

    const scrollToDirtyField = useCallback(() => {
        const findFirstDirtyKey = (
            obj: Record<string, any>,
            prefix = "",
            excludeKeys?: string[],
        ): string | null => {
            for (const key of Object.keys(obj)) {
                if (excludeKeys?.includes(key)) continue;
                const path = prefix ? `${prefix}.${key}` : key;
                if (typeof obj[key] === "object" && obj[key] !== null) {
                    const found = findFirstDirtyKey(obj[key], path);
                    if (found) return found;
                } else if (obj[key] === true) {
                    return path;
                }
            }
            return null;
        };

        const dirtyKey = findFirstDirtyKey(
            form.formState.dirtyFields as Record<string, any>,
            "",
            ["v2PromptOverrides"],
        );

        if (dirtyKey) {
            // Try exact match first, then progressively shorter prefixes
            let el: Element | null = null;
            const segments = dirtyKey.split(".");
            for (let i = segments.length; i > 0 && !el; i--) {
                const prefix = segments.slice(0, i).join(".");
                el = document.querySelector(
                    `[data-field-name="${prefix}"]`,
                );
            }

            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add("field-highlight");
                setTimeout(() => el!.classList.remove("field-highlight"), 1800);

                // Also highlight active reset buttons inside the field
                el.querySelectorAll<HTMLElement>(
                    "[data-reset-button]:not(:disabled)",
                ).forEach((btn) => {
                    btn.classList.add("field-highlight");
                    setTimeout(
                        () => btn.classList.remove("field-highlight"),
                        1800,
                    );
                });

                return;
            }
        }

        // Fallback: scroll to top where Save/Reset buttons are
        const header = document.querySelector("[data-header-actions]");
        if (header) {
            header.scrollIntoView({ behavior: "smooth", block: "center" });
            header.classList.add("field-highlight");
            setTimeout(() => header.classList.remove("field-highlight"), 1800);
        } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }, [form]);

    useUnsavedChangesGuard({
        id: "code-review-settings",
        isDirty: formIsDirty,
        onBlock: scrollToDirtyField,
    });

    return <FormProvider {...form}>{props.children}</FormProvider>;
}
