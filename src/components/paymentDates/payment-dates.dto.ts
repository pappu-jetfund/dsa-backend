import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

export class SavePaymentDatesDto {
  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  dates?: string[];

  @IsOptional()
  @IsString()
  reason?: string;
}