// The error type every API handler throws; response.ts turns it into the JSON error body.

export interface ApiIssue {
  /** Where in the request body the problem is, e.g. animalGroups[0].locations[1].males */
  path: string;
  code: string;
  /** Arabic, as the farmer portal words it. */
  message: string;
}

/** Thrown anywhere in a handler to stop with a clean API error. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly messageAr?: string,
    readonly details?: ApiIssue[]
  ) {
    super(message);
  }
}
