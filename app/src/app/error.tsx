"use client";

import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <Card className="w-full max-w-md border-ecit-red/20">
        <CardContent className="flex flex-col items-center gap-4 pt-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-ecit-red/10">
            <AlertCircle className="size-6 text-ecit-red" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-navy">
              Something went wrong
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {error.message || "An unexpected error occurred"}
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-muted-foreground/60">
                Error ID: {error.digest}
              </p>
            )}
          </div>
          <button
            onClick={reset}
            className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-light"
          >
            Try Again
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
