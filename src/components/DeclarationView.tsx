import { gatheringPointLabel, animalTypeLabel } from "@/lib/constants";

interface FarmLocation {
  gatheringPoint: string;
  latitude: number;
  longitude: number;
  locationLink: string;
  chippedCount: number;
  males: number;
  females: number;
  numTenders: number;
}

interface AnimalGroup {
  animalType: string;
  locations: FarmLocation[];
}

export interface DeclarationData {
  id: number;
  name: string;
  civilId: string;
  mobile: string;
  createdAt: Date;
  animalGroups: AnimalGroup[];
}

export default function DeclarationView({
  decl
}: {
  decl: DeclarationData;
}) {
  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gov-dark">
          الإقرار الذاتي — معاملة رقم {decl.id}
        </h2>
        <span className="text-xs text-gray-500">
          {new Date(decl.createdAt).toLocaleString("ar-KW")}
        </span>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <Field label="الاسم" value={decl.name} />
        <Field label="الرقم المدني" value={decl.civilId} />
        <Field label="رقم الهاتف" value={decl.mobile} />
      </div>

      <div className="space-y-3">
        {decl.animalGroups.map((g, gi) => (
          <div
            key={gi}
            className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
          >
            <h3 className="font-bold text-gov-dark">
              {animalTypeLabel(g.animalType)}
            </h3>

            {g.locations.map((loc, li) => (
              <div key={li} className="space-y-2">
                {g.locations.length > 1 && (
                  <div className="text-sm font-semibold text-gray-600">
                    الموقع {li + 1}
                  </div>
                )}
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <Field
                    label="نقطة التجمّع"
                    value={gatheringPointLabel(loc.gatheringPoint)}
                  />
                  <Field
                    label="الإحداثيات"
                    value={`${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`}
                  />
                </div>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}#map=17/${loc.latitude}/${loc.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs font-semibold text-gov no-print"
                >
                  فتح الموقع على الخريطة ↗
                </a>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gov-light text-gov-dark">
                        <th className="border border-gray-300 px-2 py-1">
                          المُرقّمة
                        </th>
                        <th className="border border-gray-300 px-2 py-1">
                          الذكور
                        </th>
                        <th className="border border-gray-300 px-2 py-1">
                          الإناث
                        </th>
                        <th className="border border-gray-300 px-2 py-1">
                          العمال / الرعاة
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-center">
                        <td className="border border-gray-300 px-2 py-1">
                          {loc.chippedCount}
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          {loc.males}
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          {loc.females}
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          {loc.numTenders}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold text-gray-800">{value || "—"}</div>
    </div>
  );
}
