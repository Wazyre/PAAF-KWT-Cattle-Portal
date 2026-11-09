// The OpenAPI 3.0 description of the declaration API, served at /api/v1/openapi.json and shown by Swagger UI at /api/docs.
// Enum values, limits and the legal version are read from the same constants the code uses, so they cannot drift.
import { ANIMAL_TYPES, GATHERING_POINTS, LOW_HEAD_THRESHOLD, MIN_SITE_DISTANCE_METERS } from "../constants";
import { LEGAL_VERSION } from "../legal";
import { KUWAIT_MOBILE_RE } from "../phone";
import { MAX_COUNT, MAX_LOCATIONS_PER_ANIMAL_TYPE } from "./declaration";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const errorResponse = (description: string, example: unknown) => ({
  description,
  content: { "application/json": { schema: ref("Error"), example } }
});
const jsonBody = (schema: unknown, example?: unknown) => ({ "application/json": { schema, ...(example ? { example } : {}) } });

const civilIdParam = { $ref: "#/components/parameters/CivilId" };
const security = [{ bearerAuth: [] }];

const exampleLocation = {
  gatheringPoint: "WAFRA",
  locationLink: "29.1234, 47.9876",
  chippedCount: 120,
  males: 45,
  numTenders: 2
};

const exampleDeclaration = {
  mobile: "99123456",
  mobile2: null,
  animalGroups: [{ animalType: "SHEEP_GOATS", locations: [exampleLocation] }],
  legal: { accepted: true, version: LEGAL_VERSION }
};

const description = `
The database behind the **Sheep Portal** farmer declaration form, for a form that is built and hosted elsewhere.
It does what the farmer portal does: tells a **first declaration** from an **update**, validates the data with the
same rules, keeps the previous version of a declaration when it is edited, and records that the farmer accepted the legal text.

## How a form uses it

1. The form signs the farmer in itself (for example with PACI) and learns their **12-digit civil ID**.
2. \`GET /farmers/{civilId}\` → \`mode\` is **NEW** or **UPDATE**, and \`allowed\` says whether the registration / update switches
   currently let this farmer submit.
3. **NEW:** \`GET /legal\`, show the text, let the farmer confirm it, then \`PUT /farmers/{civilId}/declaration\` with \`legal: { accepted: true, version }\`.
   **UPDATE:** \`GET /farmers/{civilId}/declaration\` to prefill the form, then \`PUT\` the whole edited declaration (no legal step, as in the portal).
4. \`GET /reference\` has the animal types, gathering points (with Arabic labels) and limits to build the form from.
   \`GET /locations/resolve\` turns a pasted location or Google Maps link into coordinates, for the map pin.

## Things to know

- **Server to server only.** The API trusts the caller to have signed the farmer in: anyone holding a key can read and
  replace **any** farmer's declaration. Keep the key on your server, never in a browser or mobile app, and do not enable CORS for it.
- **PUT replaces the whole declaration**, it does not merge. Send every animal type and location the farmer should end up with.
  The previous version is kept in the declaration history. Sending exactly what is stored changes nothing (\`result: UNCHANGED\`).
- **The farmer's name is never taken from the request**; it comes from the farmer list. A civil ID that is not on the list gets 404 \`NOT_REGISTERED\`.
- **Concurrency.** Every declaration has an \`ETag\`. Send \`If-None-Match: *\` to allow only a first submission, or \`If-Match: <ETag>\`
  to allow an update only if nobody changed it since you loaded it. Both are optional; failure is 412.
- **Errors** are always \`{ "error": { "code", "message", "messageAr", "details" } }\`. \`code\` is stable, \`message\` is English for developers, and
  \`messageAr\` / \`details[].message\` are the Arabic wording of the farmer portal, ready to show to a farmer.

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 400 | INVALID_CIVIL_ID, INVALID_JSON, INVALID_BODY, LINK_REQUIRED, LINK_TOO_LONG | The request itself is malformed |
| 401 | UNAUTHENTICATED, INVALID_API_KEY | Missing, unknown or revoked API key |
| 403 | REGISTRATION_CLOSED, UPDATES_CLOSED | The switch for this farmer is off (\`allowed: false\`) |
| 404 | NOT_REGISTERED, DECLARATION_NOT_FOUND | Not on the farmer list / no declaration yet |
| 409 | LEGAL_VERSION_MISMATCH, CONFLICT | The legal text changed (fetch it again) / the declaration was removed meanwhile |
| 412 | PRECONDITION_FAILED | \`If-Match\` / \`If-None-Match\` did not hold |
| 413 | BODY_TOO_LARGE | Body over 1 MB |
| 422 | VALIDATION_FAILED, LEGAL_ACCEPTANCE_REQUIRED, LOCATION_UNRESOLVED | See \`details[].path\` and \`details[].code\` |
| 500 | INTERNAL_ERROR | Server fault (logged on the server) |

Validation codes in \`details[].code\`: MOBILE_REQUIRED, INVALID_MOBILE, ANIMAL_GROUPS_REQUIRED, INVALID_ANIMAL_TYPE, DUPLICATE_ANIMAL_TYPE,
LOCATIONS_REQUIRED, TOO_MANY_LOCATIONS, INVALID_LOCATION, INVALID_GATHERING_POINT, LOCATION_LINK_REQUIRED, LOCATION_UNRESOLVED,
INVALID_COORDINATES, INVALID_COUNT, COUNT_MISMATCH, LOCATIONS_TOO_CLOSE, LEGAL_ACCEPTANCE_REQUIRED.
`.trim();

