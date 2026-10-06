import { ChatView } from "@/components/ai/chat-view";
import { PageHeader } from "@/components/ui/page-header";

export default function AskPage() {
  return (
    <>
      <PageHeader title="Ask AI" description="Questions about your own journal. Optional — everything else works without it." />
      <ChatView />
    </>
  );
}
