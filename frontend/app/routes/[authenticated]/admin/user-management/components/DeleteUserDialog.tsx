// import { Button } from "@/components/ui/button";
// import { DialogDescription } from "@/components/ui/dialog";
// import { useAuthStore } from "@/contexts/AuthContext";
// // import { useAuth } from "@/contexts/AuthContext";
// import { useDialog } from "@/hooks/useDialog";
// import { useApi } from "@/lib/useApi";
// import { Delete02Icon, UserIcon } from "@hugeicons/core-free-icons";
// import { HugeiconsIcon } from "@hugeicons/react";
// import type { FC } from "react";
// import { toast } from "sonner";

// type DeleteUserDialogProps = {
//   userId?: string;
//   disabled?: boolean;
// };

// const DeleteUserDialog: FC<DeleteUserDialogProps> = ({ userId, disabled }) => {
//   const { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

//   const currentUserId = useAuthStore(state => state.auth.session?.id);

//   const { mutateAsync, isPending } = useApi("PATCH /api/user/toggle-user", {
//     query: { userId },
//   });

//   const isSelf = currentUserId === userId;

//   const onDelete = async () => {
//     if (!userId || isSelf) return;

//     try {
//       await mutateAsync({ userId });
//       toast.success("User deleted successfully");
//       setOpen(false);
//     } catch {
//       toast.error("Failed to delete user");
//     }
//   };

//   return (
//     <Dialog open={open} onOpenChange={setOpen} modal>
//       <DialogTrigger disabled={isSelf || disabled}>
//         <Button
//           size="icon-sm"
//           variant="ghost"
//           disabled={isSelf || disabled}
//           className="text-muted-foreground hover:text-destructive">
//           <HugeiconsIcon icon={Delete02Icon} size={16} />
//         </Button>
//       </DialogTrigger>

//       <DialogContent className="sm:max-w-md rounded-2xl bg-card ring-1 ring-border/60 border-0 shadow-[0_18px_60px_-20px_rgba(0,0,0,0.35)]">
//         <DialogHeader>
//           <div className="flex items-start gap-3">
//             <div className="size-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
//               <HugeiconsIcon icon={UserIcon} size={20} />
//             </div>

//             <div>
//               <DialogTitle className="text-base font-semibold text-foreground">Delete User</DialogTitle>
//               <DialogDescription className="text-sm text-muted-foreground mt-1">
//                 This user will lose access immediately. This action cannot be undone.
//               </DialogDescription>
//             </div>
//           </div>
//         </DialogHeader>

//         <DialogFooter className="gap-2 sm:justify-end">
//           <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
//             Cancel
//           </Button>

//           <Button type="button" variant="errorSoft" onClick={onDelete} disabled={isPending}>
//             <HugeiconsIcon icon={Delete02Icon} size={16} />
//             {isPending ? "Deleting..." : "Delete User"}
//           </Button>
//         </DialogFooter>
//       </DialogContent>
//     </Dialog>
//   );
// };

// export default DeleteUserDialog;
