"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface DeleteCompanyDialogProps {
  companyId: string;
  companyName: string;
  orgNumber: string;
}

export function DeleteCompanyDialog({
  companyId,
  companyName,
  orgNumber,
}: DeleteCompanyDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!reason.trim()) {
      setError("Du må oppgi en grunn for sletting");
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!res.ok) {
        let errorMsg = `Feil (${res.status})`;
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch {
          // Response was not JSON (e.g. HTML error page)
          const text = await res.text().catch(() => "");
          errorMsg = text ? `Serverfeil: ${text.slice(0, 200)}` : errorMsg;
        }
        throw new Error(errorMsg);
      }

      setOpen(false);
      router.push("/companies");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          Slett selskap
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Slett selskap</DialogTitle>
          <DialogDescription>
            Er du sikker på at du vil slette{" "}
            <span className="font-semibold text-foreground">{companyName}</span>{" "}
            ({orgNumber})? Alle aksjonærer, aksjeklasser, transaksjoner og
            snapshots knyttet til dette selskapet vil bli permanent slettet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="delete-reason">
            Grunn for sletting <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="delete-reason"
            placeholder="F.eks. feil import, selskapet er solgt ut av gruppen, duplikat..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            rows={3}
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isDeleting}
          >
            Avbryt
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || !reason.trim()}
          >
            {isDeleting ? "Sletter..." : "Slett permanent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
