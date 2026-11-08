// Sahel notifications: the message templates agreed with PAAF and the call that sends one to a person's Sahel app.
// Each message carries a button that opens the portal with a signed sign-in link (see entry-link.ts).
import { postJson } from "./http";

export type TemplateId = "register" | "confirmed" | "reminder" | "final-warning" | "field-visit";

/** Values that fill the [placeholders] of a message. */
export interface SahelParams {
  deadline?: string;
  contact?: string;
  date?: string;
  start?: string;
  end?: string;
  updatePeriod?: string;
}

interface Template {
  describe: string;
  needs: (keyof SahelParams)[];
  bodyAr: string;
  bodyEn: string;
  dataTableAr?: Record<string, string>;
  dataTableEn?: Record<string, string>;
  labelAr: string;
  labelEn: string;
}

const TEMPLATES: Record<TemplateId, Template> = {
  register: {
    describe: "Registration and self-declaration are required",
    needs: ["deadline", "contact"],
    bodyAr:
      "عزيزي المربي، تدعوكم الهيئة العامة لشؤون الزراعة والثروة السمكية إلى التسجيل في المنصة الإلكترونية واستكمال البيانات المطلوبة بدقة وتقديم الإقرار الذاتي بصحتها، وذلك في موعد أقصاه {deadline}. ويُعد استكمال التسجيل شرطاً للاستمرار في الاستفادة من برامج دعم الأعلاف. وفي حال عدم استكمال التسجيل خلال المهلة المحددة، فسيتم إيقاف صرف الدعم وفقاً للضوابط واللوائح والقرارات المعتمدة لدى الهيئة.",
    bodyEn:
      "Dear livestock breeder, the Public Authority for Agriculture Affairs and Fish Resources invites you to register on the electronic platform, complete the required information accurately, and submit the self-declaration no later than {deadline}. Completing registration is required to continue benefiting from animal feed support programs. Failure to register within the specified period may result in suspension of support.",
    dataTableAr: { "العنوان": "التسجيل وتقديم الإقرار الذاتي", "آخر موعد للتسجيل": "{deadline}", "قناة التواصل": "{contact}" },
    dataTableEn: { Title: "Registration and Self-Declaration", "Registration Deadline": "{deadline}", "Contact Channel": "{contact}" },
    labelAr: "التسجيل الآن",
    labelEn: "Register Now"
  },
  confirmed: {
    describe: "Registration completed (confirmation)",
    needs: [],
    bodyAr:
      "عزيزي المربي، نفيدكم باكتمال تسجيلكم في المنصة الإلكترونية واستلام البيانات والإقرار الذاتي المقدم من قبلكم بنجاح. تخضع البيانات للمراجعة والتحقق، وسيتم إشعاركم لاحقاً بموعد الزيارة الميدانية لمطابقة الأعداد الفعلية للأغنام والماعز مع البيانات المسجلة.",
    bodyEn:
      "Dear livestock breeder, your registration on the electronic platform has been completed successfully, and your information and self-declaration have been received. The submitted information is subject to review and verification. You will be notified later of the field-visit appointment.",
    dataTableAr: {
      "العنوان": "تأكيد اكتمال التسجيل",
      "حالة التسجيل": "مكتمل",
      "حالة الإقرار الذاتي": "تم الاستلام",
      "المرحلة التالية": "مراجعة البيانات وتحديد موعد الزيارة"
    },
    dataTableEn: {
      Title: "Registration Confirmation",
      "Registration Status": "Completed",
      "Self-Declaration Status": "Received",
      "Next Step": "Review and field-visit scheduling"
    },
    labelAr: "عرض التسجيل",
    labelEn: "View Registration"
  },
  reminder: {
    describe: "Reminder: not registered yet",
    needs: ["deadline", "contact"],
    bodyAr:
      "عزيزي المربي، تشير سجلات الهيئة العامة لشؤون الزراعة والثروة السمكية إلى عدم تسجيلكم في المنصة الإلكترونية حتى تاريخه. يرجى استكمال التسجيل في موعد أقصاه {deadline}. إذا كنتم قد أتممتم التسجيل قبل استلام هذا الإشعار، فيرجى تجاهل الرسالة.",
    bodyEn:
      "Dear livestock breeder, the Authority's records indicate that you have not yet registered on the electronic platform. Please complete your registration no later than {deadline}. If you completed registration before receiving this notification, please disregard this message.",
    dataTableAr: {
      "العنوان": "تذكير باستكمال التسجيل",
      "حالة التسجيل": "غير مكتمل",
      "آخر موعد للتسجيل": "{deadline}",
      "قناة التواصل": "{contact}"
    },
    dataTableEn: {
      Title: "Registration Reminder",
      "Registration Status": "Incomplete",
      "Registration Deadline": "{deadline}",
      "Contact Channel": "{contact}"
    },
    labelAr: "استكمال التسجيل",
    labelEn: "Complete Registration"
  },
  "final-warning": {
    describe: "Final warning before support is suspended",
    needs: ["deadline", "contact"],
    bodyAr:
      "عزيزي المربي، هذا إنذار نهائي لعدم تسجيلكم في المنصة الإلكترونية رغم الإشعارات السابقة. يرجى استكمال التسجيل في موعد أقصاه {deadline}. وفي حال عدم استكمال التسجيل خلال المهلة المحددة، فسيتم إيقاف صرف الدعم وفقاً للضوابط واللوائح والقرارات المعتمدة لدى الهيئة. إذا كنتم قد أتممتم التسجيل قبل استلام هذا الإشعار، فيرجى تجاهل الرسالة.",
    bodyEn:
      "Dear livestock breeder, this is a final warning because your registration on the electronic platform has not been completed despite previous notifications. Please complete registration no later than {deadline}. Failure to register within the specified period will result in suspension of support in accordance with the applicable regulations. If you have already registered, please disregard this message.",
    dataTableAr: {
      "العنوان": "إنذار نهائي قبل تعليق الدعم",
      "حالة التسجيل": "غير مكتمل",
      "الإجراء المطلوب": "استكمال التسجيل فوراً",
      "آخر موعد للتسجيل": "{deadline}",
      "قناة التواصل": "{contact}"
    },
    dataTableEn: {
      Title: "Final Warning Before Support Suspension",
      "Registration Status": "Incomplete",
      "Required Action": "Complete registration immediately",
      "Registration Deadline": "{deadline}",
      "Contact Channel": "{contact}"
    },
    labelAr: "سجل الآن",
    labelEn: "Register Now"
  },
  "field-visit": {
    describe: "Field visit appointment",
    needs: ["date", "start", "end", "updatePeriod", "contact"],
    bodyAr:
      "عزيزي المربي، تم تحديد موعد الزيارة الميدانية للتحقق من الأعداد الفعلية للأغنام والماعز ومطابقتها مع البيانات المسجلة في المنصة الإلكترونية، وذلك يوم {date} من الساعة {start} إلى الساعة {end}. يرجى حضور المربي أو من يمثله وتجهيز الموقع وتمكين الفريق المختص من تنفيذ أعمال الحصر. يمكنكم تحديث البيانات خلال مدة {updatePeriod} من تاريخ استلام هذا الإشعار.",
    bodyEn:
      "Dear livestock breeder, a field visit has been scheduled to verify the actual numbers of sheep and goats against the information registered on the electronic platform. The visit will take place on {date}, from {start} to {end}. The breeder or an authorized representative must be present and allow the inspection team to complete the counting process. Information may be updated within {updatePeriod}.",
    dataTableAr: {
      "العنوان": "موعد الزيارة الميدانية",
      "اليوم والتاريخ": "{date}",
      "وقت البداية": "{start}",
      "وقت النهاية": "{end}",
      "مدة تحديث البيانات": "{updatePeriod}",
      "قناة التواصل": "{contact}"
    },
    dataTableEn: {
      Title: "Field Visit Appointment",
      "Day and Date": "{date}",
      "Start Time": "{start}",
      "End Time": "{end}",
      "Information Update Period": "{updatePeriod}",
      "Contact Channel": "{contact}"
    },
    labelAr: "تحديث البيانات",
    labelEn: "Update Information"
  }
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

export function describeTemplate(id: TemplateId): { describe: string; needs: (keyof SahelParams)[] } {
  return { describe: TEMPLATES[id].describe, needs: TEMPLATES[id].needs };
}

const fill = (text: string, params: SahelParams): string => text.replace(/\{(\w+)\}/g, (_, key: string) => params[key as keyof SahelParams] ?? `{${key}}`);
const fillAll = (table: Record<string, string> | undefined, params: SahelParams) =>
  table && Object.fromEntries(Object.entries(table).map(([k, v]) => [k, fill(v, params)]));

/** The values the message still needs, given the ones supplied. */
export function missingParams(id: TemplateId, params: SahelParams): (keyof SahelParams)[] {
  return TEMPLATES[id].needs.filter((key) => !params[key]?.trim());
}

export function buildPayload(id: TemplateId, civilId: string, link: string, params: SahelParams) {
  const t = TEMPLATES[id];
  return {
    subscriberCivilId: civilId,
    bodyAr: fill(t.bodyAr, params),
    bodyEn: fill(t.bodyEn, params),
    ...(t.dataTableAr && { dataTableAr: fillAll(t.dataTableAr, params) }),
    ...(t.dataTableEn && { dataTableEn: fillAll(t.dataTableEn, params) }),
    isForSubscriber: true,
    notificationType: "livestock",
    actionButtonRequestList: [{ actionType: "link", actionUrl: link, viewBag: "", labelAr: t.labelAr, labelEn: t.labelEn }]
  };
}

export interface SendResult {
  ok: boolean;
  status: number;
  detail: string;
}

/** POSTs one notification. ok means HTTP 2xx; the reply text is returned for the log. */
export async function sendNotification(url: string, payload: unknown, authHeader?: string): Promise<SendResult> {
  const headers: Record<string, string> = {};
  if (authHeader) {
    const i = authHeader.indexOf(":");
    if (i > 0) headers[authHeader.slice(0, i).trim()] = authHeader.slice(i + 1).trim();
  }
  try {
    const reply = await postJson(url, payload, headers, 20000);
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, detail: reply.text.replace(/\s+/g, " ").slice(0, 200) };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { ok: false, status: 0, detail: `${(e as Error).message}${code ? ` (${code})` : ""}` };
  }
}
