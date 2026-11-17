import { redirect } from 'next/navigation';

// The manage console used to live here. It moved to /manage/[slug]; keep this
// route as a redirect so older links do not 404.
export default async function AdminRedirect({ params }) {
  const { slug } = await params;
  redirect(`/manage/${slug}`);
}
