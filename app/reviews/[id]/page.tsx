import { ReviewDetailView } from "@/components/reviews/review-detail-view";

export default async function ReviewPage(props: PageProps<"/reviews/[id]">) {
  const { id } = await props.params;
  return <ReviewDetailView reviewId={id} />;
}
