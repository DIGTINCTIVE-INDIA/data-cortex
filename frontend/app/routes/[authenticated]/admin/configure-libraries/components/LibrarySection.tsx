"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { useApi } from "@/lib/useApi";

import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { IconSvgElement } from "@hugeicons/react";

import InfiniteListWrapper from "@/components/layout/InfiniteListWrapper";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import EditLibDialog from "./EditLibDialog";

type Props = {
  type: string;
  title: string;
  description: string;
  icon: IconSvgElement;
  iconClassName: string;
};

export default function LibrarySection({ type, title, description, icon, iconClassName }: Props) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

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
  } = useApi("GET /api/libraries/qc-tags/:type", {
    params: {
      type,
    },
  });

  const { mutateAsync: create, isPending: creating } = useApi("POST /api/libraries/qc-tags/create");
  const { mutateAsync: toggleItem, isPending: isTogglngPending } = useApi("PATCH /api/libraries/qc-tags/toggle");

  const items = data?.data?.items || [];
  const pagination = data?.data?.pagination;

  const onCreate = async () => {
    if (!name.trim()) return;

    await create({
      type,
      title: name.trim(),
      description: desc.trim(),
    });

    setName("");
    setDesc("");

    refetch();
  };

  const handleToggleItem = async (id: number) => {
    try {
      await toggleItem(undefined, {
        query: { id },
      });
    } catch (error) {
      // The server refuses to remove a label that checks or email rules still use, and
      // says which. Without this the click just appeared to do nothing.
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Could not update this item";

      toast.error(message, { duration: 10000 });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`}>
          <HugeiconsIcon icon={icon} size={20} />
        </div>

        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>

          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-muted/40 p-2">
        <div className="grid grid-cols-1 gap-4 rounded-xl bg-background/90 p-4 md:grid-cols-[1fr_1fr_auto]">
          <Input onlyAdmin required label={`${title} Name`} value={name} onChange={e => setName(e.target.value)} />

          <Input onlyAdmin label="Description" value={desc} onChange={e => setDesc(e.target.value)} />

          <Button onlyAdmin onClick={onCreate} disabled={creating || !name.trim()} className="">
            <HugeiconsIcon icon={Add01Icon} size={18} />

            {creating ? "Adding..." : "Add"}
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl bg-muted/30 p-2">
        <InfiniteListWrapper
          isLoading={isInfiniteLoading}
          isError={isInfiniteError}
          hasNextPage={!!hasNextPage}
          onLoadMore={fetchNextPage}
          onRetry={refetch}>
          {items.map(item => (
            <div
              key={item.id}
              className={`
                flex items-center justify-between gap-3 rounded-xl
                px-4 py-3 ring-1 ring-border/40
                transition-all duration-200 hover:bg-background
                ${!item.enabled ? "bg-muted/20" : "bg-background/80"}
              `}>
              <div
                className={`
                  min-w-0 transition-all duration-200
                  ${!item.enabled ? "opacity-40 grayscale" : ""}
                `}>
                <p
                  className={`
                    truncate text-sm font-medium text-foreground
                    ${!item.enabled ? "line-through" : ""}
                  `}>
                  {item.tagTitle}
                </p>

                {item.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <EditLibDialog
                  item={item}
                  initialName={item.tagTitle}
                  initialDescription={item.description}
                  disabled={!item.enabled}
                />

                <div className="flex items-center gap-2">
                  <Switch
                    onlyAdmin
                    checked={item.enabled}
                    disabled={isTogglngPending}
                    onCheckedChange={() => handleToggleItem(item.id)}
                  />
                </div>
              </div>
            </div>
          ))}
        </InfiniteListWrapper>
      </div>
    </div>
  );
}
