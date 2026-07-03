/** Workspace settings allows CRUD only for local Waha connection endpoints. */
export const MANAGEABLE_ENDPOINT_TYPE = 'LOCAL_SERVER' as const;

export function isManageableEndpointType(type: string): boolean {
  return type === MANAGEABLE_ENDPOINT_TYPE;
}
