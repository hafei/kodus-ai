import { useState, useRef, useEffect } from "react";
import { Button } from "@components/ui/button";
import { Checkbox } from "@components/ui/checkbox";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleIndicator,
    CollapsibleTrigger,
} from "@components/ui/collapsible";
import { Heading } from "@components/ui/heading";
import { ChevronDown } from "lucide-react";
import type {
    CodeReviewRepositoryConfig,
} from "src/app/(app)/settings/code-review/_types";
import type { LiteralUnion } from "src/core/types";
import { cn } from "src/core/utils/components";

export const SelectRepositoriesDropdown = ({
    repositories: _repositories,
    selectedDirectoriesIds,
    selectedRepositoriesIds,
    setSelectedDirectoriesIds,
    setSelectedRepositoriesIds,
    canEdit,
    global = true,
}: {
    selectedRepositoriesIds: string[];
    selectedDirectoriesIds: Array<{
        directoryId: string;
        repositoryId: string;
    }>;
    setSelectedRepositoriesIds: (s: typeof selectedRepositoriesIds) => void;
    setSelectedDirectoriesIds: (s: typeof selectedDirectoriesIds) => void;
    repositories: Array<CodeReviewRepositoryConfig>;
    canEdit: boolean;
    global?: boolean;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const repositories: Array<
        Omit<CodeReviewRepositoryConfig, "configs"> & {
            id: LiteralUnion<"global">;
        }
    > = global
        ? [{ id: "global", name: "Global", isSelected: true }].concat(
              _repositories,
          )
        : _repositories;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div className="relative" ref={containerRef}>
            <Button
                size="md"
                variant="primary"
                disabled={!canEdit}
                className="group rounded-l-none px-3"
                onClick={() => setIsOpen(!isOpen)}>
                <ChevronDown
                    className={cn(
                        "size-4 transition-transform",
                        isOpen && "rotate-180",
                    )}
                />
            </Button>

            {isOpen && (
                    <div
                        className="absolute z-50 w-72 rounded-xl border border-card-lv3 bg-card-lv2 shadow-md"
                        style={{ maxHeight: "300px", maxWidth: "270px", right: "-40px", overflow: "auto", bottom: "100%", marginBottom: "10px" }}>
                    <div className="px-5 py-4 border-b border-card-lv3">
                        <Heading variant="h3" className="mb-2">
                            Select repositories/directories
                        </Heading>
                    </div>

                    <div className="p-5">
                        {repositories
                            .filter((r) => r.isSelected || r.id === "global")
                            .map((r) => (
                                <div key={r.id}>
                                    <Collapsible
                                        className="flex-1"
                                        disabled={
                                            r.id === "global" || !r.directories?.length
                                        }>
                                        <div className="flex items-center gap-3">
                                            <div className="size-6">
                                                {r.isSelected && (
                                                    <Checkbox
                                                        className="size-full"
                                                        checked={selectedRepositoriesIds.includes(
                                                            r.id,
                                                        )}
                                                        onCheckedChange={(checked) => {
                                                            if (!checked) {
                                                                return setSelectedRepositoriesIds(
                                                                    selectedRepositoriesIds.filter(
                                                                        (id) =>
                                                                            id !==
                                                                            r.id,
                                                                    ),
                                                                );
                                                            }

                                                            setSelectedRepositoriesIds([
                                                                ...selectedRepositoriesIds,
                                                                r.id,
                                                            ]);
                                                        }}
                                                    />
                                                )}
                                            </div>

                                            <CollapsibleTrigger
                                                asChild
                                                className="flex-1">
                                                <Button
                                                    active
                                                    size="sm"
                                                    variant="cancel"
                                                    data-disabled={undefined}
                                                    className={cn(
                                                        "flex-1 justify-start px-0",
                                                        r.id === "global" &&
                                                            "pointer-events-none",
                                                    )}
                                                    rightIcon={
                                                        r.id !== "global" &&
                                                        r.directories?.length && (
                                                            <CollapsibleIndicator />
                                                        )
                                                    }>
                                                    {r.name}
                                                </Button>
                                            </CollapsibleTrigger>
                                        </div>

                                        <CollapsibleContent className="mt-1 ml-2 flex flex-col justify-center gap-2 border-l pb-0 pl-3">
                                            {r.directories?.map((d) => (
                                                <div key={d.id} className="flex gap-3">
                                                    <Checkbox
                                                        checked={selectedDirectoriesIds.some(
                                                            (dId) =>
                                                                d.id ===
                                                                dId.directoryId,
                                                        )}
                                                        onCheckedChange={(checked) => {
                                                            if (!checked) {
                                                                return setSelectedDirectoriesIds(
                                                                    selectedDirectoriesIds.filter(
                                                                        ({
                                                                            directoryId,
                                                                        }) =>
                                                                            directoryId !==
                                                                            d.id,
                                                                    ),
                                                                );
                                                            }

                                                            setSelectedDirectoriesIds([
                                                                ...selectedDirectoriesIds,
                                                                {
                                                                    directoryId: d.id,
                                                                    repositoryId: r.id,
                                                                },
                                                            ]);
                                                        }}
                                                    />

                                                    <span>{d.path}</span>
                                                </div>
                                            ))}
                                        </CollapsibleContent>
                                    </Collapsible>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
};
