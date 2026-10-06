import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" description="Daily P&L and trade counts. Click a day to see its trades." />
      <CalendarView />
    </>
  );
}
