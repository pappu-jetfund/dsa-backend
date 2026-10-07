export interface SmsPayload {
  sender_id: string;
  to: number[];
  route: string;
  template_id: string;
  message: string;
  variables: Record<string, string>;
}
