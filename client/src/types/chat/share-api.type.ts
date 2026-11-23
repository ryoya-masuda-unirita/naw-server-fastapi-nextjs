export interface ShareResponse {
  id: string;
  roomId: string;
  teamIds: string[];
}

export interface ShareAccessResponse {
  roomId: string;
  isReadOnly: boolean;
  teamIds: string[];
  roomName?: string;
}
