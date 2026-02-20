"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, ArrowRightLeft } from "lucide-react";
import { TransactionHistory } from "./transaction-history";

interface CompanyTabsProps {
  companyId: string;
  shareholdersContent: React.ReactNode;
}

export function CompanyTabs({ companyId, shareholdersContent }: CompanyTabsProps) {
  return (
    <Tabs defaultValue="shareholders">
      <TabsList>
        <TabsTrigger value="shareholders" className="gap-1.5">
          <Users className="size-3.5" />
          Aksjonærer
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-1.5">
          <ArrowRightLeft className="size-3.5" />
          Historikk
        </TabsTrigger>
      </TabsList>

      <TabsContent value="shareholders" className="mt-4">
        {shareholdersContent}
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        <TransactionHistory companyId={companyId} />
      </TabsContent>
    </Tabs>
  );
}
