import AuditPageContent from "@/app/supervisor/[id]/AuditPageContent";

export const dynamic = "force-dynamic";

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
