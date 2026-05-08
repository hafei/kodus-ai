"use client";

import { useMemo, useState } from "react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Heading } from "@components/ui/heading";
import { Page } from "@components/ui/page";
import { Skeleton } from "@components/ui/skeleton";
import { Switch } from "@components/ui/switch";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@components/ui/tabs";
import { toast } from "@components/ui/toaster/use-toast";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@components/ui/tooltip";
import { useAsyncAction } from "@hooks/use-async-action";
import { LockIcon, RotateCcwIcon, Save, Undo2 } from "lucide-react";
import {
    Controller,
    FormProvider,
    useFormContext,
    useForm,
    useWatch,
} from "react-hook-form";
import { cn } from "src/core/utils/components";

import {
    useEventCatalog,
    useRoutingRules,
    useUpsertRoutingRules,
} from "@services/notifications/hooks";
import type {
    EventCatalogEntry,
    EventCriticality,
    RoutingRule,
    UpsertRoutingRulePayload,
} from "@services/notifications/types";

type EventDef = EventCatalogEntry;
type Channel = (typeof CHANNELS)[number];
type Role = (typeof ROLES)[number]["value"];

const CHANNELS = ["email", "in_app"] as const;
const CHANNEL_LABELS: Record<Channel, string> = {
    email: "Email",
    in_app: "In-App",
};

const ROLES = [
    { value: "*", label: "All Roles" },
    { value: "owner", label: "Owner" },
    { value: "billing_manager", label: "Billing Manager" },
    { value: "repo_admin", label: "Repo Admin" },
    { value: "contributor", label: "Contributor" },
] as const;

const CRITICALITY_BADGE: Record<EventCriticality, { label: string; className: string }> =
    {
        system: {
            label: "System",
            className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
        },
        critical: {
            label: "Critical",
            className: "bg-red-500/15 text-red-400 border-red-500/30",
        },
        transactional: {
            label: "Transactional",
            className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        },
        informational: {
            label: "Informational",
            className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
        },
    };

const PRETTY_CATEGORY: Record<string, string> = {
    auth: "Auth",
    team: "Team",
    kody_rules: "Kody Rules",
    sso: "SSO",
    cockpit: "Cockpit",
};
const prettifyCategory = (category: string) =>
    PRETTY_CATEGORY[category] ??
    category
        .split("_")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");

const ROW_GRID = "grid grid-cols-[1fr_repeat(2,100px)] items-center gap-4 px-4 py-3";

type ChannelMap = Record<Channel, boolean>;
type EventMap = Record<string, ChannelMap>;
type FormValues = {
    rules: Record<string, EventMap>;
};

// Event names contain dots (e.g. "auth.email_confirmation"), which collide
// with react-hook-form's dot-notation field paths. Encode dots in form keys
// and decode them when sending payloads back to the server.
const toFormKey = (event: string) => event.replaceAll(".", "__");
const fromFormKey = (key: string) => key.replaceAll("__", ".");

const buildDefaults = (
    rules: RoutingRule[],
    configurableEvents: EventDef[],
): FormValues => {
    const byEvent: Record<string, Record<string, Record<string, boolean>>> = {};
    for (const rule of rules) {
        if (!byEvent[rule.event]) byEvent[rule.event] = {};
        byEvent[rule.event][rule.role] = rule.channels;
    }

    const result: FormValues = { rules: {} };
    for (const role of ROLES) {
        const roleEntry: EventMap = {};
        for (const ev of configurableEvents) {
            const eventRules = byEvent[ev.event] ?? {};
            // Lookup order:
            //   1. Role-specific stored rule
            //   2. Wildcard ('*') stored rule
            //   3. Catalog default (the same fallback the dispatcher uses
            //      at runtime when no rule exists).
            const source =
                eventRules[role.value] ??
                eventRules["*"] ??
                ev.defaultChannels;
            const channels = {} as ChannelMap;
            for (const ch of CHANNELS) {
                channels[ch] = source[ch] ?? false;
            }
            roleEntry[toFormKey(ev.event)] = channels;
        }
        result.rules[role.value] = roleEntry;
    }
    return result;
};

export default function NotificationsConfigPage() {
    const { data: rules, isLoading: rulesLoading } = useRoutingRules();
    const { data: catalog, isLoading: catalogLoading } = useEventCatalog();

    if (rulesLoading || catalogLoading || !rules || !catalog) {
        return <NotificationsSkeleton />;
    }

    return <NotificationsForm rules={rules} catalog={catalog} />;
}

