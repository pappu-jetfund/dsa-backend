import { IsString, IsOptional, IsNotEmpty, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class GetVendorReportsDto {
    @IsString()
    @IsNotEmpty()
    fromDate!: string;

    @IsString()
    @IsNotEmpty()
    toDate!: string;

    @IsOptional()
    @IsString()
    utmSource?: string;
}

export class VendorCustomerReportDto {
    @IsOptional()
    @IsString()
    date?: string;

    @IsOptional()
    @IsString()
    fromDate?: string;

    @IsOptional()
    @IsString()
    toDate?: string;

    @IsOptional()
    @IsString()
    utmSource?: string;
}