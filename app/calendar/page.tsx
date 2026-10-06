import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/ui/page-header";

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" description="Daily P&L and trade counts. Click a day to see its trades." />
      <CalendarView />
    </>
  );
}
