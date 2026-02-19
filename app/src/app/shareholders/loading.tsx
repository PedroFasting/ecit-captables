import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ShareholdersLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      <div className="flex items-center gap-3">
        <Skeleton className="h-10 flex-1" />
        <div className="flex gap-1">
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      <div className="grid gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-md" />
                <div>
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="mt-1 h-3 w-24" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Skeleton className="h-5 w-16 rounded-full" />
                <div className="text-right">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-1 h-5 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
