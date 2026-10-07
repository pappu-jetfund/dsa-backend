import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

enum status {
  ZERO = "0",
  ONE = "1",
}

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(status)
  @IsNotEmpty()
  status!: status;

  @IsOptional()
  @IsInt()
  vendorId?: number;

}

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}