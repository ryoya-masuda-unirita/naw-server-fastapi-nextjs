export interface Assistant {
  id: string;
  name: string;
  description: string;
  category: string;
  model: string;
  isDefault?: boolean;
}

export interface AssistantApiEndpoint {
  id: string;
  label: string | null;
  url: string;
  model: string;
  type: string;
}

// GET /api/assistants list item (wire format)
export interface AssistantListApiItem {
  id: string;
  tenantId: string;
  type: string;
  endpoints: AssistantApiEndpoint[];
  name: string;
  indexId: string | null;
  category: string | null;
  groups: string[];
  description: string;
  includeHistory: boolean;
  iconColor: string;
}

// GET /api/assistants — returns array directly
export type AssistantsListApiResponse = AssistantListApiItem[];

export function mapAssistantListApiItemToAssistant(item: AssistantListApiItem): Assistant {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category ?? '',
    model: item.endpoints[0]?.model ?? '',
  };
}