function NotificationsSkeleton() {
    return (
        <Page.Root>
            <Page.Header>
                <Page.TitleContainer>
                    <Skeleton className="h-7 w-56" />
                    <Skeleton className="mt-2 h-4 w-80" />
                </Page.TitleContainer>
                <Page.HeaderActions>
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-10 w-32" />
                </Page.HeaderActions>
            </Page.Header>
            <Page.Content>
                <div className="flex flex-col gap-4">
                    <Skeleton className="h-10 w-full" />
                    <div className="bg-card-lv2 divide-y rounded-xl">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="flex items-center justify-between px-4 py-3">
                                <Skeleton className="h-4 w-48" />
                                <div className="flex gap-6">
                                    <Skeleton className="h-5 w-9 rounded-full" />
                                    <Skeleton className="h-5 w-9 rounded-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Page.Content>
        </Page.Root>
    );
}

function NotificationsForm({
    rules,
    catalog,
}: {
    rules: RoutingRule[];
    catalog: EventCatalogEntry[];
}) {
    const upsertMutation = useUpsertRoutingRules();
    const [selectedRole, setSelectedRole] = useState<Role>("*");

    const { configurableEvents, groupedEvents } = useMemo(() => {
        const configurableEvents: EventDef[] = [];
        for (const ev of catalog) {
            if (ev.criticality === "system") continue;
            configurableEvents.push(ev);
        }

        const groups = new Map<string, EventDef[]>();
        for (const ev of configurableEvents) {
            const list = groups.get(ev.category) ?? [];
            list.push(ev);
            groups.set(ev.category, list);
        }

        return {
            configurableEvents,
            groupedEvents: [...groups.entries()],
        };
    }, [catalog]);

    const defaults = useMemo(
        () => buildDefaults(rules, configurableEvents),
        [rules, configurableEvents],
    );

    // Set of "${role}|${event}" pairs that currently have an explicit DB row.
    // Used at save time to know whether matching-the-wildcard means "delete
    // the override row" (it exists) or "do nothing" (it never existed).
    const originalOverrides = useMemo(() => {
        const set = new Set<string>();
        for (const r of rules) {
            if (r.role !== "*") set.add(`${r.role}|${r.event}`);
        }
        return set;
    }, [rules]);

    const form = useForm<FormValues>({
        mode: "onChange",
        defaultValues: defaults,
    });

    const {
        handleSubmit,
        reset,
        formState: { isDirty, dirtyFields },
    } = form;

    const [saveSettings, { loading: isSaving }] = useAsyncAction(
        async (data: FormValues) => {
            try {
                const payload: UpsertRoutingRulePayload[] = [];
                const dirtyRules = dirtyFields.rules ?? {};

                for (const role of Object.keys(dirtyRules)) {
                    const dirtyEvents = dirtyRules[role] ?? {};
                    for (const key of Object.keys(dirtyEvents)) {
                        const event = fromFormKey(key);
                        const channels = data.rules[role][key];

                        if (role === "*") {
                            payload.push({ event, role, channels });
                            continue;
                        }

                        const wildcardChannels = data.rules["*"]?.[key];
                        const matchesWildcard =
                            wildcardChannels &&
                            CHANNELS.every(
                                (ch) => channels[ch] === wildcardChannels[ch],
                            );

                        if (matchesWildcard) {
                            // Override has been reverted to inherit from
                            // wildcard. Only emit a delete if the row
                            // actually exists on the server.
                            if (originalOverrides.has(`${role}|${event}`)) {
                                payload.push({
                                    event,
                                    role,
                                    channels,
                                    delete: true,
                                });
                            }
                            continue;
                        }

                        payload.push({ event, role, channels });
                    }
                }

                if (payload.length === 0) {
                    reset(data);
                    return;
                }

                await upsertMutation.mutateAsync(payload);
                reset(data);

                toast({
                    description: "Notification settings saved",
                    variant: "success",
                });
            } catch (error: any) {
                toast({
                    title: "Error",
                    description: error.message,
                    variant: "danger",
                });
            }
        },
    );

    return (
        <Page.Root>
            <FormProvider {...form}>
                <form onSubmit={handleSubmit(saveSettings)}>
                    <Page.Header>
                        <Page.TitleContainer>
                            <Page.Title>Notification settings</Page.Title>
                            <Page.Description>
                                Configure which notification channels are
                                active for each event and role.
                            </Page.Description>
                        </Page.TitleContainer>
                        <Page.HeaderActions>
                            <Button
                                type="button"
                                size="md"
                                variant="secondary"
                                leftIcon={<RotateCcwIcon />}
                                onClick={() => reset()}
                                disabled={!isDirty || isSaving}>
                                Reset changes
                            </Button>
                            <Button
                                type="submit"
                                size="md"
                                variant="primary"
                                leftIcon={<Save />}
                                disabled={!isDirty || isSaving}
                                loading={isSaving}>
                                Save settings
                            </Button>
                        </Page.HeaderActions>
                    </Page.Header>

                    <Page.Content className="mt-4">
                        <Tabs
                            value={selectedRole}
                            onValueChange={(v) => setSelectedRole(v as Role)}>
                            <TabsList>
                                {ROLES.map((role) => (
                                    <TabsTrigger
                                        key={role.value}
                                        value={role.value}
                                        type="button">
                                        {role.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            {ROLES.map((role) => (
                                <TabsContent
                                    key={role.value}
                                    value={role.value}>
                                    <RolePanel
                                        role={role.value}
                                        groupedEvents={groupedEvents}
                                    />
                                </TabsContent>
                            ))}
                        </Tabs>
                    </Page.Content>
                </form>
            </FormProvider>
        </Page.Root>
    );
}

function RolePanel({
    role,
    groupedEvents,
}: {
    role: Role;
    groupedEvents: Array<[string, EventDef[]]>;
}) {
    return (
        <div className="mt-4 flex flex-col gap-6">
            {groupedEvents.map(([category, events]) => (
                <CategorySection
                    key={category}
                    role={role}
                    category={category}
                    events={events}
                />
            ))}
        </div>
    );
}

function CategorySection({
    role,
    category,
    events,
}: {
    role: Role;
    category: string;
    events: EventDef[];
}) {
    return (
        <section className="flex flex-col gap-3">
            <Heading variant="h3">{prettifyCategory(category)}</Heading>

            <div className="bg-card-lv2 divide-y rounded-xl">
                <CategoryHeaderRow />
                {events.map((ev) => (
                    <EventRow key={ev.event} role={role} event={ev} />
                ))}
            </div>
        </section>
    );
}

function CategoryHeaderRow() {
    return (
        <div className={ROW_GRID}>
            <span className="text-text-tertiary text-xs font-medium">
                Event
            </span>
            {CHANNELS.map((ch) => (
                <span
                    key={ch}
                    className="text-text-tertiary text-center text-xs font-medium">
                    {CHANNEL_LABELS[ch]}
                </span>
            ))}
        </div>
    );
}

function EventRow({ role, event }: { role: Role; event: EventDef }) {
    const badge = CRITICALITY_BADGE[event.criticality];
    const isCritical = event.criticality === "critical";

    return (
        <div className={ROW_GRID}>
            <div className="flex items-center gap-2">
                <span className="text-text-primary text-pretty text-sm">
                    {event.label}
                </span>
                <span
                    className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        badge.className,
                    )}>
                    {badge.label}
                </span>
                <OverrideIndicator role={role} event={event} />
            </div>

            {CHANNELS.map((ch) => (
                <div key={ch} className="flex justify-center">
                    {isCritical ? (
                        <LockedChannelIndicator />
                    ) : (
                        <ChannelToggle
                            role={role}
                            event={event}
                            channel={ch}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

function LockedChannelIndicator() {
    return (
        <div className="text-text-tertiary flex items-center gap-1 text-xs">
            <LockIcon className="size-3" />
            <span>On</span>
        </div>
    );
}

function OverrideIndicator({ role, event }: { role: Role; event: EventDef }) {
    const form = useFormContext<FormValues>();
    const eventKey = toFormKey(event.event);

    const wildcardChannels = useWatch({
        control: form.control,
        name: `rules.*.${eventKey}`,
    }) as ChannelMap | undefined;

    const roleChannels = useWatch({
        control: form.control,
        name: `rules.${role}.${eventKey}`,
    }) as ChannelMap | undefined;

    if (role === "*" || !wildcardChannels || !roleChannels) return null;

    const isOverridden = CHANNELS.some(
        (ch) => roleChannels[ch] !== wildcardChannels[ch],
    );
    if (!isOverridden) return null;

    const handleRevert = () => {
        form.setValue(`rules.${role}.${eventKey}`, wildcardChannels, {
            shouldDirty: true,
        });
    };

    return (
        <div className="flex items-center gap-1.5">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Badge className="cursor-default px-1.5 py-0.5 text-xs">
                        Overridden
                    </Badge>
                </TooltipTrigger>
                <TooltipContent>
                    <p>This overrides the All Roles config.</p>
                </TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={handleRevert}
                        aria-label={`Revert ${event.label} to All Roles config`}
                        className="text-text-tertiary hover:text-text-primary transition-colors duration-150 ease-out">
                        <Undo2 className="size-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Revert to All Roles config</p>
                </TooltipContent>
            </Tooltip>
        </div>
    );
}

function ChannelToggle({
    role,
    event,
    channel,
}: {
    role: Role;
    event: EventDef;
    channel: Channel;
}) {
    return (
        <Controller<FormValues>
            name={`rules.${role}.${toFormKey(event.event)}.${channel}`}
            render={({ field }) => (
                <Switch
                    size="sm"
                    aria-label={`${CHANNEL_LABELS[channel]} for ${event.label}`}
                    checked={field.value as unknown as boolean}
                    onCheckedChange={field.onChange}
                />
            )}
        />
    );
}
