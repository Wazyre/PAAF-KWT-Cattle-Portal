// Sahel notifications: the message templates agreed with PAAF and the call that sends one to a person's Sahel app.
// Each message carries a button that opens the self-declaration service in the Sahel app (or, optionally, the portal with a signed sign-in link, see entry-link.ts).
import { postJson } from "./http";

export type TemplateId = "register" | "confirmed" | "reminder" | "final-warning" | "field-visit" | "visit-failed" | "support-suspended";

/** Values that fill the [placeholders] of a message. */
export interface SahelParams {
  deadline?: string;
  contact?: string;
  date?: string;
  start?: string;
  end?: string;
  updatePeriod?: string;
  reason?: string;
}

interface Template {
  describe: string;
  needs: (keyof SahelParams)[];
  bodyAr: string;
  bodyEn: string;
  dataTableAr?: Record<string, string>;
  dataTableEn?: Record<string, string>;
  /** Labels of the signed-link button (the service button carries none). */
  labelAr: string;
  labelEn: string;
  /** The message has no button at all. */
  noButton?: boolean;
}

const TEMPLATES: Record<TemplateId, Template> = {
  register: {
    describe: "Registration and self-declaration are required",
    needs: ["deadline", "contact"],
    bodyAr:
      "عزيزي المربي، تدعوكم الهيئة العامة لشؤون الزراعة والثروة السمكية إلى التسجيل في المنصة الإلكترونية، واستكمال البيانات المطلوبة بدقة، وتقديم الإقرار الذاتي بصحتها، وذلك في موعد أقصاه {deadline}. ويُعد استكمال التسجيل شرطاً للاستمرار في الاستفادة من برامج دعم الحيوانية التي تقدمه الهيئة. وفي حال عدم استكمال التسجيل خلال المهلة المحددة، فسيتم إيقاف صرف الدعم وفقاً للضوابط واللوائح والقرارات المعتمدة لدى الهيئة.",
    bodyEn:
      "Dear livestock breeder, the Public Authority for Agriculture Affairs and Fish Resources invites you to register on the electronic platform, complete the required information accurately, and submit the self-declaration confirming its accuracy, no later than {deadline}. Completing registration is a condition for continuing to benefit from the animal support programs provided by the Authority. If registration is not completed within the specified period, support payments will be suspended in accordance with the regulations, bylaws, and decisions approved by the Authority.",
    dataTableAr: { 
      "العنوان": "تقديم الإقرار الذاتي", 
      "آخر موعد للتسجيل": "{deadline}", 
      "قناة التواصل": "{contact}" 
    },
    dataTableEn: { 
      Title: "Registration and Self-Declaration", 
      "Registration Deadline": "{deadline}", 
      "Contact Channel": "{contact}" 
    },
    labelAr: "التسجيل الآن",
    labelEn: "Register Now"
  },
  confirmed: {
    describe: "Registration completed (confirmation)",
    needs: [],
    bodyAr:
      "عزيزي المربي، نفيدكم باكتمال تسجيلكم في المنصة الإلكترونية، واستلام البيانات والإقرار الذاتي المقدم من قبلكم. وتخضع البيانات للمراجعة والتحقق، وسيتم إشعاركم لاحقاً بموعد الزيارة الميدانية لمطابقة الأعداد الفعلية للأغنام والماعز مع البيانات المسجلة.",
    bodyEn:
      "Dear livestock breeder, your registration on the electronic platform has been completed, and your information and self-declaration have been received. The information is subject to review and verification, and you will be notified later of the field-visit appointment to match the actual numbers of sheep and goats with the registered information.",
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
      "عزيزي المربي، هذا إنذار نهائي لعدم تسجيلكم في المنصة الإلكترونية رغم الإشعارات السابقة. يرجى التسجيل في المنصة الإلكترونية في موعد أقصاه {deadline}. وفي حال عدم استكمال التسجيل خلال المهلة المحددة، فسيتم إيقاف صرف الدعم وفقاً للضوابط واللوائح والقرارات المعتمدة لدى الهيئة. إذا كنتم قد أتممتم التسجيل قبل استلام هذا الإشعار، فيرجى تجاهل الرسالة.",
    bodyEn:
      "Dear livestock breeder, this is a final warning because your registration on the electronic platform has not been completed despite previous notifications. Please register on the electronic platform no later than {deadline}. If registration is not completed within the specified period, support payments will be suspended in accordance with the regulations, bylaws, and decisions approved by the Authority. If you completed registration before receiving this notification, please disregard this message.",
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
      "عزيزي المربي، تم تحديد موعد الزيارة الميدانية للتحقق من الأعداد الفعلية للأغنام والماعز ومطابقتها مع البيانات المسجلة في المنصة الإلكترونية، وذلك يوم {date}، من الساعة {start} إلى الساعة {end}، يرجى حضور المربي أو من يمثله، وتجهيز الموقع وتمكين الفريق المختص من تنفيذ أعمال الحصر. ويمكنك تحديث البيانات في المنصة خلال مدة {updatePeriod} من تاريخ استلام هذا الإشعار.",
    bodyEn:
      "Dear livestock breeder, a field visit has been scheduled to verify the actual numbers of sheep and goats against the information registered on the electronic platform. The visit will take place on {date}, from {start} to {end}. The breeder or an authorized representative should attend, prepare the site, and enable the specialized team to carry out the counting. You may update the information on the platform within {updatePeriod} of receiving this notification.",
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
    labelAr: "تحديث اللإقرار الذاتي",
    labelEn: "Update Self-Declaration"
  },
  "visit-failed": {
    describe: "Field inventory could not be completed",
    needs: ["date", "reason"],
    bodyAr:
      "عزيزي المربي، تعذر على الفريق المختص استكمال إجراءات الحصر الميداني بتاريخ {date}، بسبب عدم التزامك بمتطلبات الإقرار الذاتي ولعدم استيفاء ضوابط صرف الدعم المقررة بالهيئة. سبب التعذر: {reason}. وستتخذ الهيئة الإجراءات المقررة لإيقاف صرف الدعم الحيواني وفقاً للضوابط واللوائح والقرارات المعتمدة.",
    bodyEn:
      "Dear livestock breeder, the specialized team was unable to complete the field inventory on {date}, because you did not comply with the self-declaration requirements and the Authority's conditions for disbursing support were not met. Reason: {reason}. The Authority will take the prescribed measures to suspend animal support payments in accordance with the regulations, bylaws, and decisions approved by the Authority.",
    dataTableAr: { "العنوان": "إشعار بعدم استكمال الحصر الميداني", "تاريخ الزيارة": "{date}", "سبب التعذر": "{reason}" },
    dataTableEn: { Title: "Field Inventory Not Completed", "Visit Date": "{date}", Reason: "{reason}" },
    labelAr: "",
    labelEn: "",
    noButton: true
  },
  "support-suspended": {
    describe: "Support payments suspended",
    needs: [],
    bodyAr:
      "عزيزي المربي، تفيدكم الهيئة العامة لشؤون الزراعة والثروة السمكية بأن قد تقرر إيقاف صرف الدعم الحيواني وفقاً للضوابط واللوائح والقرارات المعتمدة نتيجة عدم الالتزام بمتطلبات الإقرار الذاتي. للتواصل يرجى مراجعة الهيئة.",
    bodyEn:
      "Dear livestock breeder, the Public Authority for Agriculture Affairs and Fish Resources informs you that it has been decided to suspend animal support payments, in accordance with the regulations, bylaws, and decisions approved by the Authority, due to non-compliance with the self-declaration requirements. For further information, please contact the Authority.",
    dataTableAr: { "العنوان": "إشعار بإيقاف صرف الدعم", "حالة الدعم": "موقوف", "السبب": "عدم الالتزام بمتطلبات الإقرار الذاتي" },
    dataTableEn: { Title: "Support Suspension Notice", "Support Status": "Suspended", Reason: "Non-compliance with the self-declaration requirements" },
    labelAr: "",
    labelEn: "",
    noButton: true
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

/** What the button does when tapped: opens the self-declaration service inside Sahel, or opens a link (an empty url keeps the button but opens nothing). */
export type Button = { type: "service"; actionUrl: string } | { type: "link"; url: string };

/** actionUrl of the service button: the Sahel service that holds the self-declaration. It differs between the test and production services. */
export const SERVICE_ACTION_URL = { test: "1254", prod: "self-declaration" };

/** A null `button`, or a message that has none, leaves actionButtonRequestList empty. */
export function buildPayload(id: TemplateId, civilId: string, button: Button | null, params: SahelParams) {
  const t = TEMPLATES[id];
  const buttons =
    !button || t.noButton
      ? []
      : button.type === "service"
        ? [{ actionType: "service", actionUrl: button.actionUrl }]
        : [{ actionType: "link", actionUrl: button.url, viewBag: "", labelAr: t.labelAr, labelEn: t.labelEn }];
  return {
    subscriberCivilId: civilId,
    bodyAr: fill(t.bodyAr, params),
    bodyEn: fill(t.bodyEn, params),
    ...(t.dataTableAr && { dataTableAr: fillAll(t.dataTableAr, params) }),
    ...(t.dataTableEn && { dataTableEn: fillAll(t.dataTableEn, params) }),
    isForSubscriber: true,
    notificationType: "livestock",
    actionButtonRequestList: buttons
  };
}

export interface SendResult {
  ok: boolean;
  status: number;
  detail: string;
}

/** Sahel answers HTTP 200 even when it refuses a message; its own code says what happened. */
export const SAHEL_SUCCESS_CODE = 900;

/** POSTs one notification. ok means HTTP 2xx and, when Sahel gives a responseCode, that it is 900 (success). */
export async function sendNotification(url: string, payload: unknown, authHeader?: string): Promise<SendResult> {
  const headers: Record<string, string> = {};
  if (authHeader) {
    const i = authHeader.indexOf(":");
    if (i > 0) headers[authHeader.slice(0, i).trim()] = authHeader.slice(i + 1).trim();
  }
  try {
    const reply = await postJson(url, payload, headers, 20000);
    const text = reply.text.replace(/\s+/g, " ").slice(0, 200);
    const httpOk = reply.status >= 200 && reply.status < 300;
    let body: { responseCode?: unknown; message?: unknown } | null = null;
    try {
      body = JSON.parse(reply.text);
    } catch {
      // not JSON: judged by the HTTP status alone
    }
    if (httpOk && body && body.responseCode !== undefined) {
      const code = Number(body.responseCode);
      return { ok: code === SAHEL_SUCCESS_CODE, status: reply.status, detail: `responseCode ${code}: ${String(body.message ?? "")}`.slice(0, 200) };
    }
    return { ok: httpOk, status: reply.status, detail: text };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { ok: false, status: 0, detail: `${(e as Error).message}${code ? ` (${code})` : ""}` };
  }
}
