import { ReviewsView } from "@/components/reviews/reviews-view";
import { PageHeader } from "@/components/ui/page-header";

export default function ReviewsPage() {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Weekly and monthly reviews, generated automatically from your closed trades."
      />
      <ReviewsView />
    </>
  );
}
