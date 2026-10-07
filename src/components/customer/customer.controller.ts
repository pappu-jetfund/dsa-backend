import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../gaurd/read.gaurd';

@Controller('customer')
export class CustomerController {
  constructor(private CustomerService: CustomerService) { }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':customerId/profile-update')
  async profileUpdate(
    @Param('customerId') customerId: string,
    @Body() body: any,
  ) {
    return await this.CustomerService.profileUpdate(customerId, body);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':customerId/add-address')
  async addAddress(@Param('customerId') customerId: string, @Body() body: any) {
    return await this.CustomerService.addAddress(customerId, body);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':customerId/update-address/:addressId')
  async updateAddress(
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
    @Body() body: any,
  ) {
    return await this.CustomerService.updateAddress(
      customerId,
      addressId,
      body,
    );
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':customerID/add-employment-details')
  async createEmployment(
    @Param('customerID') customerID: string,
    @Body() body: any,
    @Req() req: Request
  ) {
    return await this.CustomerService.createEmployment(customerID, body, req);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch(':customerID/employer-details/:employerID')
  async updateEmployer(
    @Param('customerID') customerID: string,
    @Param('employerID') employerID: string,
    @Body() body: any,
    @Req() req: Request
  ) {
    return await this.CustomerService.updateEmployer(
      customerID,
      body,
      employerID,
      req,
    );
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':customerID/add-customer-reference')
  async createCustomerReference(
    @Param('customerID') customerID: string,
    @Body() body: any,
    @Req() req: Request
  ) {
    return await this.CustomerService.createCustomerReference(customerID, body, req);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch(':customerID/add-customer-reference/:referenceID')
  async updateCustomerReference(
    @Param('customerID') customerID: string,
    @Param('referenceID') referenceID: string,
    @Body() body: any,
    @Req() req: Request
  ) {
    return await this.CustomerService.updateCustomerReference(
      customerID,
      referenceID,
      body,
      req
    );
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Delete(':customerID/delete-customer-reference/:referenceID')
  async deleteReference(
    @Param('customerID') customerID: string,
    @Param('referenceID') referenceID: string,
  ) {
    return await this.CustomerService.deleteReference(customerID, referenceID);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':leadID/ivr-remark/:customerID')
  async addIVRRemark(
    @Param('leadID') leadID: string,
    @Param('customerID') customerID: string,
    @Body() body: any,
    @Req() req: Request
  ) {
    return await this.CustomerService.addIVRRemark(leadID, customerID, body, req);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':customerID/add-bank-details')
  async addBankDetails(
    @Param('customerID') customerID: string,
    @Req() request: Request,
    @Body() body: any,
    @Query('leadID') leadID: string,
  ) {
    return await this.CustomerService.addBankDetails(customerID, body, request, leadID);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch(':accountID/update-bank-details/:customerID')
  async updateBankDetails(
    @Param('customerID') customerID: string,
    @Param('accountID') accountID: string,
    @Query('leadID') leadID: string,
    @Body() body: any,
  ) {
    return await this.CustomerService.updateBankDetails(
      customerID,
      accountID,
      leadID,
      body,
    );
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch(':accountID/verify-bank-details/:customerID')
  async verifyBankDetails(
    @Param('customerID') customerID: string,
    @Param('accountID') accountID: string,
    @Query('leadID') leadID: string,
    @Body() body: any,
    @Req() req,
  ) {
    return await this.CustomerService.verifyBankDetails(
      customerID,
      accountID,
      leadID,
      body,
      req,
    );
  }

  @Get('locations')
  async getLocations(@Query() query: any) {
    return this.CustomerService.getCustomerLocations(query);
  }

  @Get('sms')
  async getCustomerSms(@Query() query: any) {
    try {
      return await this.CustomerService.getCustomerSms(query);
    } catch (error: any) {
      return {
        statusCode: 500,
        message: 'Failed to fetch customer SMS',
        error: error.message,
      };
    }
  }

  @Get('contacts')
  async getCustomerContacts(@Query() query: any) {
    try {
      return await this.CustomerService.getCustomerContacts(query);
    } catch (error: any) {
      return {
        statusCode: 500,
        message: 'Failed to fetch customer contacts',
        error: error.message,
      };
    }
  }

  @Get('apps')
  async getCustomerApps(@Query() query: any) {
    try {
      return await this.CustomerService.getCustomerApps(query);
    } catch (error: any) {
      return {
        statusCode: 500,
        message: 'Failed to fetch customer apps',
        error: error.message,
      };
    }
  }

  @UseGuards(AuthGuard)
  @Get(':id/get-one-customer-details')
  async getCustomerByID(
    @Param('id') id: string,
    @Req() req: Request
  ) {
    return await this.CustomerService.getCustomerByID(id, req);
  }


  // @UseGuards(AuthGuard)
  @Get(':customerId/view-criff-data')
  async getCriffData(
    @Param('customerId') customerId: string,
    @Req() req: Request
  ) {
    return await this.CustomerService.getCriffData(customerId, req)
  }

  // @Get('test')
  // async getRAwData() {
  //   return await this.CustomerService.getRawDataAndDelete();
  // }
}
