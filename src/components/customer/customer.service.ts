import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalize } from '../../utility/helper';
import { bankAccountTypes } from '../../utility/enums';
import {
  address_status,
  address_type,
  customeraccount_status,
  employer_status,
  leads_status,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import axios from 'axios';
import { SmsService } from '../sms/sms.service';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { CacheService } from '../cache/cache.service';
import { CibilService } from '../cibil/cibil.service';
import { CacheKey } from '../cache/cache.keys';
import { GoogleService } from '../googleApi/google.service';
import { CardCompleted, CUSTOMER_JOURNEY_CONFIG, CustomerJourneyStep } from '../../common/config/customer-journey.config';

@Injectable()
export class CustomerService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly smsService: SmsService,
    private readonly cacheService: CacheService,
    private readonly CibilService: CibilService,
    private readonly googleService: GoogleService,
  ) { }

  async profileUpdate(customerId, body) {
    try {
      if (!customerId || isNaN(Number(customerId))) {
        return { statusCode: 400, message: 'Invalid customerId' };
      }
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerId) },
      });

      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Profile',
        'edit',
        'Profile',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message || 'You do not have permission to edit Profile',
        };
      }

      const allowedKeys = ['name', 'mobile', 'email', 'dob'];

      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        if (
          Object.prototype.hasOwnProperty.call(body, key) &&
          body[key] !== null &&
          body[key] !== '' &&
          !(typeof body[key] === 'string' && body[key].trim() === '')
        ) {
          // PAN validation
          // if (key === 'pancard') {
          //   const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
          //   if (!panRegex.test(body[key])) {
          //     return {
          //       statusCode: 400,
          //       message: 'Invalid PAN card format',
          //     };
          //   }
          // }

          // Email validation
          if (key === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(body[key])) {
              return {
                statusCode: 400,
                message: 'Invalid email format',
              };
            }
          }

          // Mobile validation
          if (key === 'mobile') {
            const mobileRegex = /^[6-9]\d{9}$/;
            if (!mobileRegex.test(body[key])) {
              return {
                statusCode: 400,
                message: 'Invalid mobile number format',
              };
            }
          }

          // DOB validation & conversion (🔥 FIX)
          if (key === 'dob') {
            const parsedDate = new Date(body[key]);

            if (isNaN(parsedDate.getTime())) {
              return {
                statusCode: 400,
                message: 'Invalid DOB format (expected YYYY-MM-DD)',
              };
            }

            filteredData.dob = parsedDate; // ✅ Date object
          } else {
            filteredData[key] = body[key];
          }
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return { statusCode: 400, message: 'No valid fields to update' };
      }

      filteredData.updatedAt = new Date();

      const updatedCustomer = await this.tenantPrisma.client.customer.update({
        where: { customerID: Number(customerId) },
        data: filteredData,
      });

      return normalize({
        updatedCustomer: updatedCustomer.customerID,
        message: 'Profile updated successfully',
        status: 'Success',
        statusCode: 200,
      });
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  }

  async addAddress(customerId: string, body: any) {
    try {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerId) },
      });

      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Profile',
        'add',
        'Address Details',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message || 'You do not have permission to add Address',
        };
      }

      const allowedKeys = [
        'type',
        'address',
        'city',
        'state',
        'pincode',
        'status',
        'kyc_current_add',
        'leadId',
      ];
      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        const val = body[key];
        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed !== '') filteredData[key] = trimmed;
          } else {
            filteredData[key] = val;
          }
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return {
          statusCode: 400,
          message: 'No valid fields to create address',
        };
      }

      const requiredFields = [
        'type',
        'address',
        'city',
        'state',
        'pincode',
        'status',
        'kyc_current_add',
      ];

      console.log(body, 'body');

      for (const field of requiredFields) {
        if (!filteredData[field]) {
          return {
            statusCode: 400,
            message: `Missing required field: ${field}`,
          };
        }
      }

      const validStatuses = Object.values(address_status);
      if (!validStatuses.includes(filteredData.status)) {
        return {
          statusCode: 400,
          message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
        };
      }

      const validTypes = Object.values(address_type);
      if (!validTypes.includes(filteredData.type)) {
        return {
          statusCode: 400,
          message: `Invalid type. Allowed values: ${validTypes.join(', ')}`,
        };
      }

      const pinRegex = /^[1-9][0-9]{5}$/;
      if (!pinRegex.test(filteredData.pincode)) {
        return { statusCode: 400, message: 'Invalid pincode format' };
      }

      // const userData = await this.clsService.get('user');

      const newAddress = await this.tenantPrisma.client.address.create({
        data: {
          ...filteredData,
          verifiedBy: userData || 1,
          customerID: Number(customerId),
          createdDate: new Date(),
        } as any,
      });

      const remarkData = {
        ...filteredData,
        ...(Object.prototype.hasOwnProperty.call(
          filteredData,
          'is_verified',
        ) && {
          is_verified: filteredData.is_verified ? 'verified' : 'not verified',
        }),
      };

      const callHistory = await this.tenantPrisma.client.callhistorylogs.create(
        {
          data: {
            customerID: Number(customerId),
            leadID: Number(body.leadId),
            callType: 'Address Add',
            status: 'Address Add',
            remark: JSON.stringify(remarkData),
            calledBy: userData,
            noteli: '',
          },
        },
      );

      return {
        addressId: newAddress.addressID,
        message: 'Address added successfully',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  }

  async updateAddress(customerId: string, addressId: string, body: any) {
    try {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerId) },
      });
      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }
      const address = await this.tenantPrisma.client.address.findFirst({
        where: { addressID: Number(addressId), customerID: Number(customerId) },
      });
      if (!address) {
        return {
          statusCode: 404,
          message: 'Address not found for this customer',
        };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Profile',
        'edit',
        'Address Details',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message || 'You do not have permission to add Address',
        };
      }
      const allowedKeys = [
        'type',
        'address',
        'city',
        'state',
        'pincode',
        'status',
        'kyc_current_add',
      ];
      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        const val = body[key];

        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed !== '') filteredData[key] = trimmed;
          } else {
            filteredData[key] = val;
          }
        }
      }
      if (Object.keys(filteredData).length === 0) {
        return {
          statusCode: 400,
          message: 'No valid fields to update address',
        };
      }
      if (filteredData.pincode) {
        const pinRegex = /^[1-9][0-9]{5}$/;
        if (!pinRegex.test(filteredData.pincode)) {
          return { statusCode: 400, message: 'Invalid pincode format' };
        }
      }
      if (filteredData.status) {
        const validStatuses = Object.values(address_status);
        if (!validStatuses.includes(filteredData.status)) {
          return {
            statusCode: 400,
            message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
          };
        }
      }
      if (filteredData.type) {
        const validTypes = Object.values(address_type);

        if (!validTypes.includes(filteredData.type)) {
          return {
            statusCode: 400,
            message: `Invalid type. Allowed values: ${validTypes.join(', ')}`,
          };
        }
      }
      //   filteredData.updatedAt = new Date();

      if (userData) {
        filteredData.verifiedBy = userData;
      }
      const updatedAddress = await this.tenantPrisma.client.address.update({
        where: { addressID: Number(addressId) },
        data: filteredData,
      });
      return {
        addressId: updatedAddress.addressID,
        message: 'Address updated successfully',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  }

  async createEmployment(customerID: string, body: any, req: any) {
    try {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerID) },
      });
      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Profile',
        'add',
        'Employment Details',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message || 'You do not have permission to add Employeer',
        };
      }

      const allowedKeys = [
        'employerName',
        'totalExperience',
        'currentCompany',
        'address',
        'state',
        'city',
        'pincode',
        'status',
      ];

      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        const val = body[key];
        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed !== '') filteredData[key] = trimmed;
          } else {
            filteredData[key] = val;
          }
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return {
          statusCode: 400,
          message: 'No valid fields to create employer',
        };
      }

      const requiredFields = [
        'employerName',
        'totalExperience',
        'currentCompany',
        'address',
        'state',
        'city',
        'pincode',
        'status',
      ];
      for (const field of requiredFields) {
        if (!filteredData[field]) {
          return {
            statusCode: 400,
            message: `Missing required field: ${field}`,
          };
        }
      }

      const validStatuses = Object.values(employer_status);
      if (!validStatuses.includes(filteredData.status)) {
        return {
          statusCode: 400,
          message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
        };
      }

      const pinRegex = /^[1-9][0-9]{5}$/;
      if (!pinRegex.test(filteredData.pincode)) {
        return { statusCode: 400, message: 'Invalid pincode format' };
      }

      const newEmployer = await this.tenantPrisma.client.employer.create({
        data: {
          ...filteredData,
          createdDate: new Date(),
          customerID: Number(customerID),
          ...(filteredData.status === 'Verified' && {
            verifiedBy: userData || 1,
          }),
        } as any,
      });

      const tenant = await this.CibilService.getCurrentDomain(req);
      await this.cacheService.del(
        CacheKey.lead(tenant, Number(body.leadId), 'Profile'),
      );

      return {
        employerID: newEmployer.employerID,
        message: 'Employer added successfully',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Internal Server Error',
      };
    }
  }

  async updateEmployer(customerID, body, employerID, req) {
    try {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerID) },
      });
      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      const employer = await this.tenantPrisma.client.employer.findUnique({
        where: { employerID: Number(employerID) },
      });

      if (!employer) {
        return { statusCode: 404, message: 'Employer Details not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Profile',
        'edit',
        'Employment Details',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message ||
            'You do not have permission to edit Employeer',
        };
      }

      const allowedKeys = [
        'employerName',
        'address',
        'status',
        'city',
        'state',
        'pincode',
      ];

      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        const val = body[key];

        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed !== '') filteredData[key] = trimmed;
          } else {
            filteredData[key] = val;
          }
        }
      }
      if (Object.keys(filteredData).length === 0) {
        return {
          statusCode: 400,
          message: 'No valid fields to update employer',
        };
      }

      if (filteredData.status) {
        const validStatuses = Object.values(employer_status);
        if (!validStatuses.includes(filteredData.status)) {
          return {
            statusCode: 400,
            message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
          };
        }
      }

      if (userData) {
        filteredData.verifiedBy = userData;
      }
      const updatedEmployer = await this.tenantPrisma.client.employer.update({
        where: { employerID: Number(employerID) },
        data: filteredData,
      });

      const tenant = await this.CibilService.getCurrentDomain(req);
      await this.cacheService.del(
        CacheKey.lead(tenant, Number(body.leadId), 'Profile'),
      );
      return {
        employerID: updatedEmployer.employerID,
        message: 'Address updated successfully',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Internal Server Error',
      };
    }
  }

  async createCustomerReference(customerID, body, req: any) {
    try {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerID) },
      });
      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Profile',
        'add',
        'Reference Details',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message || 'You do not have permission to add Reference',
        };
      }

      const allowedKeys = [
        'relation',
        'name',
        'contactNo',
        'is_verified',
        'leadID',
      ];

      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        const val = body[key];

        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim();

            if (trimmed !== '') {
              filteredData[key] = trimmed;
            }
          } else {
            filteredData[key] = val;
          }
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return {
          statusCode: 400,
          message: 'No valid fields to create reference',
        };
      }
      const requiredFields = ['relation', 'name', 'contactNo', 'is_verified'];

      for (const field of requiredFields) {
        const value = filteredData[field];

        if (
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim() === '')
        ) {
          return {
            statusCode: 400,
            message: `Missing required field: ${field}`,
          };
        }
      }

      const mobileRegex = /^[6-9]\d{9}$/;

      if (!mobileRegex.test(filteredData.contactNo)) {
        return {
          statusCode: 400,
          message: 'Invalid mobile number format',
        };
      }

      const existingReference =
        await this.tenantPrisma.client.reference.findFirst({
          where: {
            contactNo: filteredData.contactNo,
            NOT: {
              customerID: Number(customerID),
            },
          },
        });

      if (existingReference) {
        return {
          statusCode: 400,
          message:
            'This contact number is already associated with another customer',
        };
      }

      const newReference = await this.tenantPrisma.client.reference.create({
        data: {
          ...filteredData,
          createdBy: userData || 1,
          customerID: Number(customerID),
        } as any,
      });

      const remarkData = {
        ...filteredData,
        ...(Object.prototype.hasOwnProperty.call(
          filteredData,
          'is_verified',
        ) && {
          is_verified:
            filteredData.is_verified === true ? 'verified' : 'not verified',
        }),
      };

      await this.tenantPrisma.client.callhistorylogs.create({
        data: {
          customerID: Number(customerID),
          leadID: Number(body.leadId),
          callType: 'Reference Added',
          status: 'Reference Added',
          remark: JSON.stringify(remarkData),
          calledBy: userData,
          noteli: '',
        },
      });

      const tenant = await this.CibilService.getCurrentDomain(req);
      await this.cacheService.del(
        CacheKey.lead(tenant, Number(body.leadId), 'Profile'),
      );

      return {
        referenceId: newReference.referenceID,
        message: 'Reference added successfully',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Internal Server Error',
      };
    }
  }

  async updateCustomerReference(customerID, referenceID, body, req) {
    try {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerID) },
      });
      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      const refrence = await this.tenantPrisma.client.reference.findUnique({
        where: { referenceID: Number(referenceID) },
      });

      if (!refrence) {
        return { statusCode: 404, message: 'Refrence Details not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Profile',
        'edit',
        'Reference Details',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message ||
            'You do not have permission to edit Reference',
        };
      }

      const allowedKeys = [
        'relation',
        'name',
        'contactNo',
        'is_verified',
        'leadID',
      ];

      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        const val = body[key];

        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed !== '') filteredData[key] = trimmed;
          } else {
            filteredData[key] = val;
          }
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return {
          statusCode: 400,
          message: 'No valid fields to update address',
        };
      }

      const existingReference =
        await this.tenantPrisma.client.reference.findFirst({
          where: {
            contactNo: refrence.contactNo,
            NOT: {
              customerID: Number(customerID),
            },
          },
        });

      if (existingReference) {
        return {
          statusCode: 400,
          message:
            'This contact number is already associated with another customer',
        };
      }

      const updatedReference = await this.tenantPrisma.client.reference.update({
        where: { referenceID: Number(referenceID) },
        data: filteredData,
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const remarkData = {
        ...filteredData,
        ...(Object.prototype.hasOwnProperty.call(
          filteredData,
          'is_verified',
        ) && {
          is_verified: filteredData.is_verified ? 'verified' : 'not verified',
        }),
      };

      const callHistory = await this.tenantPrisma.client.callhistorylogs.create(
        {
          data: {
            customerID: Number(customerID),
            leadID: Number(body.leadId),
            callType: 'Reference Update',
            status: 'Reference Update',
            remark: JSON.stringify(remarkData),
            calledBy: userData,
            noteli: '',
          },
        },
      );

      const tenant = await this.CibilService.getCurrentDomain(req);
      await this.cacheService.del(
        CacheKey.lead(tenant, Number(body.leadId), 'Profile'),
      );

      return {
        referenceId: updatedReference.referenceID,
        message: 'Reference updated successfully',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Internal Server Error',
      };
    }
  }

  async deleteReference(customerID, referenceID) {
    try {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerID) },
      });
      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      const refrence = await this.tenantPrisma.client.reference.findUnique({
        where: { referenceID: Number(referenceID) },
      });

      if (!refrence) {
        return { statusCode: 404, message: 'Refrence Details not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Profile',
        'delete',
        'Reference Details',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message ||
            'You do not have permission to delete Reference',
        };
      }

      // const deleteRerence = await this.tenantPrisma.client.reference.delete({
      //   where: { referenceID: Number(referenceID) },
      // });
      return {
        // referenceID: deleteRerence.referenceID,
        message: 'Reference delete successfully',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Internal Server Error',
      };
    }
  }

  async addIVRRemark(leadID, customerID, body: any, req: Request) {
    try {
      let domain;
      domain = await this.smsService.getCurrentDomain(req);

      const lead = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadID) },
        select: {
          status: true,
          loan: true,
        },
      });
      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      if (
        lead.status === 'Closed' ||
        lead.status === 'Disbursed' ||
        lead?.loan?.exported
      ) {
        return {
          statusCode: 404,
          message: lead?.loan?.exported
            ? `Case is already exported, Contact to Accounts team`
            : `Lead is ${lead.status} You cannot ADD IVR`,
        };
      }

      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerID) },
      });
      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'IVR',
        'add',
        'IVR',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message || 'You do not have permission to add IVR',
        };
      }

      const allowedKeys = ['status', 'remark'];
      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        const val = body[key];
        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim().replace(/,$/, ''); // also remove trailing comma
            if (trimmed !== '') filteredData[key] = trimmed;
          } else {
            filteredData[key] = val;
          }
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return { statusCode: 400, message: 'No valid fields to create' };
      }

      if (filteredData.status) {
        const validStatuses = Object.values(leads_status);
        if (!validStatuses.includes(filteredData.status as leads_status)) {
          return {
            statusCode: 400,
            message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
          };
        }
      }

      const requiredFields = ['status', 'remark'];
      for (const field of requiredFields) {
        if (!filteredData[field]) {
          return {
            statusCode: 400,
            message: `Missing required field: ${field}`,
          };
        }
      }

      // if (
      //   lead.status === 'Disbursed' &&
      //   (filteredData.status === 'Part_Payment' ||
      //     filteredData.status === 'Settlement' ||
      //     filteredData.status === 'Rejected' ||
      //     filteredData.status === 'Rejected_Process')
      // ) {
      //   return {
      //     statusCode: 400,
      //     message:
      //       'Lead is already in Disbursed Status. You cannot add IVR Mark.',
      //   };
      // }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await this.tenantPrisma.client.$transaction(async (tx) => {
        const callHistory = await tx.callhistory.create({
          data: {
            ...filteredData,
            calledBy: userData || 1,
            leadID: Number(leadID),
            callType: 'IVR',
            noteli: '',
            customerID: Number(customerID),
          } as any,
        });

        const callHistoryLogs = await tx.callhistorylogs.create({
          data: {
            ...filteredData,
            calledBy: userData || 1,
            callType: 'IVR',
            callbackTime: today,
            noteli: '',
            leadID: Number(leadID),
            customerID: Number(customerID),
          } as any,
        });

        const leadUpdate = await tx.leads.update({
          where: { leadID: Number(leadID) },
          data: { status: filteredData.status as leads_status },
        });

        const tenant = await this.CibilService.getCurrentDomain(req);
        await this.cacheService.del(
          CacheKey.lead(tenant, Number(leadID), 'Profile'),
        );
        await this.cacheService.del(
          CacheKey.lead(tenant, Number(leadID), 'LeadHistory'),
        );
        await this.cacheService.del(
          CacheKey.lead(tenant, Number(leadID), 'CIBIL'),
        );

        return {
          callHistoryID: callHistory.callHistoryID,
          callHistoryLogsID: callHistoryLogs.callHistoryID,
          leadID: leadUpdate.leadID,
        };
      });

      // 7️⃣ Success response
      return {
        callHistoryID: result.callHistoryID,
        message: 'IVR remark added successfully',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Transaction failed',
      };
    }
  }

  async addBankDetails(customerID, body, request, leadID) {
    try {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerID) },
      });
      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Bank Details',
        'add',
        'Bank Details',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message ||
            'You do not have permission to add Bank Detail',
        };
      }

      const checkLead = await this.tenantPrisma.client.leads.findUnique({
        where: {
          leadID: Number(leadID),
        },
        select: {
          status: true,
          leadID: true,
        },
      });

      if (
        checkLead?.status === 'Disbursed' ||
        checkLead?.status === 'Closed' ||
        checkLead?.status === 'Rejected' ||
        checkLead?.status === 'Disbursal_Sheet_Send'
      ) {
        return {
          statusCode: 400,
          message: `You can Not add Bank Because case Is in already ${checkLead?.status}`,
        };
      }

      const allowedKeys = [
        'accountType',
        'accountNo',
        'bankIfsc',
        'bank',
        'bankBranch',
        'bank_holder_name',
        // 'status',
      ];

      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        const val = body[key];

        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed !== '') filteredData[key] = trimmed;
          } else {
            filteredData[key] = val;
          }
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return {
          statusCode: 400,
          message: 'No valid fields to create customerAccount',
        };
      }

      // if (filteredData.status) {
      //   const validStatuses = Object.values(customeraccount_status);
      //   if (
      //     !validStatuses.includes(filteredData.status as customeraccount_status)
      //   ) {
      //     return {
      //       statusCode: 400,
      //       message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
      //     };
      //   }
      // }

      if (filteredData.accountType) {
        const validatetypes = Object.values(bankAccountTypes);
        if (
          !validatetypes.includes(
            filteredData.accountType as keyof typeof bankAccountTypes,
          )
        ) {
          return {
            statusCode: 400,
            message: `Invalid status. Allowed values: ${validatetypes.join(', ')}`,
          };
        }
      }

      const requiredFields = [
        'accountType',
        'accountNo',
        'bankIfsc',
        'bank',
        'bankBranch',
        'bank_holder_name',
        // 'status',
      ];
      for (const field of requiredFields) {
        if (!filteredData[field]) {
          return {
            statusCode: 400,
            message: `Missing required field: ${field}`,
          };
        }
      }

      if (filteredData.bank) {
        filteredData.bank = filteredData.bank.toUpperCase();
      }

      if (filteredData.bankBranch) {
        filteredData.bankBranch = filteredData.bankBranch.toUpperCase();
      }

      const bankAccountCreate =
        await this.tenantPrisma.client.customeraccount.create({
          data: {
            ...filteredData,
            status: customeraccount_status.Not_Verified,
            customerID: Number(customerID),
            leadID: Number(leadID),
            credatedBy: userData,
            ip: request.ip,
          } as any,
        });

      const createCallHistoryLogs =
        await this.tenantPrisma.client.callhistorylogs.create({
          data: {
            calledBy: userData,
            callType: 'editBankDetails',
            remark: bankAccountCreate.accountID.toString(),
            noteli: '',
            status: 'bankAccountChanged',
            leadID: Number(leadID),
            customerID: Number(customerID),
          } as any,
        });
      return {
        bankAcoountId: bankAccountCreate.accountID,
        message: 'Bank Account added successfully',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Transaction failed',
      };
    }
  }

  async updateBankDetails(customerID, accountID, leadID, body) {
    try {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerID) },
      });
      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      const bank = await this.tenantPrisma.client.customeraccount.findUnique({
        where: { accountID: Number(accountID) },
      });

      if (!bank) {
        return { statusCode: 404, message: 'Bank not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Bank Details',
        'edit',
        'Bank Details',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message ||
            'You do not have permission to edit Bank Detail',
        };
      }

      const checkLead = await this.tenantPrisma.client.leads.findUnique({
        where: {
          leadID: Number(leadID),
        },
        select: {
          status: true,
          leadID: true,
        },
      });

      if (
        checkLead?.status === 'Disbursed' ||
        checkLead?.status === 'Closed' ||
        checkLead?.status === 'Rejected' ||
        checkLead?.status === 'Disbursal_Sheet_Send'
      ) {
        return {
          statusCode: 400,
          message: `You can Not Edit Bank Because case Is in already ${checkLead?.status}`,
        };
      }

      const allowedKeys = [
        'accountType',
        'accountNo',
        'bankIfsc',
        'bank',
        'bankBranch',
        'bank_holder_name',
        // 'status',
      ];

      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        const val = body[key];

        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed !== '') filteredData[key] = trimmed;
          } else {
            filteredData[key] = val;
          }
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return {
          statusCode: 400,
          message: 'No valid fields to create customerAccount',
        };
      }

      if (filteredData.accountType) {
        const validatetypes = Object.values(bankAccountTypes);
        if (
          !validatetypes.includes(
            filteredData.accountType as keyof typeof bankAccountTypes,
          )
        ) {
          return {
            statusCode: 400,
            message: `Invalid status. Allowed values: ${validatetypes.join(', ')}`,
          };
        }
      }

      if (filteredData.bank) {
        filteredData.bank = filteredData.bank.toUpperCase();
      }

      if (filteredData.bankBranch) {
        filteredData.bankBranch = filteredData.bankBranch.toUpperCase();
      }

      const updatedBankAccount =
        await this.tenantPrisma.client.customeraccount.update({
          where: { accountID: Number(accountID) },
          data: {
            ...filteredData,
            status: customeraccount_status.Not_Verified,
            razorpay_fund_account_id: null,
          },
        });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const createCallHistoryLogs =
        await this.tenantPrisma.client.callhistorylogs.create({
          data: {
            calledBy: userData,
            callType: 'editBankDetails',
            remark: updatedBankAccount.accountID.toString(),
            noteli: '',
            status: 'bankAccountChanged',
            leadID: Number(leadID),
            customerID: Number(customerID),
          } as any,
        });

      return {
        bankAcoountId: updatedBankAccount.accountID,
        message: 'Bank Account update successfully',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Transaction failed',
      };
    }
  }

  async verifyBankDetails(customerID, accountID, leadID, body, req) {
    try {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { customerID: Number(customerID) },
      });
      if (!customer) {
        return { statusCode: 404, message: 'Customer not found' };
      }

      const bank = await this.tenantPrisma.client.customeraccount.findUnique({
        where: { accountID: Number(accountID) },
      });

      if (!bank) {
        return { statusCode: 404, message: 'Bank not found' };
      }

      let userData = await this.clsService.get('user');

      const permission = await this.authService.checkUserPermission(
        userData,
        'Bank Details',
        'edit',
        'Bank Details',
      );

      if (!permission.allowed) {
        return {
          statusCode: permission.statusCode || 403,
          message:
            permission.message ||
            'You do not have permission to edit Bank Detail',
        };
      }

      const allowedKeys = ['status'];

      const filteredData: Record<string, any> = {};

      for (const key of allowedKeys) {
        const val = body[key];

        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed !== '') filteredData[key] = trimmed;
          } else {
            filteredData[key] = val;
          }
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return {
          statusCode: 400,
          message: 'No valid fields to verify bank account!',
        };
      }
      let razorpay_fund_account_id = null;
      const domain = await this.smsService.getCurrentDomain(req);

      const allowedDomains = ['localhost'];

      if (allowedDomains.includes(domain)) {
        if (filteredData.status == 'Verified') {
          if (!bank.razorpay_fund_account_id) {
            const fundID = await this.addBankInRazorpayX(customer, bank);
            if (fundID.status) {
              razorpay_fund_account_id = fundID.id;
            } else {
              return {
                status: 'fail',
                statusCode: 400,
                message:
                  fundID?.message ||
                  'Issue in add bank in razorpay! May be bank details are incorrect!',
              };
            }
          }
        }
      }

      const verifiedBankAccount =
        await this.tenantPrisma.client.customeraccount.update({
          where: { accountID: Number(accountID) },
          data: {
            status: customeraccount_status.Verified,
            razorpay_fund_account_id,
          },
        });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const createCallHistoryLogs =
        await this.tenantPrisma.client.callhistorylogs.create({
          data: {
            calledBy: userData,
            callType: 'verifyBankDetails',
            remark: verifiedBankAccount.accountID.toString(),
            noteli: '',
            status: 'bankAccountVerified',
            leadID: Number(leadID),
            customerID: Number(customerID),
          } as any,
        });

      return {
        bankAcoountId: verifiedBankAccount.accountID,
        message: 'Bank Account verified successfully.',
        status: 'Success',
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Transaction failed',
      };
    }
  }

  async addBankInRazorpayX(customer: any, fund: any) {
    try {
      const apiKey = process.env.RAZORPAY_PAYOUT_KEY_ID;
      const apiSecret = process.env.RAZORPAY_PAYOUT_KEY_SECRET;
      const fundAccUrl = 'https://api.razorpay.com/v1/fund_accounts';
      const authHeader =
        'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

      const fa = await axios.post(
        fundAccUrl,
        {
          contact_id: customer.razorpay_contact_id,
          account_type: 'bank_account',
          bank_account: {
            name: fund.bank_holder_name,
            ifsc: fund.bankIfsc,
            account_number: fund.accountNo,
          },
        },
        {
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
        },
      );
      return {
        status: true,
        id: fa.data.id,
      };
    } catch (error: any) {
      console.error(
        'Error in prepareDisbursement:3',
        error.response.data.error,
      );
      return {
        status: false,
        message: error?.response?.data?.error?.description,
      };
    }
  }

  async getCustomerLocations(query: any) {
    const customerID = query.customerID;

    if (!customerID) {
      return { statusCode: 404, message: 'Customer not found' };
    }

    const locations =
      await this.tenantPrisma.client.customer_locations.findMany({
        where: { customerID: Number(customerID) },
        orderBy: { createdAt: 'desc' },
      });

    const updatedLocations = await Promise.all(
      locations.map(async (loc) => {
        if (!loc.latlongAddress || loc.locationType === 'login') {
          const latlng = `${Number(loc.latitude)},${Number(loc.longitude)}`;

          const res = await this.googleService.getlocation(latlng);

          if (res?.sucess) {
            const updated =
              await this.tenantPrisma.client.customer_locations.update({
                where: { id: loc.id },
                data: { latlongAddress: res.data },
              });

            return updated;
          }
        }
        return loc;
      }),
    );

    return {
      statusCode: 200,
      message: 'Customer locations fetched successfully',
      data: updatedLocations,
    };
  }

  async getCustomerContacts(query: any) {
    try {
      const { customerID, page = 1, limit = 10 } = query;

      if (!customerID) {
        return {
          statusCode: 400,
          message: 'customerID is required',
        };
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [data, total] = await Promise.all([
        this.tenantPrisma.client.customer_contact.findMany({
          where: { customerID: Number(customerID) },
          orderBy: { created_at: 'desc' },
          skip,
          take: Number(limit),
        }),
        this.tenantPrisma.client.customer_contact.count({
          where: { customerID: Number(customerID) },
        }),
      ]);

      return {
        statusCode: 200,
        message: 'Customer contacts fetched successfully',
        data: normalize(data),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        message: 'Error fetching customer contacts',
        error: error.message,
      };
    }
  }

  async getCustomerSms(query: any) {
    try {
      const { customerID, page = 1, limit = 10 } = query;

      if (!customerID) {
        return {
          statusCode: 400,
          message: 'customerID is required',
        };
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [data, total] = await Promise.all([
        this.tenantPrisma.client.customer_sms.findMany({
          where: { customerID: Number(customerID) },
          orderBy: { created_at: 'desc' },
          skip,
          take: Number(limit),
        }),
        this.tenantPrisma.client.customer_sms.count({
          where: { customerID: Number(customerID) },
        }),
      ]);

      return {
        statusCode: 200,
        message: 'Customer SMS fetched successfully',
        data: normalize(data),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        message: 'Error fetching customer SMS',
        error: error.message,
      };
    }
  }

  async getCustomerApps(query: any) {
    try {
      const { customerID, page = 1, limit = 10 } = query;

      if (!customerID) {
        return {
          statusCode: 400,
          message: 'customerID is required',
        };
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [data, total] = await Promise.all([
        this.tenantPrisma.client.customer_app.findMany({
          where: { customerID: Number(customerID) },
          orderBy: { created_at: 'desc' },
          skip,
          take: Number(limit),
        }),
        this.tenantPrisma.client.customer_app.count({
          where: { customerID: Number(customerID) },
        }),
      ]);

      return {
        statusCode: 200,
        message: 'Customer apps fetched successfully',
        data,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        message: 'Error fetching customer apps',
        error: error.message,
      };
    }
  }

  // async getRawDataAndDelete() {
  //   const prisma = this.tenantPrisma.client;

  //   try {
  //     const today = new Date();

  //     // Define UTC time range
  //     const startUTC = new Date(
  //       Date.UTC(
  //         today.getUTCFullYear(),
  //         today.getUTCMonth(),
  //         today.getUTCDate(),
  //         1,
  //         30,
  //         0,
  //         0,
  //       ),
  //     );

  //     const endUTC = new Date(
  //       Date.UTC(
  //         today.getUTCFullYear(),
  //         today.getUTCMonth(),
  //         today.getUTCDate(),
  //         12,
  //         19,
  //         0,
  //         0,
  //       ),
  //     );

  //     const whereCondition = {
  //       createdDate: {
  //         gte: startUTC,
  //         lte: endUTC,
  //       },
  //       step: null,
  //       utmSource: null,
  //     };

  //     const result = await prisma.$transaction(
  //       async (tx) => {
  //         // Get only IDs first for performance
  //         const ids = await tx.customerapp.findMany({
  //           where: whereCondition,
  //           select: { customerID: true },
  //         });

  //         const total = ids.length;
  //         if (total === 0) {
  //           return { total: 0, data: [] };
  //         }

  //         // Fetch detailed data separately (for return)
  //         const data = await tx.customerapp.findMany({
  //           where: { customerID: { in: ids.map((d) => d.customerID) } },
  //           orderBy: { createdDate: 'desc' },
  //           select: {
  //             customerID: true,
  //             mobile: true,
  //             step: true,
  //             createdDate: true,
  //             utmSource: true,
  //           },
  //         });

  //         // Delete records
  //         // await tx.customerapp.deleteMany({
  //         //   where: { customerID: { in: ids.map((d) => d.customerID) } },
  //         // });

  //         return { total, data };
  //       },
  //       {
  //         timeout: 20000,
  //         maxWait: 5000,
  //       },
  //     );

  //     return normalize(result);
  //   } catch (err:any) {
  //     console.error('Transaction failed:', err);
  //     throw err;
  //   }
  // }



  async getCustomerByID(
    id: string,
    req: Request,
  ) {
    try {
      if (!id || isNaN(Number(id))) {
        return {
          statusCode: 400,
          message: 'Invalid Customer ID',
        };
      }

      const customerId = Number(id);



      const domain =
        await this.smsService.getCurrentDomain(req);



      const journeyConfig =
        CUSTOMER_JOURNEY_CONFIG[domain] || CUSTOMER_JOURNEY_CONFIG['default'];


      const customer =
        await this.tenantPrisma.client.customer.findUnique({
          where: {
            customerID: customerId,
          },
          select: {
            customerID: true,
            name: true,
            mobile: true,
            email: true,
            alternateMobile: true,
            utmSource: true,
            createdDate: true,

            emailVerify: true,
            is_onboarded: true,

            pancard: true,
            aadharNo: true,

            salary_date: true,
            kyc_at: true,

            step: true,
            isVerified: true,



            customer_extended: {
              select: {
                selfieAttempts: true,
              },
            },


            employer: {
              take: 1,

              select: {
                employeeType: true,
                empSalary: true,
                employerName: true,
                empEmail: true,
                address: true,
              },
            },


            addresses: {
              take: 1,

              select: {
                address: true,
                city: true,
                state: true,
                pincode: true,
                type: true,
              },
            },


            document: {
              where: {
                documentType: 'selfie',
              },

              take: 1,

              orderBy: {
                uploadedDate: 'desc',
              },

              select: {
                documentFile: true,
                uploadedDate: true,
              },
            },



            bankstatement: {
              take: 1,

              orderBy: {
                uploadedDate: 'desc',
              },

              select: {
                id: true,
                uploadedDate: true,
              },
            },
            preoffer: {
              take: 1,
              orderBy: {
                createdDate: 'desc',
              },
              where: {
                type: 'Outbound',
              },
            },
            credforge_bre_log: {
              take: 1,

              orderBy: {
                createdAt: 'desc',
              },

              select: {
                id: true,
                status: true,
                responsePayload: true,
                workflowName: true,
                createdAt: true,
              },
            },

            leads: {
              take: 1,

              orderBy: {
                createdDate: 'desc',
              },

              select: {
                leadID: true,
                status: true,
                createdDate: true,
              },
            },
          },
        });

      if (!customer) {
        return {
          statusCode: 404,
          message: 'Customer not found',
        };
      }




      const initialPanLog =
        await this.tenantPrisma.client.finb_logs.findFirst({
          where: {
            customerID: customerId,

            pan: {
              not: null,
            },
          },

          orderBy: {
            createdDate: 'asc',
          },

          select: {
            id: true,
            pan: true,
            type: true,
            status: true,
            response: true,
            createdDate: true,
            updated_at: true,
          },
        });

      const address =
        customer.addresses?.[0] ?? null;

      const employment =
        customer.employer?.[0] ?? null;

      const selfie =
        customer.document?.[0] ?? null;

      const bankStatement =
        customer.bankstatement?.[0] ?? null;

      const breLog =
        customer.credforge_bre_log?.[0] ?? null;

      const preofferDecision =
        breLog?.status ?? null;

      const isPreOfferRejected =
        preofferDecision === 'Reject';





      const preofferWorkflow = breLog?.workflowName


      const isPreOfferGenerated = !!breLog;


      const offer = customer.preoffer[0] ?? null

      const lead =
        customer.leads?.[0] ?? null;


      const isOtpDone =
        !!customer.isVerified;

      const isPanDone =
        !!initialPanLog?.pan;

      const isBankCompleted = !!bankStatement;

      const isEmploymentDone =
        !!employment;

      const isKycDone =
        !!customer.pancard &&
        !!customer.aadharNo;

      const isSelfieDone =
        !!selfie?.documentFile;

      const isLoanOfferGenerated =
        !!offer;

      const hasPersonalDetails =
        !!address;



      const initialPan =
        initialPanLog?.pan ?? null;


      const selfieAttempts =
        Number(
          customer.customer_extended?.selfieAttempts ?? 0,
        );

      const isSelfieBlocked =
        selfieAttempts > 3;


      const breResponse: any =
        breLog?.responsePayload ?? null;



      const outputFeatures: any =
        breResponse?.output_data
          ?.features
          ?.output_features ?? {};



      const riskGrade = outputFeatures?.bureau?.cbs_risk_grade
      const workflowName =
        breLog?.workflowName?.toLowerCase() ?? '';

      const normalizedDomain =
        domain?.toLowerCase() ?? '';


      console.log(normalizedDomain, " normalizedDomain");
      console.log(normalizedDomain.includes('jetfund'), "normalizedDomain.includes('jetfund')");


      let isBankRequired = true;
      if (
        normalizedDomain.includes('jetfund')
      ) {
        isBankRequired =
          preofferDecision === 'Proceed to Bank';
      } else if (
        normalizedDomain.includes('cashmysalary')
      ) {
        const numericRiskGrade =
          Number(riskGrade);

        isBankRequired =
          !isNaN(numericRiskGrade) &&
          numericRiskGrade > 1;
      }
      else {
        isBankRequired = true;
      }


      const isBankDone =
        isBankRequired
          ? isBankCompleted
          : true;



      const cardCompleted: CardCompleted = {

        preoffer:
          isPreOfferGenerated,

        mobileOtp:
          isOtpDone,

        panVerification:
          isPanDone,

        bankVerification:
          isBankDone,

        employment:
          isEmploymentDone,

        loanOffer:
          isLoanOfferGenerated,

        personalDetails:
          hasPersonalDetails,

        kyc:
          isKycDone,

        selfie:
          isSelfieDone,

        refrence: false
      };



      const journeySteps =
        journeyConfig.steps.map(
          (step, index) => {

            const completed =
              cardCompleted[step.key];

            let required = true;

            // =====================================================
            // BANKING REQUIREMENT
            // =====================================================

            if (
              step.key === 'bankVerification'
            ) {
              required =
                isBankRequired;
            }

            // =====================================================
            // STATUS
            // =====================================================

            let status:
              | 'completed'
              | 'pending'
              | 'skipped';

            if (!required) {

              status = 'skipped';

            } else if (completed) {

              status = 'completed';

            } else {

              status = 'pending';

            }

            return {

              step:
                index + 1,

              key:
                step.key,

              title:
                step.title,

              required,

              status,

              completed,
            };
          },
        );


      let currentStep = 0;



      for (
        let index = 0;
        index < journeyConfig.steps.length;
        index++
      ) {

        const step =
          journeyConfig.steps[index];

        const completed =
          cardCompleted[step.key];

        const required =
          step.key === 'bankVerification'
            ? isBankRequired
            : true;

        // -------------------------------------------------------
        // Optional/skipped step
        // -------------------------------------------------------

        if (!required) {

          currentStep =
            index + 1;

          continue;
        }

        // -------------------------------------------------------
        // Required + completed
        // -------------------------------------------------------

        if (completed) {

          currentStep =
            index + 1;

          continue;
        }

        // -------------------------------------------------------
        // Required + pending
        // -------------------------------------------------------

        break;
      }

      const totalSteps =
        journeyConfig.steps.length;

      const completionPercentage =
        totalSteps > 0
          ? Math.round(
            (currentStep / totalSteps) * 100,
          )
          : 0;



      return normalize({
        statusCode: 200,

        message:
          'Customer fetched successfully',

        data: {


          domain,

          customer: {

            customerID:
              customer.customerID,

            name:
              customer.name,

            mobile:
              customer.mobile,

            email:
              customer.email,

            alternateMobile:
              customer.alternateMobile,

            utmSource:
              customer.utmSource,

            createdDate:
              customer.createdDate,

            isOnboarded:
              customer.is_onboarded,
          },



          journey: {

            currentStep,

            totalSteps,

            completionPercentage,

            steps:
              journeySteps,
          },


          cards: {

            mobileOtp: {

              title:
                'Mobile & OTP Verification',

              status:
                isOtpDone
                  ? 'completed'
                  : 'pending',

              completed:
                isOtpDone,

              data: {

                mobile:
                  customer.mobile,

                mobileVerified:
                  isOtpDone,

                verified:
                  isOtpDone,
              },
            },



            panVerification: {

              title:
                'PAN Verification',

              status:
                isPanDone
                  ? 'completed'
                  : 'pending',

              completed:
                isPanDone,

              data: {


                initialPan,

                initialPanEntered:
                  !!initialPan,

                initialPanAt:
                  initialPanLog?.createdDate ??
                  null,

                initialPanStatus:
                  initialPanLog?.status ??
                  null,

                initialPanType:
                  initialPanLog?.type ??
                  null,


                verifiedPan:
                  customer.pancard,

                panAvailable:
                  !!customer.pancard,

                verified:
                  isPanDone,
              },
            },

            preoffer: {
              title: 'Pre-Offer',
              status: isPreOfferGenerated ? 'completed' : 'pending',
              completed: isPreOfferGenerated,

              data: {
                decision: preofferDecision,

                workflow: preofferWorkflow,

                isRejected: isPreOfferRejected,

                rejectionReason: preofferWorkflow,

                createdAt: breLog?.createdAt ?? null,
              },
            },



            bankVerification: {

              title:
                'Bank Verification',

              status:
                !isBankRequired
                  ? 'skipped'
                  : isBankCompleted
                    ? 'completed'
                    : 'pending',

              completed:
                isBankDone,

              required:
                isBankRequired,

              data: {

                bankingRequired:
                  isBankRequired,

                bankingCompleted:
                  isBankCompleted,

                bankStatementUploaded:
                  isBankCompleted,

                bankStatementId:
                  bankStatement?.id ?? null,

                uploadedAt:
                  bankStatement?.uploadedDate ?? null,

                reason:
                  isBankRequired
                    ? normalizedDomain.includes('jetfund')
                      ? 'bank_bre'
                      : 'risk_grade_greater_than_1'
                    : 'banking_not_required',
              },
            },

            employment: {

              title:
                'Employment Details',

              status:
                isEmploymentDone
                  ? 'completed'
                  : 'pending',

              completed:
                isEmploymentDone,

              data: {

                employeeType:
                  employment?.employeeType ??
                  null,

                employerName:
                  employment?.employerName ??
                  null,

                salary:
                  employment?.empSalary ??
                  null,

                employerEmail:
                  employment?.empEmail ??
                  null,

                employerAddress:
                  employment?.address ??
                  null,

                salaryDate:
                  customer.salary_date ??
                  null,
              },
            },



            loanOffer: {

              title:
                'Loan Offer',

              status:
                isLoanOfferGenerated
                  ? 'completed'
                  : 'pending',

              completed:
                isLoanOfferGenerated,

              completedAt:
                breLog?.createdAt ??
                null,

              data: {

                decision:
                  breLog?.status ??
                  null,

                riskGrade,

              },
            },


            personalDetails: {

              title:
                'Personal Details',

              status:
                hasPersonalDetails
                  ? 'completed'
                  : 'pending',

              completed:
                hasPersonalDetails,

              data: {

                name:
                  customer.name,

                email:
                  customer.email,

                alternateMobile:
                  customer.alternateMobile,

                address: {

                  address:
                    address?.address ??
                    null,

                  city:
                    address?.city ??
                    null,

                  state:
                    address?.state ??
                    null,

                  pincode:
                    address?.pincode?.toString() ??
                    null,

                  type:
                    address?.type ??
                    null,
                },
              },
            },


            kyc: {

              title:
                'KYC Verification',

              status:
                isKycDone
                  ? 'completed'
                  : 'pending',

              completed:
                isKycDone,

              data: {

                panVerified:
                  !!customer.pancard,

                aadharVerified:
                  !!customer.aadharNo,

                kycCompleted:
                  isKycDone,

                kycAt:
                  customer.kyc_at,

                pan:
                  customer.pancard,

                aadhar:
                  customer.aadharNo,
              },
            },


            selfie: {

              title:
                'Selfie Verification',

              status:
                isSelfieDone
                  ? 'completed'
                  : 'pending',

              completed:
                isSelfieDone,

              data: {

                uploaded:
                  isSelfieDone,

                uploadedAt:
                  selfie?.uploadedDate ??
                  null,

                attempts:
                  selfieAttempts,

                maxAttempts:
                  3,

                isBlocked:
                  isSelfieBlocked,
              },
            },
          },



          additional: {

            initialPan: {

              pan:
                initialPan,

              source:
                initialPanLog
                  ? 'finb_logs'
                  : null,

              type:
                initialPanLog?.type ??
                null,

              status:
                initialPanLog?.status ??
                null,

              createdDate:
                initialPanLog?.createdDate ??
                null,
            },
          },
        },
      });

    } catch (error: any) {

      console.error(
        'getCustomerByID error:',
        error,
      );

      return {
        statusCode: 500,

        message:
          error?.message ||
          'Something went wrong.',
      };
    }
  }

  async getCriffData(customerId: string, req: Request) {
    try {

      const criff = await this.tenantPrisma.client.criffsoftpull.findFirst({
        where: { customerID: Number(customerId) },
        select: {
          responsePayload: true
        }
      });



      if (criff == null) {
        return {
          statusCode: 500,
          success: true,
          message: 'CRIF Softpull Data  Not Found',
          data: null,
        }
      }


      return {
        statusCode: 200,
        success: true,
        message: 'CRIF Softpull Data Fetched  ',
        data: criff.responsePayload,
      };



    } catch (err) {
      console.log(err);
      return {
        statusCode: 500,
        success: false,
        message: 'CRIF Softpull Data  Not Found',
        data: null,
      }

    }
  }
}
