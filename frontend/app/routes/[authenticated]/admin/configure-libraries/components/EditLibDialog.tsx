import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";
import type { LibraryItems } from "@/lib/useApi/types/librariesApis.types";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

type Props = {
  item: LibraryItems;
  initialName: string;
  initialDescription?: string | null;
  disabled: boolean;
};

const EditLibDialog = ({ item, initialName, initialDescription, disabled }: Props) => {
  const { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription || "");

  const { mutateAsync, isPending } = useApi("PATCH /api/libraries/qc-tags/update");

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription || "");
    }
  }, [open, initialName, initialDescription]);

  const onSave = async () => {
    if (!name.trim()) return;

    await mutateAsync(
      {
        title: name.trim(),
        description: description.trim(),
        type: item.tagType,
      },
      {
        query: {
          id: item.id,
        },
      }
    );

    setOpen(false);
  };

  const formattedType = item.tagType?.replaceAll("_", " ")?.replace(/\b\w/g, char => char.toUpperCase());

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger onlyAdmin disabled={disabled}>
          <Button onlyAdmin size="icon-sm" variant="ghost" disabled={disabled}>
            <HugeiconsIcon icon={Edit02Icon} size={16} />
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-lg rounded-2xl ">
          <DialogHeader className="p-2">
            <DialogTitle>Edit {formattedType}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 p-2">
            <Input label="Name" required value={name} onChange={e => setName(e.target.value)} />
            <Input label="Description" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>

            <Button type="submit" disabled={isPending} onClick={onSave}>
              {isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditLibDialog;
