"use client";

import { Fragment, useCallback, useState } from "react";
import { Button } from "@components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@components/ui/sheet";
import { Spinner } from "@components/ui/spinner";
import {
    useMarkAllNotificationsRead,
    useMarkNotificationRead,
    useNotifications,
} from "@services/notifications/hooks";
import type { UserNotification } from "@services/notifications/types";
import {
    BellIcon,
    CheckCheck,
    ExternalLinkIcon,
    InfoIcon,
    ShieldAlertIcon,
    ZapIcon,
} from "lucide-react";
import { cn } from "src/core/utils/components";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
    auth: ShieldAlertIcon,
    team: ZapIcon,
    kody_rules: BellIcon,
    sso: ShieldAlertIcon,
    cockpit: InfoIcon,
};

const CRITICALITY_STYLES: Record<string, string> = {
    critical: "border-l-red-500",
    transactional: "border-l-amber-500",
    informational: "border-l-blue-500",
};

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
}

interface NotificationDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const NotificationDrawer = ({
    open,
    onOpenChange,
}: NotificationDrawerProps) => {
    const [page, setPage] = useState(1);
    const { data, isLoading } = useNotifications(page, 20);
    const markRead = useMarkNotificationRead();
    const markAllRead = useMarkAllNotificationsRead();

    const handleNotificationClick = useCallback(
        (notification: UserNotification) => {
            if (!notification.readAt) {
                markRead.mutate(notification.uuid);
            }
            if (notification.delivery.ctaUrl) {
                window.location.href = notification.delivery.ctaUrl;
                onOpenChange(false);
            }
        },
        [markRead, onOpenChange],
    );

    const notifications = data?.data ?? [];
    const total = data?.total ?? 0;
    const hasMore = page * 20 < total;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="bg-card-lv1 border-primary-dark flex w-full max-w-md flex-col border-l p-0">
                <SheetHeader className="border-primary-dark flex flex-row items-center justify-between border-b px-6 py-4">
                    <SheetTitle className="text-base font-semibold text-white">
                        Notifications
                    </SheetTitle>
                    {notifications.length > 0 && (
                        <Button
                            size="sm"
                            variant="secondary"
                            className="text-text-tertiary text-xs hover:text-white"
                            leftIcon={<CheckCheck className="size-3.5" />}
                            onClick={() => markAllRead.mutate()}
                            disabled={markAllRead.isPending}>
                            Mark all as read
                        </Button>
                    )}
                </SheetHeader>

                <div className="flex-1 overflow-y-auto">
                    {isLoading && (
                        <div className="flex items-center justify-center py-12">
                            <Spinner className="size-6" />
                        </div>
                    )}

                    {!isLoading && notifications.length === 0 && (
                        <div className="text-text-tertiary flex flex-col items-center justify-center gap-2 py-16">
                            <BellIcon className="size-10 opacity-30" />
                            <p className="text-sm">No notifications yet</p>
                        </div>
                    )}

                    {!isLoading &&
                        notifications.map((n) => {
                            const Icon =
                                CATEGORY_ICONS[n.delivery.category] ?? BellIcon;
                            const critStyle =
                                CRITICALITY_STYLES[n.delivery.criticality] ??
                                "border-l-transparent";

                            return (
                                <button
                                    key={n.uuid}
                                    type="button"
                                    onClick={() => handleNotificationClick(n)}
                                    className={cn(
                                        "border-primary-dark group flex w-full items-start gap-3 border-b border-l-2 px-6 py-4 text-left transition-colors hover:bg-[#1a1a2e]",
                                        critStyle,
                                        !n.readAt && "bg-[#12122088]",
                                    )}>
                                    <div
                                        className={cn(
                                            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                                            !n.readAt
                                                ? "bg-primary-light/10 text-primary-light"
                                                : "bg-[#202032] text-[#cdcddf]",
                                        )}>
                                        <Icon className="size-4" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p
                                                className={cn(
                                                    "truncate text-sm",
                                                    !n.readAt
                                                        ? "font-semibold text-white"
                                                        : "text-text-secondary font-medium",
                                                )}>
                                                {n.delivery.title}
                                            </p>
                                            {!n.readAt && (
                                                <span className="bg-primary-light size-2 shrink-0 rounded-full" />
                                            )}
                                        </div>
                                        <p className="text-text-tertiary mt-0.5 line-clamp-2 text-xs">
                                            {n.delivery.body}
                                        </p>
                                        <p className="text-text-tertiary mt-1 text-[10px]">
                                            {formatRelativeTime(
                                                n.delivery.createdAt,
                                            )}
                                        </p>
                                    </div>

                                    {n.delivery.ctaUrl && (
                                        <ExternalLinkIcon className="text-text-tertiary mt-1 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                                    )}
                                </button>
                            );
                        })}

                    {hasMore && (
                        <div className="flex justify-center py-4">
                            <Button
                                size="sm"
                                variant="secondary"
                                className="text-text-tertiary text-xs"
                                onClick={() => setPage((p) => p + 1)}>
                                Load more
                            </Button>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};
