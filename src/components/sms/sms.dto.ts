import { IsArray, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class SendPaymentLinkDto {
  @IsArray()
  @IsNotEmpty({ each: true })
  leadIds!: number[];

  @IsOptional()
  @IsString()
  message?: string;
}