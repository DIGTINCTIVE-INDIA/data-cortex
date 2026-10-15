"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import ENV from "@/config/env";
import { useApi } from "@/lib/useApi";
import type { CreatedApiKey, ServiceApiKey, ServiceUser } from "@/lib/useApi/types/serviceUsersApis.types";
import { cn } from "@/lib/utils";

import { Add01Icon, Copy01Icon, Delete02Icon, Key01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

type KeyState = "active" | "revoked" | "expired";

const keyState = (key: ServiceApiKey): KeyState => {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) return "expired";
  return "active";
};

/**
 * Service identities live on the same page as people now: both answer "who can
 * reach this system", and keeping them apart meant an admin had to know that a
 * service user was a user at all to go looking for it.
 *
 * What stays separate is the shape of a row. A person has an email and a role; a
 * service identity has neither, and has API keys instead -- so they are two tabs
 * rather than one mixed list with half its columns empty.
 */
export default function ServiceUsersPanel() {
  const { data, isLoading, isError } = useApi("GET /api/service-users");
  const serviceUsers = data?.data?.serviceUsers ?? [];

  const [creating, setCreating] = useState(false);
  const [addingKeyFor, setAddingKeyFor] = useState<ServiceUser | null>(null);
  const [revealed, setRevealed] = useState<CreatedApiKey | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={Key01Icon} size={20} />
          </div>

          <div>
            <h3 className="text-base font-semibold text-foreground">Service Users</h3>
            <p className="text-xs text-muted-foreground">
              Identities for other systems, such as Airflow. They sign in with an API key and can only start checks.
            </p>
          </div>
        </div>

        <Button onlyAdmin onClick={() => setCreating(true)} className="h-10 shrink-0 rounded-xl">
          <HugeiconsIcon icon={Add01Icon} size={16} />
          New Service User
        </Button>
      </div>

      <div className="rounded-3xl bg-muted/25 p-2">
        <div className="space-y-3 rounded-[22px] bg-card p-5 shadow-soft ring-1 ring-border/50">
          {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading service users...</p>}

          {isError && !isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Could not load service users.</p>
          )}

          {!isLoading && !isError && serviceUsers.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No service users yet. Create one to give Airflow, or another system, an API key.
            </p>
          )}

          {serviceUsers.map(serviceUser => (
            <ServiceUserCard
              key={serviceUser.id}
              serviceUser={serviceUser}
              onAddKey={() => setAddingKeyFor(serviceUser)}
            />
          ))}
        </div>
      </div>

      <CreateServiceUserDialog open={creating} onClose={() => setCreating(false)} onCreated={setRevealed} />

      <AddKeyDialog serviceUser={addingKeyFor} onClose={() => setAddingKeyFor(null)} onCreated={setRevealed} />

      <RevealKeyDialog created={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}

