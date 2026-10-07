import { IsString, IsNotEmpty, IsNumber, Length } from 'class-validator';

export class IciciTransferDto {
  @IsString()
  @IsNotEmpty()
  beneAccNo!: string;

  @IsString()
  @Length(11, 11)
  beneIFSC!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  senderName!: string;

  @IsString()
  @Length(10, 10)
  mobile!: string;

  @IsString()
  paymentRef!: string;
}
