import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/lib/useApi";
import { zodResolver } from "@hookform/resolvers/zod";
import { Add01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type z from "zod";
import { roleLabels, roles } from "../constants";
import { formSchema } from "../schema/user-management.schema";

const AddUserForm = () => {
  const { mutateAsync, isPending } = useApi("POST /api/user/add-user");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      fullName: "",
      email: "",
      role: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    toast.info("Creating user...");

    try {
      await mutateAsync(data);
      toast.success("User created successfully");
      form.reset();
    } catch {
      toast.error("Failed to create user");
    }
  };
  return (
    <div className="rounded-3xl bg-muted p-2">
      <div className="rounded-2xl bg-background shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50">
          <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <HugeiconsIcon icon={UserIcon} size={18} />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground">Add New User</h2>
            <p className="text-xs text-muted-foreground">Invite a user and assign their role</p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Input
              onlyAdmin
              required
              label="Full Name"
              placeholder="John Doe"
              error={form.formState.errors.fullName?.message}
              {...form.register("fullName")}
            />

            <Input
              onlyAdmin
              required
              label="Email"
              type="email"
              placeholder="john@company.com"
              error={form.formState.errors.email?.message}
              {...form.register("email")}
            />

            <Controller
              name="role"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger onlyAdmin required label="Role" error={form.formState.errors.role?.message}>
                    <SelectValue placeholder="Select role">
                      {field.value ? roleLabels[field.value as keyof typeof roleLabels] : "Select role"}
                    </SelectValue>
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
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" onlyAdmin disabled={isPending || form.formState.isSubmitting}>
              <HugeiconsIcon icon={Add01Icon} size={18} />
              {isPending || form.formState.isSubmitting ? "Adding..." : "Add User"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddUserForm;
