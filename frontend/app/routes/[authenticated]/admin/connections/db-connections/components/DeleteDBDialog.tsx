// import { Button } from "@/components/ui/button";
// import { DialogDescription } from "@/components/ui/dialog";
// import { useDialog } from "@/hooks/useDialog";
// import { useApi } from "@/lib/useApi";
// import { Delete02Icon } from "@hugeicons/core-free-icons";
// import { HugeiconsIcon } from "@hugeicons/react";
// import type { FC } from "react";
// import { toast } from "sonner";

// type DeleteDBDialogProps = {
//   connectionId?: string;
//   disabled?: boolean;
// };

// const DeleteDBDialog: FC<DeleteDBDialogProps> = ({ connectionId, disabled }) => {
//   const { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

//   const { mutateAsync, isPending } = useApi("PATCH /api/db/connections/toggle", {
//     query: { connectionId },
//   });

//   const handleDelete = async () => {
//     try {
//       await mutateAsync(undefined);
//       toast.success("Database connection deleted successfully");
//       setOpen(false);
//     } catch {
//       toast.error("Failed to delete database connection");
//     }
//   };

//   return (
//     <Dialog open={open} onOpenChange={setOpen} modal>
//       <DialogTrigger disabled={disabled}>
//         <Button
//           size="icon-sm"
//           variant="ghost"
//           disabled={disabled}
//           className="text-muted-foreground hover:text-destructive">
//           <HugeiconsIcon icon={Delete02Icon} size={16} />
//         </Button>
//       </DialogTrigger>

//       <DialogContent className="sm:max-w-md rounded-2xl bg-card ring-1 ring-border/60 border-0 shadow-[0_18px_60px_-20px_rgba(0,0,0,0.35)]">
//         <DialogHeader>
//           <div className="flex items-start gap-3">
//             <div className="size-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
//               <HugeiconsIcon icon={Delete02Icon} size={20} />
//             </div>

//             <div>
//               <DialogTitle className="text-base font-semibold text-foreground">Delete Database Connection</DialogTitle>
//               <DialogDescription className="text-sm text-muted-foreground mt-1">
//                 This Database will be deleted permanently. Are you sure you want to proceed?
//               </DialogDescription>
//             </div>
//           </div>
//         </DialogHeader>

//         <DialogFooter className="gap-2 sm:justify-end">
//           <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
//             Cancel
//           </Button>

//           <Button type="button" variant="errorSoft" onClick={handleDelete} disabled={isPending}>
//             <HugeiconsIcon icon={Delete02Icon} size={16} />
//             {isPending ? "Deleting..." : "Delete Database Connection"}
//           </Button>
//         </DialogFooter>
//       </DialogContent>
//     </Dialog>
//   );
// };

// export default DeleteDBDialog;
