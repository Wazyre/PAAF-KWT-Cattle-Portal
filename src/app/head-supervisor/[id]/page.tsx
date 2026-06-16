// Head supervisor audit view: reuses AuditPageContent with the /head-supervisor back link and headSupervisorMode flag.
import AuditPageContent from "@/app/supervisor/[id]/AuditPageContent";

export const dynamic = "force-dynamic";

// Head supervisor audit route, reuses AuditPageContent with the head-supervisor back link and mode flag.
export default async function HeadAuditPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { saved?: string; animalType?: string };
}) {
  return (
    <AuditPageContent
      params={params}
      searchParams={searchParams}
      backHref="/head-supervisor"
      headSupervisorMode
    />
  );
}
