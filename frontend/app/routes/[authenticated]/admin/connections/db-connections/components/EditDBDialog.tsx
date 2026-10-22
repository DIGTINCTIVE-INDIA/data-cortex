import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { FC } from "react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

type FormValues = {
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  schema: string;
  ssl: boolean;
  snowflakeAccount: string;
  snowflakeWarehouse: string;
  snowflakeRole: string;
  snowflakePrivateKey: string;
  snowflakePassphrase: string;
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
    control,
    formState: { errors },
  } = useForm<FormValues>();

  // The type is fixed once a connection exists: the fields below mean different things for
  // each, and this dialog used to send "postgres" whatever it was editing.
  const isSnowflake = item.databaseType === "snowflake";
  const isKeyPair = isSnowflake && item.secretType === "key_pair";
  const params = (item.additionalParams ?? {}) as Record<string, any>;

  const { mutateAsync, isPending } = useApi("PATCH /api/db/connections/update", {
    query: { connectionId: item.connectionId },
  });

  useEffect(() => {
    if (item && open) {
      reset({
        name: item.connectionName ?? "",
        host: item.host ?? "",
        port: item.port != null ? String(item.port) : "",
        database: item.databaseName ?? "",
        username: item.username ?? "",
        // The stored secret is never sent to the browser; blank means keep the current one.
        password: "",
        schema: item.dbSchema ?? "",
        ssl: Boolean(params.ssl),
        snowflakeAccount: params.account ?? item.host ?? "",
        snowflakeWarehouse: params.warehouse ?? "",
        snowflakeRole: params.role ?? "",
        snowflakePrivateKey: "",
        snowflakePassphrase: "",
      });
    }
  }, [item, open, reset]);

  const onSubmit = async (data: FormValues) => {
    const secret = isKeyPair ? data.snowflakePrivateKey.trim() : data.password;

    try {
      await mutateAsync({
        query: { connectionId: item.connectionId },
        connectionName: data.name,
        databaseType: item.databaseType,
        host: isSnowflake ? data.snowflakeAccount : data.host,
        port: isSnowflake ? 443 : Number(data.port),
        databaseName: data.database,
        username: data.username,
        dbSchema: data.schema,
        ...(secret ? { secret, secretType: isKeyPair ? ("key_pair" as const) : ("password" as const) } : {}),
        additionalParams: isSnowflake
          ? {
              account: data.snowflakeAccount,
              warehouse: data.snowflakeWarehouse,
              role: data.snowflakeRole || undefined,
              // Kept when left blank, so editing the warehouse does not drop the passphrase.
              privateKeyPassphrase: isKeyPair
                ? data.snowflakePassphrase || params.privateKeyPassphrase || undefined
                : undefined,
              auth_method: item.secretType,
            }
          : { ...params, ssl: data.ssl },
      } as never);

      toast.success("Connection updated successfully");
      setOpen(false);
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error("Failed to update connection", message ? { description: message, duration: 10000 } : undefined);
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl ">
        <DialogHeader className="p-2">
          <DialogTitle>Edit Database Connection</DialogTitle>
        </DialogHeader>

        {/* FORM */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-2">
          <Input required label="Connection Name" placeholder="Name" {...register("name", { required: true })} />

          {isSnowflake ? (
            <>
              <Input
                required
                label="Account"
                placeholder="org-account or account.region"
                {...register("snowflakeAccount", { required: true })}
              />
              <Input required label="Warehouse" placeholder="Warehouse" {...register("snowflakeWarehouse", { required: true })} />
              <Input required label="Database" placeholder="Database" {...register("database", { required: true })} />
              <Input required label="Schema" placeholder="Schema" {...register("schema", { required: true })} />
              <Input required label="Username" placeholder="Username" {...register("username", { required: true })} />
              {isKeyPair ? (
                <>
                  <Textarea
                    rows={6}
                    spellCheck={false}
                    label="Private Key"
                    className="font-mono text-xs"
                    placeholder="Leave blank to keep the current key"
                    {...register("snowflakePrivateKey")}
                  />
                  <Input
                    type="password"
                    label="Key Passphrase"
                    placeholder="Leave blank to keep the current one"
                    {...register("snowflakePassphrase")}
                  />
                </>
              ) : (
                <Input
                  type="password"
                  label="Password"
                  placeholder="Leave blank to keep the current password"
                  {...register("password")}
                />
              )}
              <Input label="Role" placeholder="SYSADMIN / ANALYST_ROLE" {...register("snowflakeRole")} />
            </>
          ) : (
            <>
              <Input required label="Host" placeholder="Host" {...register("host", { required: true })} />
              <Input required label="Port" placeholder="Port" {...register("port", { required: true })} />
              <Input required label="Database" placeholder="Database" {...register("database", { required: true })} />
              <Input required label="Username" placeholder="Username" {...register("username", { required: true })} />
              <Input
                type="password"
                label="Password"
                placeholder="Leave blank to keep the current password"
                {...register("password")}
              />
              <Input required label="Schema" placeholder="Schema" {...register("schema", { required: true })} />
              <Controller
                name="ssl"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
                    <label className="text-sm font-medium text-foreground">SSL Enabled</label>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </div>
                )}
              />
            </>
          )}

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
