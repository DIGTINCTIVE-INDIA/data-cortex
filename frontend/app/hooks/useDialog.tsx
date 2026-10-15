import {
  Dialog as ShadDialog,
  DialogClose as ShadDialogClose,
  DialogContent as ShadDialogContent,
  DialogDescription as ShadDialogDescription,
  DialogFooter as ShadDialogFooter,
  DialogHeader as ShadDialogHeader,
  DialogTitle as ShadDialogTitle,
  DialogTrigger as ShadDialogTrigger,
} from "@/components/ui/dialog";
import { useCallback, useState } from "react";

export type UseDialogReturn<T extends string> = {
  Dialog: typeof ShadDialog;
  DialogTrigger: typeof ShadDialogTrigger;
  DialogContent: typeof ShadDialogContent;
  DialogHeader: typeof ShadDialogHeader;
  DialogTitle: typeof ShadDialogTitle;
  DialogFooter: typeof ShadDialogFooter;
  DialogDescription: typeof ShadDialogDescription;
  DialogClose: typeof ShadDialogClose;
  open: boolean;
  setOpen: (v: boolean) => void;

  dialogType: T | null;
  setDialogType: (type: T | null) => void;
};

export const useDialog = <T extends string>(initialType?: T): UseDialogReturn<T> => {
  const [open, setOpen] = useState(false);
  const [dialogType, setDialogType] = useState<T | null>(initialType ?? null);

  const setType = useCallback((type: T | null) => {
    setDialogType(type);
  }, []);

  return {
    Dialog: ShadDialog,
    DialogTrigger: ShadDialogTrigger,
    DialogContent: ShadDialogContent,
    DialogHeader: ShadDialogHeader,
    DialogTitle: ShadDialogTitle,
    DialogFooter: ShadDialogFooter,
    DialogDescription: ShadDialogDescription,
    DialogClose: ShadDialogClose,

    open,
    setOpen,
    dialogType,
    setDialogType: setType,
  };
}
