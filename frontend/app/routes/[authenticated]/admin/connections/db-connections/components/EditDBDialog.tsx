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
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  schema: string;
};

type EditDBDialogProps = {
  item: any;
  disabled: boolean;
};

const EditDBDialog: FC<EditDBDialogProps> = ({ item, disabled }) => {
  const { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>();

  const { mutateAsync, isPending } = useApi("PATCH /api/db/connections/update", {
    query: { connectionId: item.connectionId },
  });

  useEffect(() => {
    if (item && open) {
      reset({
        name: item.connectionName,
        host: item.host,
        port: String(item.port),
        database: item.databaseName,
        username: item.username,
        password: "", // don't prefill password usually
        schema: item.dbSchema,
      });
    }
  }, [item, open, reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      await mutateAsync({
        query: { connectionId: item.connectionId },
        connectionName: data.name,
        databaseType: "postgres",
        host: data.host,
        port: Number(data.port),
        databaseName: data.database,
        username: data.username,
        ...(data.password ? { password: data.password } : {}),
        dbSchema: data.schema,
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
        <Button requires="configure" size="icon-sm" variant="ghost" disabled={disabled}>
          <HugeiconsIcon icon={Edit02Icon} size={16} />
        </Button>
      </DialogTrigger>

      {/* DIALOG */}
      <DialogContent className="sm:max-w-lg rounded-2xl ">
        <DialogHeader className="p-2">
          <DialogTitle>Edit Database Connection</DialogTitle>
        </DialogHeader>

        {/* FORM */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-2">
          <Input required label="Connection Name" placeholder="Name" {...register("name", { required: true })} />
          <Input required label="Host" placeholder="Host" {...register("host", { required: true })} />
          <Input required label="Port" placeholder="Port" {...register("port", { required: true })} />
          <Input required label="Database" placeholder="Database" {...register("database", { required: true })} />
          <Input required label="Username" placeholder="Username" {...register("username", { required: true })} />
          <Input
            type="password"
            label="Password"
            placeholder="Password (leave blank to keep same)"
            {...register("password")}
          />
          <Input required label="Schema" placeholder="Schema" {...register("schema", { required: true })} />

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

export default EditDBDialog;
