export interface TrainingData {
  id: string;
  displayName: string;
  description?: string;
  serverType: 'cloud' | 'local';
  serverCode: string;
  model: string;
  historyEnabled: boolean;
  fileName?: string;
  link?: string;
  status?: string;
}
