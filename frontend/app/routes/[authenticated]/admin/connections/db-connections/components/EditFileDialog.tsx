import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { FC } from "react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type FormValues = {
  name: string;
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretKey: string;
  endpointUrl: string;
};

type EditFileDialogProps = {
  item: any;
  disabled: boolean;
};

const EditFileDialog: FC<EditFileDialogProps> = ({ item, disabled }) => {
  const { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>();

  const { mutateAsync, isPending } = useApi("PATCH /api/file-storage/connections/update", {
    query: { connectionId: item.connectionId },
  });

  useEffect(() => {
    if (item && open) {
      reset({
        name: item.connectionName,
        bucketName: item.bucketOrContainerName,
        region: item.region,
        accessKeyId: item.accessKeyId,
        secretKey: item.secretKey,
        endpointUrl: item.endpointUrl,
      });
    }
  }, [item, open, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      await mutateAsync({
        query: { connectionId: item.connectionId },
        connectionName: data.name,
        bucketName: data.bucketName,
        region: data.region,
        accessKeyId: data.accessKeyId,
        secretKey: data.secretKey,
        endpointUrl: data.endpointUrl,
      });

      toast.success("Connection updated successfully");
      setOpen(false);
    } catch {
      toast.error("Failed to update connection");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* BUTTON */}
      <DialogTrigger requires="configure" disabled={disabled}>
        <Button size="icon-sm" variant="ghost" disabled={disabled}>
          <HugeiconsIcon icon={Edit02Icon} size={16} />
        </Button>
      </DialogTrigger>

      {/* DIALOG */}
      <DialogContent className="sm:max-w-lg rounded-2xl ">
        <DialogHeader className="p-2">
          <DialogTitle>Edit File Connection</DialogTitle>
        </DialogHeader>

        {/* FORM */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-2">
          <Input label="Connection Name" required placeholder="Name" {...register("name", { required: true })} />
          <Input label="Bucket Name" required placeholder="my-app-bucket" {...register("bucketName", { required: true })} />
          <Input label="Region" required placeholder="ap-south-1" {...register("region", { required: true })} />
          <Input label="Access Key ID" required placeholder="AKIA..." {...register("accessKeyId", { required: true })} />
          <Input
            type="password"
            label="Secret Access Key"
            placeholder="leave blank to keep same"
            {...register("secretKey")}
          />
          <Input
            label="Endpoint URL"
            placeholder="https://s3.amazonaws.com"
            {...register("endpointUrl")}
          />

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>

            <Button type="submit" disabled={isPending}>
              {isPending ? "Updating..." : "Update Connection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditFileDialog;
