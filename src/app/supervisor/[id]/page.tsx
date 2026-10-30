// Supervisor audit page shell: delegates rendering to AuditPageContent with the /supervisor back link.
import AuditPageContent from "./AuditPageContent";

export const dynamic = "force-dynamic";

// Supervisor audit route, delegates rendering to the shared AuditPageContent.
export default async function AuditPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; animalType?: string }>;
}) {
  return (
    <AuditPageContent
      params={params}
      searchParams={searchParams}
      backHref="/supervisor"
    />
  );
}
