import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDangerous = false,
  showCancel = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {children && <div className="py-4">{children}</div>}

        <DialogFooter className="flex gap-2 sm:justify-end">
          {showCancel && (
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              {cancelText}
            </Button>
          )}
          <Button
            onClick={handleConfirm}
            variant={isDangerous ? "destructive" : "default"}
            disabled={isLoading}
          >
            {isLoading ? "..." : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
