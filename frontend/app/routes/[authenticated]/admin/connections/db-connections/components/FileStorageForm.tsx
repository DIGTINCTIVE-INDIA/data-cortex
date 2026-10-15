import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/lib/useApi";
import type { CreateFileConnectionMutationBody } from "@/lib/useApi/types/connectionApis.types";
import { Controller, useForm } from "react-hook-form";

type FormValues = {
  name: string;
  storageType: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  endpoint?: string;
};

export const FileStorageForm = () => {
  const {
    register,
    reset,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    mode: "onChange",
    defaultValues: {
      name: "",
      storageType: "s3",
      bucket: "",
      region: "",
      accessKey: "",
      secretKey: "",
      endpoint: "",
    },
  });

  const { isPending, mutateAsync } = useApi("POST /api/file-storage/connections/add");

  const onSubmit = async (data: FormValues) => {
    const payload = {
      accessKeyId: data.accessKey,
      bucketOrContainerName: data.bucket,
      connectionName: data.name,
      region: data.region,
      storageType: data.storageType as "s3",
      secretAccessKey: data.secretKey,
      endpointUrl: data.endpoint?.trim() ? data.endpoint.trim() : undefined,
    } satisfies CreateFileConnectionMutationBody;

    await mutateAsync(payload);
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Input
        label="Configuration Name"
        required
        placeholder="Production S3 Storage"
        error={errors.name?.message}
        {...register("name", {
          required: "Configuration name is required",
          minLength: { value: 3, message: "Minimum 3 characters required" },
        })}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Controller
          name="storageType"
          control={control}
          rules={{ required: "Storage type is required" }}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger required label="Storage Type" error={errors.storageType?.message}>
                <SelectValue placeholder="Select storage type">{field.value === "s3" && "AWS S3"}</SelectValue>
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="s3">AWS S3</SelectItem>
              </SelectContent>
            </Select>
          )}
        />

        <Input
          label="Bucket Name"
          required
          placeholder="my-app-bucket"
          error={errors.bucket?.message}
          {...register("bucket", {
            required: "Bucket name is required",
          })}
        />

        <Input
          label="Region"
          required
          placeholder="ap-south-1"
          error={errors.region?.message}
          {...register("region", {
            required: "Region is required",
          })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Input
          label="Access Key ID"
          required
          placeholder="AKIA..."
          error={errors.accessKey?.message}
          {...register("accessKey", {
            required: "Access key is required",
          })}
        />

        <Input
          label="Secret Access Key"
          required
          type="password"
          placeholder="••••••••"
          error={errors.secretKey?.message}
          {...register("secretKey", {
            required: "Secret key is required",
          })}
        />

        <Input
          label="Endpoint URL"
          placeholder="optional — leave blank for AWS S3"
          error={errors.endpoint?.message}
          {...register("endpoint")}
        />
      </div>

      <Button disabled={isPending} type="submit" className="w-full">
        {isPending ? "Saving..." : "Test & Save Configuration"}
      </Button>
    </form>
  );
};