export function openApiSpec() {
  const animalTypes = ANIMAL_TYPES.map((a) => a.value);
  const gatheringPoints = GATHERING_POINTS.map((g) => g.value);

  return {
    openapi: "3.0.3",
    info: {
      title: "Sheep Portal — Farmer Declaration API",
      version: "1.0.0",
      description
    },
    servers: [{ url: "/api/v1", description: "This server" }],
    security,
    tags: [
      { name: "Farmer", description: "New or update? May this farmer submit?" },
      { name: "Declaration", description: "Read, create and update a farmer's declaration" },
      { name: "Form", description: "The legal text, lists and helpers the form is built from" }
    ],
    paths: {
      "/farmers/{civilId}": {
        get: {
          tags: ["Farmer"],
          operationId: "getFarmerStatus",
          summary: "Is this a first declaration or an update?",
          description:
            "Call this when the farmer arrives. `mode` is `NEW` (no declaration yet) or `UPDATE`. `allowed` is false when the registration / update " +
            "switch is closed for this civil ID (`blockedReason` says which): show a notice instead of the form. For a `NEW` farmer `legal.acceptanceRequired` is true. " +
            "The `ETag` header is the declaration's current ETag (absent for a `NEW` farmer).",
          parameters: [civilIdParam],
          responses: {
            "200": {
              description: "The farmer's status.",
              headers: { ETag: { schema: { type: "string" }, description: "ETag of the stored declaration (UPDATE only)." } },
              content: jsonBody(ref("FarmerStatus"), {
                civilId: "290000000000",
                name: "اسم المربي",
                mode: "NEW",
                allowed: true,
                blockedReason: null,
                transactionId: null,
                createdAt: null,
                updatedAt: null,
                legal: { currentVersion: LEGAL_VERSION, acceptanceRequired: true, acceptedVersion: null, acceptedAt: null }
              })
            },
            "400": errorResponse("Not a 12-digit civil ID.", { error: { code: "INVALID_CIVIL_ID", message: "The civil ID must be exactly 12 digits." } }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": errorResponse("The civil ID is not on the farmer list.", { error: { code: "NOT_REGISTERED", message: "This civil ID is not on the farmer list, so it cannot declare." } })
          }
        }
      },
      "/farmers/{civilId}/declaration": {
        get: {
          tags: ["Declaration"],
          operationId: "getDeclaration",
          summary: "The stored declaration (to prefill an edit form)",
          parameters: [civilIdParam],
          responses: {
            "200": {
              description: "The declaration. Animal types are always in the form's order: sheep and goats, camels, cows.",
              headers: { ETag: { schema: { type: "string" }, description: "Send it back as `If-Match` to guard an update." } },
              content: jsonBody(ref("Declaration"))
            },
            "400": errorResponse("Not a 12-digit civil ID.", { error: { code: "INVALID_CIVIL_ID", message: "The civil ID must be exactly 12 digits." } }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": errorResponse("No declaration for this civil ID yet.", { error: { code: "DECLARATION_NOT_FOUND", message: "This civil ID has no declaration yet." } })
          }
        },
        put: {
          tags: ["Declaration"],
          operationId: "putDeclaration",
          summary: "Create the declaration, or replace it if one exists",
          description:
            "One call for both cases, decided by the database: with no declaration it creates one (**201**), otherwise it stores the previous version " +
            "in the declaration history and replaces the contents (**200**, `result: UPDATED`). Identical content changes nothing (**200**, `result: UNCHANGED`). " +
            "The whole thing is saved in one step or not at all.\n\n" +
            "**First declaration:** `legal` is required, with `accepted: true` and the `version` returned by `GET /legal`. " +
            "**Update:** `legal` is optional; if sent it must be the current version.\n\n" +
            "**Coordinates:** send `latitude` and `longitude` (for example from `GET /locations/resolve`), or leave both out and the server reads them from `locationLink`.\n\n" +
            `Rules: \`males + females = chippedCount\` (leave \`females\` out and it is computed); locations of the same animal type must be at least ${MIN_SITE_DISTANCE_METERS} m apart; ` +
            `at most one group per animal type, at most ${MAX_LOCATIONS_PER_ANIMAL_TYPE} locations per group; counts are whole numbers from 0 to ${MAX_COUNT.toLocaleString("en-US")}. ` +
            "Phone numbers may include the Kuwait country code; they are stored as the 8-digit number.",
          parameters: [
            civilIdParam,
            {
              name: "If-None-Match",
              in: "header",
              required: false,
              schema: { type: "string", enum: ["*"] },
              description: "`*` = only create. Fails with 412 if the farmer already has a declaration (someone submitted in the meantime)."
            },
            {
              name: "If-Match",
              in: "header",
              required: false,
              schema: { type: "string" },
              description: "The ETag you loaded (or `*` = must exist). Fails with 412 if the declaration changed since."
            }
          ],
          requestBody: { required: true, content: jsonBody(ref("DeclarationInput"), exampleDeclaration) },
          responses: {
            "200": {
              description: "Updated, or unchanged.",
              headers: { ETag: { schema: { type: "string" } } },
              content: jsonBody(ref("SaveResult"))
            },
            "201": {
              description: "First declaration created.",
              headers: { ETag: { schema: { type: "string" } }, Location: { schema: { type: "string" } } },
              content: jsonBody(ref("SaveResult"))
            },
            "400": errorResponse("Malformed request (bad civil ID, body not JSON).", { error: { code: "INVALID_JSON", message: "The request body is not valid JSON." } }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "403": errorResponse("The registration / update switch is closed for this farmer.", {
              error: { code: "REGISTRATION_CLOSED", message: "New registrations are closed for this civil ID.", messageAr: "التسجيل الجديد غير متاح حالياً لهذا الرقم المدني." }
            }),
            "404": errorResponse("The civil ID is not on the farmer list.", { error: { code: "NOT_REGISTERED", message: "This civil ID is not on the farmer list, so it cannot declare." } }),
            "409": errorResponse("The legal text was updated: fetch `GET /legal` again.", {
              error: { code: "LEGAL_VERSION_MISMATCH", message: `The legal text was updated (current version "${LEGAL_VERSION}", you sent "0.9").` }
            }),
            "412": errorResponse("`If-Match` / `If-None-Match` did not hold.", { error: { code: "PRECONDITION_FAILED", message: "The declaration changed since it was loaded." } }),
            "413": errorResponse("Body over 1 MB.", { error: { code: "BODY_TOO_LARGE", message: "The request body is larger than 1 MB." } }),
            "422": errorResponse("The declaration breaks a rule. `details` lists every problem with the path of the field.", {
              error: {
                code: "VALIDATION_FAILED",
                message: "1 problem in the declaration; see details.",
                messageAr: "النوع 1 / الموقع 1: مجموع الذكور والإناث يجب أن يساوي عدد الحيوانات المُرقّمة.",
                details: [
                  {
                    path: "animalGroups[0].locations[0].males",
                    code: "COUNT_MISMATCH",
                    message: "النوع 1 / الموقع 1: مجموع الذكور والإناث يجب أن يساوي عدد الحيوانات المُرقّمة."
                  }
                ]
              }
            })
          }
        }
      },
      "/legal": {
        get: {
          tags: ["Form"],
          operationId: "getLegal",
          summary: "The legal text a first-time farmer must accept",
          description:
            "Show `heading`, every section, and the `confirmation` sentence (the portal has the farmer slide a control to confirm it). " +
            "Then send `legal: { accepted: true, version }` with the declaration. The text and version are the portal's own; a change in wording gets a new `version`.",
          responses: {
            "200": { description: "The legal text.", content: jsonBody(ref("Legal")) },
            "401": { $ref: "#/components/responses/Unauthorized" }
          }
        }
      },
      "/reference": {
        get: {
          tags: ["Form"],
          operationId: "getReference",
          summary: "Animal types, gathering points and limits",
          description: "Values are what the API stores and expects; `label` is the Arabic text the form shows.",
          responses: {
            "200": { description: "Lists and limits.", content: jsonBody(ref("Reference")) },
            "401": { $ref: "#/components/responses/Unauthorized" }
          }
        }
      },
      "/locations/resolve": {
        get: {
          tags: ["Form"],
          operationId: "resolveLocation",
          summary: "Coordinates from a pasted location or Google Maps link",
          description: "Accepts `29.1234, 47.9876` or a Google Maps link, including `maps.app.goo.gl` share links (expanded on the server). Only Google's own hosts are ever fetched.",
          parameters: [{ name: "link", in: "query", required: true, schema: { type: "string", maxLength: 2048 }, example: "29.1234, 47.9876" }],
          responses: {
            "200": { description: "The coordinates.", content: jsonBody(ref("ResolvedLocation"), { latitude: 29.1234, longitude: 47.9876 }) },
            "400": errorResponse("`link` missing or too long.", { error: { code: "LINK_REQUIRED", message: "Give the location in the 'link' query parameter." } }),
            "401": { $ref: "#/components/responses/Unauthorized" },
            "422": errorResponse("No coordinates could be read.", { error: { code: "LOCATION_UNRESOLVED", message: "No coordinates could be read from the link." } })
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "An API key issued on the server with `npm run api:clients -- create <name>`. Sent as `Authorization: Bearer <key>`."
        }
      },
      parameters: {
        CivilId: {
          name: "civilId",
          in: "path",
          required: true,
          description: "The farmer's 12-digit civil ID.",
          schema: { type: "string", pattern: "^\\d{12}$" },
          example: "290000000000"
        }
      },
      responses: {
        Unauthorized: errorResponse("Missing, unknown or revoked API key.", { error: { code: "INVALID_API_KEY", message: "The API key is not valid or has been revoked." } })
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", description: "Stable identifier for programs." },
                message: { type: "string", description: "English, for developers." },
                messageAr: { type: "string", description: "Arabic, as the farmer portal words it; safe to show to a farmer." },
                details: {
                  type: "array",
                  description: "Validation problems (422), one per field.",
                  items: {
                    type: "object",
                    required: ["path", "code", "message"],
                    properties: {
                      path: { type: "string", example: "animalGroups[0].locations[1].males" },
                      code: { type: "string", example: "COUNT_MISMATCH" },
                      message: { type: "string", description: "Arabic." }
                    }
                  }
                }
              }
            }
          }
        },
        AnimalType: { type: "string", enum: animalTypes, description: ANIMAL_TYPES.map((a) => `${a.value} = ${a.label}`).join("; ") },
        GatheringPoint: { type: "string", enum: gatheringPoints, description: GATHERING_POINTS.map((g) => `${g.value} = ${g.label}`).join("; ") },
        LocationInput: {
          type: "object",
          required: ["gatheringPoint", "locationLink", "chippedCount", "males", "numTenders"],
          properties: {
            gatheringPoint: ref("GatheringPoint"),
            locationLink: { type: "string", maxLength: 2048, description: "What the farmer pasted: a Google Maps link or `lat, lng`." },
            latitude: { type: "number", minimum: -90, maximum: 90, description: "Optional. Send together with `longitude`; otherwise read from `locationLink`." },
            longitude: { type: "number", minimum: -180, maximum: 180 },
            chippedCount: { type: "integer", minimum: 0, maximum: MAX_COUNT, description: "Heads carrying a chip." },
            males: { type: "integer", minimum: 0, maximum: MAX_COUNT },
            females: { type: "integer", minimum: 0, maximum: MAX_COUNT, description: "Optional: computed as `chippedCount - males`. If sent, `males + females` must equal `chippedCount`." },
            numTenders: { type: "integer", minimum: 0, maximum: MAX_COUNT, description: "Herders registered on the breeder's residence permit." }
          }
        },
        Location: {
          type: "object",
          required: ["gatheringPoint", "locationLink", "latitude", "longitude", "chippedCount", "males", "females", "numTenders"],
          properties: {
            gatheringPoint: ref("GatheringPoint"),
            locationLink: { type: "string" },
            latitude: { type: "number" },
            longitude: { type: "number" },
            chippedCount: { type: "integer" },
            males: { type: "integer" },
            females: { type: "integer" },
            numTenders: { type: "integer" }
          }
        },
        AnimalGroupInput: {
          type: "object",
          required: ["animalType", "locations"],
          properties: {
            animalType: ref("AnimalType"),
            locations: { type: "array", minItems: 1, maxItems: MAX_LOCATIONS_PER_ANIMAL_TYPE, items: ref("LocationInput") }
          }
        },
        AnimalGroup: {
          type: "object",
          required: ["animalType", "locations"],
          properties: { animalType: ref("AnimalType"), locations: { type: "array", items: ref("Location") } }
        },
        LegalAcceptance: {
          type: "object",
          required: ["accepted", "version"],
          properties: {
            accepted: { type: "boolean", enum: [true], description: "Always `true`: the farmer confirmed the text." },
            version: { type: "string", example: LEGAL_VERSION, description: "The `version` of the text the farmer saw (from `GET /legal`)." }
          }
        },
        DeclarationInput: {
          type: "object",
          required: ["mobile", "animalGroups"],
          properties: {
            mobile: { type: "string", pattern: KUWAIT_MOBILE_RE.source, example: "99123456", description: "The farmer's phone: 8 digits starting with 2, 5, 6 or 9 (a 965 / 00965 prefix is accepted)." },
            mobile2: { type: "string", nullable: true, pattern: KUWAIT_MOBILE_RE.source, description: "Optional second phone." },
            animalGroups: { type: "array", minItems: 1, maxItems: animalTypes.length, items: ref("AnimalGroupInput"), description: "Only the animal types the farmer has; at most one group per type." },
            legal: { ...ref("LegalAcceptance"), description: "Required for a first declaration." }
          }
        },
        Declaration: {
          type: "object",
          required: ["transactionId", "civilId", "name", "mobile", "mobile2", "createdAt", "updatedAt", "animalGroups"],
          properties: {
            transactionId: { type: "integer", description: "The declaration's number, used in the field audit." },
            civilId: { type: "string" },
            name: { type: "string" },
            mobile: { type: "string" },
            mobile2: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            animalGroups: { type: "array", items: ref("AnimalGroup") }
          }
        },
        SaveResult: {
          type: "object",
          required: ["result", "transactionId", "declaration"],
          properties: {
            result: { type: "string", enum: ["CREATED", "UPDATED", "UNCHANGED"] },
            transactionId: { type: "integer" },
            declaration: ref("Declaration")
          }
        },
        FarmerStatus: {
          type: "object",
          required: ["civilId", "name", "mode", "allowed", "blockedReason", "transactionId", "createdAt", "updatedAt", "legal"],
          properties: {
            civilId: { type: "string" },
            name: { type: "string" },
            mode: { type: "string", enum: ["NEW", "UPDATE"], description: "`NEW`: no declaration yet. `UPDATE`: one exists." },
            allowed: { type: "boolean", description: "False when the registration (NEW) or update (UPDATE) switch is closed for this farmer." },
            blockedReason: { type: "string", nullable: true, enum: ["REGISTRATION_CLOSED", "UPDATES_CLOSED", null] },
            transactionId: { type: "integer", nullable: true },
            createdAt: { type: "string", format: "date-time", nullable: true },
            updatedAt: { type: "string", format: "date-time", nullable: true },
            legal: {
              type: "object",
              required: ["currentVersion", "acceptanceRequired", "acceptedVersion", "acceptedAt"],
              properties: {
                currentVersion: { type: "string", example: LEGAL_VERSION },
                acceptanceRequired: { type: "boolean", description: "True for a first declaration." },
                acceptedVersion: { type: "string", nullable: true, description: "The version this farmer's latest recorded acceptance was for." },
                acceptedAt: { type: "string", format: "date-time", nullable: true }
              }
            }
          }
        },
        Legal: {
          type: "object",
          required: ["version", "textHash", "heading", "sections", "confirmation"],
          properties: {
            version: { type: "string", example: LEGAL_VERSION },
            textHash: { type: "string", description: "SHA-256 of the text; stored with each acceptance." },
            heading: { type: "string" },
            sections: {
              type: "array",
              items: {
                type: "object",
                required: ["title", "paragraphs"],
                properties: { title: { type: "string" }, paragraphs: { type: "array", items: { type: "string" } } }
              }
            },
            confirmation: { type: "string", description: "The sentence the farmer confirms." }
          }
        },
        Reference: {
          type: "object",
          properties: {
            animalTypes: { type: "array", items: { type: "object", properties: { value: ref("AnimalType"), label: { type: "string" } } } },
            gatheringPoints: { type: "array", items: { type: "object", properties: { value: ref("GatheringPoint"), label: { type: "string" } } } },
            rules: {
              type: "object",
              properties: {
                mobilePattern: { type: "string" },
                mobileMessage: { type: "string" },
                minSiteDistanceMeters: { type: "integer", example: MIN_SITE_DISTANCE_METERS },
                maxLocationsPerAnimalType: { type: "integer", example: MAX_LOCATIONS_PER_ANIMAL_TYPE },
                maxCount: { type: "integer", example: MAX_COUNT },
                lowHeadThreshold: { type: "integer", example: LOW_HEAD_THRESHOLD }
              }
            }
          }
        },
        ResolvedLocation: {
          type: "object",
          required: ["latitude", "longitude"],
          properties: { latitude: { type: "number" }, longitude: { type: "number" } }
        }
      }
    }
  };
}
