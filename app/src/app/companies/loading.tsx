import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function CompaniesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      <Skeleton className="h-10 w-full" />

      <div className="grid gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4">
                <Skeleton className="size-10 rounded-md" />
                <div>
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-1.5 h-3 w-28" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-1.5 h-6 w-8" />
                </div>
                <div className="text-right">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-1.5 h-6 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
