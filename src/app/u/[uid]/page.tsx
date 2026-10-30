import { notFound } from "next/navigation";
import { getUser } from "@/lib/server/users";
import { listIssuesByReporter } from "@/lib/server/issues";
import { ProfileView } from "@/components/profile-view";

export const dynamic = "force-dynamic";

export default async function PublicProfile({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  const profile = await getUser(uid);
  if (!profile) notFound();
  const reports = await listIssuesByReporter(uid);
  return <ProfileView profile={profile} reports={reports} />;
}
