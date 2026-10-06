import type { Metadata } from "next";
import { ReviewDetailView } from "@/components/reviews/review-detail-view";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage(props: PageProps<"/reviews/[id]">) {
  const { id } = await props.params;
  return <ReviewDetailView reviewId={id} />;
}
