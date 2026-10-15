"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";

import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  Edit02Icon,
  Mail01Icon,
  Notification01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import type { NotificationRule, RuleCriticality } from "@/lib/useApi/types/notificationsApis.types";

const RULES_ENDPOINT = "GET /api/notifications/rules?page=1&limit=500" as const;

const criticalityOptions = ["High", "Medium", "Low"] as const;

type Criticality = (typeof criticalityOptions)[number];

/** The API stores criticality lowercase; the UI has always shown it capitalised. */
const toApiCriticality = (value: Criticality): RuleCriticality => value.toLowerCase() as RuleCriticality;

const toUiCriticality = (value: RuleCriticality): Criticality =>
  (value.charAt(0).toUpperCase() + value.slice(1)) as Criticality;

/** Same shape the backend uses for user emails -- deliberately permissive. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailNotificationsPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationRule | null>(null);
  const [deleting, setDeleting] = useState<NotificationRule | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: rulesData, isLoading, isError, refetch } = useApi(RULES_ENDPOINT);
  const { data: librariesData } = useApi("GET /api/libraries/qc-tags/all");

  const rules = rulesData?.data?.items ?? [];

  /**
   * Impacted downstreams are qc_tags rows, not a fixed list -- whatever an admin
   * adds under Configure Libraries has to show up here, and a rule stores ids.
   */
  const downstreamTags = useMemo(
    () => (librariesData?.data?.impactedDownstream ?? []).filter(tag => tag.enabled),
    [librariesData]
  );

  /**
   * Options for the edit dialog: every enabled tag, plus any retired tag the rule
   * being edited already uses. Without the second part a rule could keep a downstream
   * the dialog never shows, so it could be neither seen nor removed.
   */
  const dialogTags = useMemo(() => {
    const options = new Map<number, DownstreamTag>(downstreamTags.map(tag => [tag.id, tag]));

    for (const tag of editing?.impactedDownstreamDetails ?? []) {
      if (!options.has(tag.id)) options.set(tag.id, { id: tag.id, tagTitle: `${tag.title} (disabled)` });
    }

    return [...options.values()];
  }, [downstreamTags, editing]);

  const filteredConfigs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rules;

    return rules.filter(item => {
      const downstreamNames = item.impactedDownstreamDetails.map(tag => tag.title);

      return (
        item.name.toLowerCase().includes(q) ||
        item.ruleId.toLowerCase().includes(q) ||
        item.recipients.some(email => email.toLowerCase().includes(q)) ||
        downstreamNames.some(d => d.toLowerCase().includes(q)) ||
        item.criticality.some(c => c.toLowerCase().includes(q))
      );
    });
  }, [query, rules]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (rule: NotificationRule) => {
    setEditing(rule);
    setOpen(true);
  };

  return (
    <div className="min-h-full bg-background">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Configure & Manage Email Notifications
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure email distribution lists for QC check notifications
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setTestOpen(true)} className="h-10 rounded-xl">
              <HugeiconsIcon icon={Mail01Icon} size={16} />
              Send Test Email
            </Button>

            <Button
              onClick={openCreate}
              className="h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <HugeiconsIcon icon={Add01Icon} size={16} />
              Add Email Configuration
            </Button>
          </div>
        </div>

        <Panel className="p-5">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <SectionTitle
              icon={Mail01Icon}
              title="Email Configurations"
              description={`${filteredConfigs.length} notification rules configured`}
            />

            <div className="relative w-full md:max-w-sm">
              <HugeiconsIcon
                icon={Search01Icon}
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search configurations..."
                className="h-11 rounded-2xl bg-background pl-10"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/40 bg-background">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <TableHead>Configuration Name</TableHead>
                  <TableHead>Impacted Downstream</TableHead>
                  <TableHead>Criticality</TableHead>
                  <TableHead>Distribution List</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </tr>
              </thead>

              <tbody>
                {isLoading && <StateRow>Loading notification rules...</StateRow>}

                {isError && !isLoading && <StateRow>Could not load notification rules.</StateRow>}

                {!isLoading && !isError && filteredConfigs.length === 0 && (
                  <StateRow>
                    {rules.length === 0
                      ? "No notification rules yet. Add one to start alerting on failed checks."
                      : "No configurations match your search."}
                  </StateRow>
                )}

                {filteredConfigs.map(config => (
                  <tr key={config.ruleId} className="border-t border-border/40 hover:bg-muted/20">
                    <TableCell>
                      <div>
                        <p className="font-semibold">{config.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{config.ruleId}</p>
                      </div>
                    </TableCell>

                    <TableCell>
                      <ChipGroup
                        items={config.impactedDownstreamDetails.map(tag =>
                          tag.enabled ? tag.title : `${tag.title} (disabled)`
                        )}
                      />
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {config.criticality.map(item => (
                          <CriticalityBadge key={item} value={toUiCriticality(item)} />
                        ))}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex max-w-2xl flex-wrap gap-2">
                        {config.recipients.map(email => (
                          <Badge key={email}>{email}</Badge>
                        ))}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(config)}
                          aria-label={`Edit ${config.name}`}
                          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary">
                          <HugeiconsIcon icon={Edit02Icon} size={17} />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(config)}
                          aria-label={`Delete ${config.name}`}
                          className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <HugeiconsIcon icon={Delete02Icon} size={17} />
                        </Button>
                      </div>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <EmailConfigDialog
          key={editing?.ruleId ?? "create"}
          open={open}
          onOpenChange={setOpen}
          rule={editing}
          downstreamTags={dialogTags}
          onSaved={refetch}
        />

        <DeleteRuleDialog rule={deleting} onClose={() => setDeleting(null)} onDeleted={refetch} />

        <TestEmailDialog open={testOpen} onOpenChange={setTestOpen} />
      </div>
    </div>
  );
}