function ServiceUserCard({ serviceUser, onAddKey }: { serviceUser: ServiceUser; onAddKey: () => void }) {
  const { mutateAsync: toggle, isPending: toggling } = useApi("PATCH /api/user/toggle-user");
  const { mutateAsync: revoke, isPending: revoking } = useApi("DELETE /api/service-users/keys/:keyId");

  // The list this page reads is not the one toggle-user revalidates, so refetch by hand.
  const { refetch } = useApi("GET /api/service-users");

  const handleToggle = async () => {
    try {
      await toggle(undefined, { query: { userId: serviceUser.id } });
      await refetch();
      toast.success(serviceUser.enabled ? "Service user disabled. Its keys stop working now." : "Service user enabled");
    } catch (error) {
      toast.error(errorMessage(error, "Could not change the service user"));
    }
  };

  const handleRevoke = async (key: ServiceApiKey) => {
    try {
      await revoke(undefined, { params: { keyId: key.id } });
      toast.success(`Revoked "${key.name}"`);
    } catch (error) {
      toast.error(errorMessage(error, "Could not revoke the key"));
    }
  };

  return (
    <div className={cn("rounded-2xl border border-border/50 p-4", !serviceUser.enabled && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={Key01Icon} size={20} />
          </div>

          <div>
            <p className="font-semibold text-foreground">{serviceUser.fullName}</p>
            <p className="text-xs text-muted-foreground">Created {formatDate(serviceUser.createdAt)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {serviceUser.enabled ? "Enabled" : "Disabled"}
            <Switch onlyAdmin checked={serviceUser.enabled} disabled={toggling} onCheckedChange={handleToggle} />
          </label>

          <Button onlyAdmin variant="outline" size="sm" className="h-9 rounded-xl" onClick={onAddKey}>
            <HugeiconsIcon icon={Add01Icon} size={16} />
            Add Key
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">Key</th>
              <th className="py-2 pr-4 font-medium">Created</th>
              <th className="py-2 pr-4 font-medium">Last Used</th>
              <th className="py-2 pr-4 font-medium">Expires</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 text-right font-medium" />
            </tr>
          </thead>

          <tbody>
            {serviceUser.keys.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-muted-foreground">
                  No keys.
                </td>
              </tr>
            )}

            {serviceUser.keys.map(key => {
              const state = keyState(key);

              return (
                <tr key={key.id} className="border-t border-border/40">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-foreground">{key.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">dck_{key.keyPrefix}_••••••••</p>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{formatDate(key.createdAt)}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{key.expiresAt ? formatDate(key.expiresAt) : "Never"}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        state === "active" && "bg-success/10 text-success",
                        state === "revoked" && "bg-destructive/10 text-destructive",
                        state === "expired" && "bg-warning/10 text-warning"
                      )}>
                      {state}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    {state === "active" && (
                      <Button
                        onlyAdmin
                        variant="ghost"
                        size="sm"
                        disabled={revoking}
                        onClick={() => handleRevoke(key)}
                        className="h-8 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <HugeiconsIcon icon={Delete02Icon} size={16} />
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateServiceUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: CreatedApiKey) => void;
}) {
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const { mutateAsync, isPending } = useApi("POST /api/service-users");

  const submit = async () => {
    if (name.trim().length < 3) return toast.error("Name needs at least 3 characters");

    try {
      const result = await mutateAsync({
        name: name.trim(),
        ...(days.trim() ? { expiresInDays: Number(days) } : {}),
      });

      setName("");
      setDays("");
      onClose();

      if (result?.data?.key) onCreated(result.data.key);
    } catch (error) {
      toast.error(errorMessage(error, "Could not create the service user"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl border-border/50 bg-card">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">New Service User</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">It gets its first API key straight away.</p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <Input
            label="Name"
            required
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="airflow-production"
          />

          <Input
            label="Key expires after (days)"
            inputMode="numeric"
            value={days}
            onChange={event => setDays(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Leave empty for no expiry"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" className="h-10 rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending} className="h-10 rounded-xl">
            {isPending ? "Creating..." : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddKeyDialog({
  serviceUser,
  onClose,
  onCreated,
}: {
  serviceUser: ServiceUser | null;
  onClose: () => void;
  onCreated: (key: CreatedApiKey) => void;
}) {
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const { mutateAsync, isPending } = useApi("POST /api/service-users/:id/keys");

  const submit = async () => {
    if (!serviceUser) return;
    if (name.trim().length < 3) return toast.error("Name needs at least 3 characters");

    try {
      const result = await mutateAsync(
        { name: name.trim(), ...(days.trim() ? { expiresInDays: Number(days) } : {}) },
        { params: { id: serviceUser.id } }
      );

      setName("");
      setDays("");
      onClose();

      if (result?.data?.key) onCreated(result.data.key);
    } catch (error) {
      toast.error(errorMessage(error, "Could not create the key"));
    }
  };

  return (
    <Dialog open={Boolean(serviceUser)} onOpenChange={value => !value && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl border-border/50 bg-card">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">Add Key</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            For {serviceUser?.fullName}. To rotate: add the new key, switch the caller over, then revoke the old one.
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <Input
            label="Key name"
            required
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="rotated-2026-11"
          />

          <Input
            label="Expires after (days)"
            inputMode="numeric"
            value={days}
            onChange={event => setDays(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Leave empty for no expiry"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" className="h-10 rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending} className="h-10 rounded-xl">
            {isPending ? "Creating..." : "Create Key"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SnippetFormat = "curl" | "windows" | "powershell" | "python" | "airflow";

// Shells do not agree on line continuation or quoting, so one "curl" snippet cannot
// serve them all: a bash command pasted into Windows Command Prompt runs its first line
// alone (no key, so "access token missing") and then tries to execute the rest.
const SNIPPET_FORMATS: { value: SnippetFormat; label: string }[] = [
  { value: "curl", label: "cURL (bash)" },
  { value: "windows", label: "cURL (Windows)" },
  { value: "powershell", label: "PowerShell" },
  { value: "python", label: "Python" },
  { value: "airflow", label: "Airflow" },
];

/**
 * The key is written into the snippet rather than left as a placeholder: this
 * dialog is the one moment it exists in readable form, so a snippet you have to
 * hand-edit afterwards is a snippet you edit with the key already lost.
 */
const buildSnippet = (format: SnippetFormat, base: string, key: string) => {
  if (format === "curl") {
    return `curl -X POST ${base}/api/qc-configuration/run \\
  -H "x-api-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"configId": "DBC0001", "source": "db"}'`;
  }

  if (format === "windows") {
    // One line, double quotes with escaped inner quotes: the form Command Prompt and
    // PowerShell both accept. curl.exe, not curl -- PowerShell aliases plain curl to a
    // different command.
    return `curl.exe -X POST ${base}/api/qc-configuration/run -H "x-api-key: ${key}" -H "Content-Type: application/json" -d "{\\"configId\\": \\"DBC0001\\", \\"source\\": \\"db\\"}"`;
  }

  if (format === "powershell") {
    return `$body = @{ configId = "DBC0001"; source = "db" } | ConvertTo-Json

Invoke-RestMethod -Method Post \`
  -Uri "${base}/api/qc-configuration/run" \`
  -Headers @{ "x-api-key" = "${key}" } \`
  -ContentType "application/json" \`
  -Body $body`;
  }

  if (format === "python") {
    return `import requests

response = requests.post(
    "${base}/api/qc-configuration/run",
    headers={"x-api-key": "${key}"},
    json={"configId": "DBC0001", "source": "db"},
    timeout=30,
)
response.raise_for_status()
print(response.json()["data"]["runId"])`;
  }

  return `from airflow.decorators import task

# Better: keep the key in an Airflow Variable or Connection, not in the DAG file.
API_KEY = "${key}"


@task
def run_quality_check():
    import requests

    response = requests.post(
        "${base}/api/qc-configuration/run",
        headers={"x-api-key": API_KEY},
        json={"configId": "DBC0001", "source": "db"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["data"]["runId"]`;
};

/**
 * Copy, sitting inside the text it copies (top-right corner). Outside the box it needed its
 * own column, which is what kept pulling the two rows out of line with each other.
 */
function CopyChip({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-2 top-2 inline-flex h-7 items-center gap-1.5 rounded-lg bg-card px-2.5 text-xs font-medium text-foreground shadow-sm ring-1 ring-border/60 transition-colors hover:bg-background">
      <HugeiconsIcon icon={Copy01Icon} size={13} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * The one and only time a key is visible. It is not stored anywhere recoverable --
 * only its hash is -- so closing this loses it for good.
 */
function RevealKeyDialog({ created, onClose }: { created: CreatedApiKey | null; onClose: () => void }) {
  const [copied, setCopied] = useState<"key" | "snippet" | null>(null);
  const [format, setFormat] = useState<SnippetFormat>("curl");

  // The API is not necessarily on the same origin as this page -- in development
  // it certainly is not, and window.location.origin produced a snippet pointing
  // at the Vite dev server, which would never reach core-server.
  // Empty means the page talks to its own origin (the LAN mode, which proxies /api), so
  // that origin is the address a caller should use.
  const base = ENV.BACKEND_URL || (typeof window !== "undefined" ? window.location.origin : "https://your-datacortex-host");

  const copy = async (what: "key" | "snippet", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  };

  const snippet = created ? buildSnippet(format, base, created.key) : "";

  return (
    <Dialog open={Boolean(created)} onOpenChange={value => !value && onClose()}>
      <DialogContent className="w-[min(680px,calc(100vw-32px))] sm:max-w-none rounded-3xl border-border/50 bg-card">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">Copy this key now</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">It will not be shown again.</strong> If it is lost,
            create a new key and revoke this one.
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="relative">
            <code className="block break-all rounded-xl bg-muted py-3 pl-3 pr-24 font-mono text-xs text-foreground">
              {created?.key}
            </code>

            <CopyChip copied={copied === "key"} onClick={() => created && copy("key", created.key)} />
          </div>

          <div className="space-y-2">
            {/* Tabs scroll sideways instead of wrapping, so five of them never push the
                layout around. */}
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
              {SNIPPET_FORMATS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormat(option.value)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    format === option.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}>
                  {option.label}
                </button>
              ))}
            </div>

            {/* Same shape as the key row above: a box that grows, and a Copy button of the
                same size and style at its right edge, so both columns line up. */}
            <div className="relative">
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-muted py-3 pl-3 pr-24 font-mono text-xs text-foreground">
                {snippet}
              </pre>

              <CopyChip copied={copied === "snippet"} onClick={() => copy("snippet", snippet)} />
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              The key is already filled in. Replace <code className="font-mono">DBC0001</code> with the check you want
              to run. This key can start checks and nothing else.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button className="h-10 rounded-xl" onClick={onClose}>
            I have copied it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
