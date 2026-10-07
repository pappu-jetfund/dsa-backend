export interface PayoutProvider {
  setConfig(config: any): void;

  transfer(data: any): Promise<any>;
  status(referenceId: string): Promise<any>;
}