type DownstreamTag = { id: number; tagTitle: string };

function EmailConfigDialog({
  open,
  onOpenChange,
  rule,
  downstreamTags,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  rule: NotificationRule | null;
  downstreamTags: DownstreamTag[];
  onSaved: () => void;
}) {
  const isEdit = Boolean(rule);

  const [name, setName] = useState(rule?.name ?? "");
  const [selectedDownstream, setSelectedDownstream] = useState<number[]>(rule?.impactedDownstream ?? []);
  const [selectedCriticality, setSelectedCriticality] = useState<Criticality[]>(
    rule ? rule.criticality.map(toUiCriticality) : ["High"]
  );
  const [email, setEmail] = useState("");
  const [emails, setEmails] = useState<string[]>(rule?.recipients ?? []);

  const { mutateAsync: createRule, isPending: creating } = useApi("POST /api/notifications/rules");
  const { mutateAsync: updateRule, isPending: updating } = useApi("PATCH /api/notifications/rules");

  const saving = creating || updating;

  // Reopening the dialog for a different row must not keep the previous values.
  useEffect(() => {
    if (!open) return;

    setName(rule?.name ?? "");
    setSelectedDownstream(rule?.impactedDownstream ?? []);
    setSelectedCriticality(rule ? rule.criticality.map(toUiCriticality) : ["High"]);
    setEmails(rule?.recipients ?? []);
    setEmail("");
  }, [open, rule]);

  const toggleDownstream = (value: number) => {
    setSelectedDownstream(prev => (prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]));
  };

  const toggleCriticality = (value: Criticality) => {
    setSelectedCriticality(prev => (prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]));
  };

  const addEmail = () => {
    // Split on comma, semicolon or whitespace. Pasting "a@x.com, b@y.com" used
    // to create a single chip containing both addresses.
    const candidates = email
      .split(/[,;\s]+/)
      .map(value => value.trim())
      .filter(Boolean);

    if (candidates.length === 0) return;

    const valid = candidates.filter(value => EMAIL_PATTERN.test(value));
    const invalid = candidates.filter(value => !EMAIL_PATTERN.test(value));

    if (valid.length > 0) {
      setEmails(prev => {
        const next = [...prev];
        for (const value of valid) {
          if (!next.includes(value)) next.push(value);
        }
        return next;
      });
    }

    // Anything that did not look like an address stays in the box so it can be
    // corrected rather than silently dropped.
    setEmail(invalid.join(", "));
  };

  const handleSave = async () => {
    // Addresses still sitting in the input are committed on save, so a typed
    // address is not lost just because Add was never pressed.
    const pending = email
      .split(/[,;\s]+/)
      .map(value => value.trim())
      .filter(value => EMAIL_PATTERN.test(value));

    const recipients = [...emails];
    for (const value of pending) if (!recipients.includes(value)) recipients.push(value);

    if (!name.trim()) return toast.error("Configuration name is required");
    if (selectedDownstream.length === 0) return toast.error("Select at least one impacted downstream");
    if (selectedCriticality.length === 0) return toast.error("Select at least one criticality level");
    if (recipients.length === 0) return toast.error("Add at least one email address");

    const body = {
      name: name.trim(),
      impactedDownstreamIds: selectedDownstream,
      criticality: selectedCriticality.map(toApiCriticality),
      recipients,
    };

    try {
      if (isEdit && rule) {
        await updateRule(body, { query: { ruleId: rule.ruleId } });
        toast.success("Notification rule updated");
      } else {
        await createRule(body);
        toast.success("Notification rule created");
      }

      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Could not save the notification rule");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[min(920px,calc(100vw-32px))] sm:max-w-none",
          "overflow-hidden rounded-3xl border-border/50 bg-card p-0 shadow-2xl"
        )}>
        <DialogHeader className="border-b border-border/50 bg-gradient-to-r from-primary/8 via-card to-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HugeiconsIcon icon={Notification01Icon} size={22} />
            </div>

            <div>
              <DialogTitle className="text-xl font-semibold text-foreground">
                {isEdit ? "Edit Email Configuration" : "Add Email Configuration"}
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">Configure notification rules for QC check alerts</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 p-6">
          <Field label="Configuration Name" required>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter configuration name"
              className="h-11 rounded-2xl bg-background"
            />
          </Field>

          <Field label="Impacted Downstream" required>
            {downstreamTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No impacted downstreams defined yet. Add them under Configure Libraries first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {downstreamTags.map(item => {
                  const active = selectedDownstream.includes(item.id);

                  return (
                    <ChoiceChip key={item.id} active={active} onClick={() => toggleDownstream(item.id)}>
                      {item.tagTitle}
                    </ChoiceChip>
                  );
                })}
              </div>
            )}
          </Field>

          <Field label="Criticality" required hint="Select criticality levels for which emails should be sent">
            <div className="flex flex-wrap gap-2">
              {criticalityOptions.map(item => {
                const active = selectedCriticality.includes(item);

                return (
                  <ChoiceChip key={item} active={active} onClick={() => toggleCriticality(item)}>
                    {item}
                  </ChoiceChip>
                );
              })}
            </div>
          </Field>

          <Field label="Distribution List (DL)" required hint="Add multiple email addresses or distribution lists">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <HugeiconsIcon
                  icon={Mail01Icon}
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-primary"
                />
                <Input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => {
                    // Comma commits too, which is what people expect from a
                    // chip input and how most address fields behave.
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                  placeholder="Enter email address"
                  className="h-11 rounded-2xl bg-background pl-10"
                />
              </div>

              <Button
                type="button"
                onClick={addEmail}
                className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                <HugeiconsIcon icon={Add01Icon} size={16} />
                Add
              </Button>
            </div>

            {emails.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {emails.map(item => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                    {item}
                    <button
                      type="button"
                      aria-label={`Remove ${item}`}
                      title={`Remove ${item}`}
                      onClick={() => setEmails(prev => prev.filter(emailItem => emailItem !== item))}
                      className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                      <HugeiconsIcon icon={Cancel01Icon} size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>
        </div>

        <div className="flex justify-end gap-3 border-t border-border/50 bg-muted/20 p-6">
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRuleDialog({
  rule,
  onClose,
  onDeleted,
}: {
  rule: NotificationRule | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { mutateAsync: deleteRule, isPending } = useApi("DELETE /api/notifications/rules");

  const handleDelete = async () => {
    if (!rule) return;

    try {
      await deleteRule(undefined, { query: { ruleId: rule.ruleId } });
      toast.success("Notification rule deleted");
      onDeleted();
      onClose();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Could not delete the notification rule");
    }
  };

  return (
    <Dialog open={Boolean(rule)} onOpenChange={value => !value && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl border-border/50 bg-card">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <HugeiconsIcon icon={Delete02Icon} size={20} />
            </div>

            <div>
              <DialogTitle className="text-base font-semibold text-foreground">Delete Email Configuration</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {rule?.name} will be deleted permanently and will stop sending alerts. Are you sure?
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" className="h-10 rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={isPending}
            className="h-10 rounded-xl bg-destructive text-white hover:bg-destructive/90">
            {isPending ? "Deleting..." : "Delete Configuration"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Proves the SMTP settings work without waiting for a check to fail. */
function TestEmailDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const [to, setTo] = useState("");
  const { mutateAsync: sendTest, isPending } = useApi("POST /api/notifications/test-email");

  const handleSend = async () => {
    if (!EMAIL_PATTERN.test(to.trim())) return toast.error("Enter a valid email address");

    try {
      await sendTest({ to: to.trim() });
      toast.success(`Test email sent to ${to.trim()}`);
      onOpenChange(false);
      setTo("");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Could not send the test email");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl border-border/50 bg-card">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HugeiconsIcon icon={Mail01Icon} size={20} />
            </div>

            <div>
              <DialogTitle className="text-base font-semibold text-foreground">Send Test Email</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Sends one message using the SMTP settings on the server, so you can confirm delivery works.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="pt-2">
          <Input
            value={to}
            onChange={e => setTo(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Enter email address"
            className="h-11 rounded-2xl bg-background"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isPending}
            className="h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
            {isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StateRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-t border-border/40">
      <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-muted/25 p-2">
      <div className={cn("rounded-[22px] bg-card shadow-soft ring-1 ring-border/50", className)}>{children}</div>
    </div>
  );
}

function SectionTitle({ icon, title, description }: { icon: any; title: string; description?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <HugeiconsIcon icon={icon} size={20} />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ChoiceChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-primary/10 text-primary ring-1 ring-primary/30"
          : "bg-background text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
      )}>
      {children}
    </button>
  );
}

function ChipGroup({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(item => (
        <Badge key={item}>{item}</Badge>
      ))}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
      {children}
    </span>
  );
}

function CriticalityBadge({ value }: { value: Criticality }) {
  const className =
    value === "High"
      ? "bg-destructive/10 text-destructive"
      : value === "Medium"
        ? "bg-warning/10 text-warning"
        : "bg-muted text-muted-foreground";

  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", className)}>{value}</span>;
}

function TableHead({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 text-left font-semibold", className)}>{children}</th>;
}

function TableCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-4 text-foreground", className)}>{children}</td>;
}
