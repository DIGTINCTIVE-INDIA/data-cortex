import InfiniteListWrapper from "@/components/layout/InfiniteListWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/contexts/AuthContext";
import { useApi } from "@/lib/useApi";
import type { UserRole } from "@/lib/useApi/types/authenticationApis.types";
import type { UserItem } from "@/lib/useApi/types/userManagementApis.types";
import { Cancel01Icon, PencilEdit02Icon, Tick02Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { roleLabels, roles } from "../constants";

const roleStyle: Record<string, string> = {
  admin: "bg-primary/10 text-primary",
  analyst: "bg-[var(--teal)]/10 text-[var(--teal)]",
  engineer: "bg-[var(--purple)]/10 text-[var(--purple)]",
};

export default function UserTable() {
  const {
    data,
    refetch,
    isInitialLoading,
    isInitialError,
    isInfiniteLoading,
    isInfiniteError,
    hasNextPage,
    hasPreviousPage,
    fetchNextPage,
  } = useApi("GET /api/user/list-users");
  const { mutateAsync, isPending } = useApi("POST /api/user/update-user");

  const { mutateAsync: toggleUser, isPending: isTogglePending } = useApi("PATCH /api/user/toggle-user");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const users = data?.data?.items || [];

  const updateRole = async (user: UserItem, role: UserRole) => {
    // Nothing to do if the role did not actually change.
    if (role === user.role) return;

    await mutateAsync(
      {
        role,
        fullName: user.fullName,
      },
      { query: { userId: user.id } }
    );
  };

  const startEdit = (user: UserItem) => {
    setEditingId(user.id);
    setEditName(user.fullName);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveName = async (user: UserItem) => {
    const nextName = editName.trim();

    if (!nextName || nextName === user.fullName) {
      cancelEdit();
      return;
    }

    await mutateAsync(
      {
        fullName: nextName,
        role: user.role,
      },
      { query: { userId: user.id } }
    );

    cancelEdit();
  };

  const handleToggleUser = async (userId: string) => {
    await toggleUser(undefined, {
      query: { userId },
    });
  };

  const currentUserId = useAuthStore(state => state.auth.session?.id);

  if (isInitialLoading) return <UserListSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <HugeiconsIcon icon={UserIcon} size={20} />
        </div>

        <div>
          <h3 className="text-base font-semibold text-foreground">Users</h3>
          <p className="text-xs text-muted-foreground">Manage users and their access roles</p>
        </div>
      </div>

      <InfiniteListWrapper
        isLoading={isInfiniteLoading}
        isError={isInfiniteError}
        hasNextPage={!!hasNextPage}
        onLoadMore={fetchNextPage}
        onRetry={refetch}>
        {users.map((user: UserItem) => {
          const isEditing = editingId === user.id;

          return (
            <div
              key={user.id}
              className={`flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-4 py-3 rounded-xl backdrop-blur transition-all
                ${user.enabled ? "bg-background/80 hover:bg-background" : "bg-background/50 opacity-60"}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <HugeiconsIcon icon={UserIcon} size={18} />
                </div>

                <div className="min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                        className="h-9"
                        onKeyDown={e => {
                          if (e.key === "Enter") saveName(user);
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />

                      <Button
                        type="button"
                        onClick={() => saveName(user)}
                        disabled={isPending}
                        className="size-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 flex items-center justify-center transition disabled:opacity-50">
                        <HugeiconsIcon icon={Tick02Icon} size={16} />
                      </Button>

                      <Button
                        type="button"
                        onClick={cancelEdit}
                        disabled={isPending}
                        className="size-8 rounded-lg bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition disabled:opacity-50">
                        <HugeiconsIcon icon={Cancel01Icon} size={16} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <div className="text-sm font-medium text-foreground truncate">{user.fullName}</div>

                      <Button
                        onlyAdmin
                        type="button"
                        onClick={() => startEdit(user)}
                        disabled={!user.enabled}
                        variant={"ghost"}
                        className="size-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition">
                        <HugeiconsIcon icon={PencilEdit02Icon} size={14} />
                      </Button>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{user.email}</div>
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-3">
                <span
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                    roleStyle[user.role] || "bg-muted text-muted-foreground"
                  }`}>
                  {user.role}
                </span>

                <div className="w-36">
                  {user.role === "service" ? (
                    // Fixed: there is no person behind it to hold another role.
                    <span className="inline-flex h-8 items-center rounded-lg bg-muted px-3 text-sm text-muted-foreground">
                      {roleLabels.service}
                    </span>
                  ) : (
                  <Select
                    disabled={!user.enabled}
                    value={user.role}
                    onValueChange={value => {
                      if (!value) return;
                      updateRole(user, value as UserRole);
                    }}>
                    <SelectTrigger onlyAdmin size="sm">
                      <SelectValue placeholder="Role">{roleLabels[user.role as UserRole]}</SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {roles.map(role => (
                        <SelectItem key={role} value={role}>
                          {roleLabels[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  )}
                </div>

                {/* <DeleteUserDialog userId={user.id} disabled={isPending} /> */}

                <div className="flex items-center gap-2">
                  {/* <span className={`text-xs font-medium ${user.enabled ? "text-green-600" : "text-muted-foreground"}`}>
                    {user.enabled ? "Active" : "Inactive"}
                  </span> */}

                  <Switch
                    onlyAdmin
                    checked={user.enabled}
                    disabled={isTogglePending || currentUserId === user.id}
                    onCheckedChange={() => handleToggleUser(user.id)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </InfiniteListWrapper>
      {/* )
        } */}
      {/* </div> */}
    </div>
  );
}

const UserListSkeleton = () => {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-muted animate-pulse" />
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          <div className="h-3 w-40 rounded bg-muted animate-pulse" />
        </div>
      </div>

      <div className="rounded-2xl bg-muted/30 p-2 space-y-2">
        {[1, 2, 3].map(item => (
          <div key={item} className="h-16 rounded-xl bg-background/80 animate-pulse" />
        ))}
      </div>
    </div>
  );
};
