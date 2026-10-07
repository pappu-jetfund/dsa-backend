import { IsEmail, IsOptional, IsString, IsBoolean, IsNumber, IsNotEmpty, IsIn, ValidateIf, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { CommissionType, VendorType } from '../../../utility/enums';


export class CreateVendorDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsNotEmpty()
    companyName!: string;

    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @IsNumber()
    @IsNotEmpty()
    roleId!: number;

    @IsEnum(VendorType)
    type!: VendorType;

    @ValidateIf((o) => o.type === VendorType.PARENT)
    @IsString()
    @IsNotEmpty()
    tag?: string;

    // @ValidateIf((o) => o.type === VendorType.PARENT)
    // @IsEnum(CommissionType)
    // commissionType!: CommissionType;

    // @ValidateIf(
    //     (o) =>
    //         o.commissionType === CommissionType.PERCENTAGE ||
    //         o.commissionType === CommissionType.FIXED,
    // )
    // @IsNumber()
    // @IsNotEmpty()
    // commissionValue?: number;

    // @ValidateIf((o) => o.commissionType === CommissionType.SLAB)
    // @IsArray()
    // @ValidateNested({ each: true })
    // @Type(() => CommissionSlabDto)
    // slabs?: CommissionSlabDto[];

    // @ValidateIf((o) => o.commissionType === CommissionType.CUSTOM_LEAD)
    // @IsArray()
    // @ValidateNested({ each: true })
    // @Type(() => CustomLeadPricingDto)
    // leadPricing?: CustomLeadPricingDto[];
}

export class CommissionSlabDto {
    @IsNumber()
    @IsNotEmpty()
    from!: number;

    @IsNumber()
    @IsNotEmpty()
    to!: number;

    @IsNumber()
    @IsNotEmpty()
    value!: number;
}

export class CustomLeadPricingDto {
    @IsNumber()
    @IsNotEmpty()
    leadId!: string;

    @IsNumber()
    @IsNotEmpty()
    amount!: number;
}

export class UpdateVendorDto extends PartialType(CreateVendorDto) { }