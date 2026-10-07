export const addressStatus = {
  Permanent_Address: 'Permanent Address',
  Current_Address: 'Current Address',
  Rent: 'Rent',
  Owned: 'Owned',
};

export const addressTypes = {
  Verified: 'Verified',
  Not_Verified: 'Not Verified',
};

export const leadsStatus = {
  FreshLead: 'Fresh_Lead',
  Callback: 'Callback',
  Interested: 'Interested',
  Not_Interested: 'Not_Interested',
  WrongNumber: 'Wrong_Number',
  DocumentReceived: 'Document_Received',
  Approved: 'Approved',
  Hold: 'Hold',
  DisbursalSheetSend: 'Disbursal_Sheet_Send',
  Disbursed: 'Disbursed',
  Closed: 'Closed',
  PartPayment: 'Part_Payment',
  Settlement: 'Settlement',
};

export const bankAccountTypes = {
  SAVING: 'SAVING',
  CURRENT: 'CURRENT',
};

export const RolesTypes = {
  ADMIN: 'Admin',
  CREDIT_TEAM: 'Credit Team',
  CREDIT_HEAD: 'Credit Head',
  CALLING_HEAD: 'Calling Head',
  CALLING_TEAM: 'Calling Team',
  COLLECTION_TEAM: 'Collection Team',
  COLLECTION_HEAD: 'Collection Head',
  SUPER_ADMIN: 'Super Admin',
  DISBURSAL_TEAM: 'Disbursal Team',
  DISBURSAL_HEAD: 'Disbursal Head',
  IT_TEAM: 'IT Team',
  COMPLAINCE_TEAM: 'Compliance Team',
  AUDITOR: 'Auditor',
  LEGAL_DEPARTMENT: 'Legal Department',
  MARKETING_TEAM: 'Marketing Team',
};

export const READ_ONLY_ROLES = [
  RolesTypes.IT_TEAM,
  RolesTypes.COMPLAINCE_TEAM,
  RolesTypes.AUDITOR,
  RolesTypes.LEGAL_DEPARTMENT,
  RolesTypes.MARKETING_TEAM,
];

export const HeadRoles = {
  ADMIN: 'Admin',
  CREDIT_HEAD: 'Credit Head',
  CALLING_HEAD: 'Calling Head',
  COLLECTION_HEAD: 'Collection Head',
  SUPER_ADMIN: 'Super Admin',
  DISBURSAL_HEAD: 'Disbursal Head',
  READ_ROLE: "Read Role"
};

export const PostMethodSTOPRoles = {
  IT_TEAM: 'IT Team',
  COMPLAINCE_TEAM: 'Compliance Team',
  AUDITOR: 'Auditor',
}

export enum disbursalPayoutStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  PAYOUT_INITIATED = 'PAYOUT_INITIATED',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

export enum PayoutStatus {
  APPROVAL_PENDING = 'APPROVAL_PENDING',
  HOLD = 'HOLD',
  APPROVED = 'APPROVED',
  QUEUED = 'QUEUED',
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
  REVERSED = 'REVERSED',
}

export enum PayoutGenerateStatus {
  Approved = 'Approved',
}

export const bucketKeyMap: any = {
  Calling: {
    call: "last_call_assign_user_id",
    presales: "last_presales_assigned_userid",
  },
  Credit: {
    sanctional: "last_sanctionallo_user_id",
    repeat: "last_repeat_sanctionallo_user_id",
  },
  Collection: {
    collection: "last_collection_user_id",
  },
};

export const SmsType: any = {
  JOURNEY_COMPLETE: 'journey_complete_reminder',
  PAYMENT_LINK: 'payment_link',
  PRE_APPROVED_LOAN: 'pre_approved_loan',
}

export enum VendorType {
  PARENT = 0,
  CHILD = 1,
}

export enum CommissionType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
  SLAB = 'SLAB',
  CUSTOM_LEAD = 'CUSTOM_LEAD',
}

export const dsaModulePermissions = {
  Campaign: {
    Menu: "Campaign_Menu",
    Add: "Campaign_Add",
    Edit: "Campaign_Edit",
    Delete: "Campaign_Delete",
    Read: "Campaign_Read",
    Copy_Link: "Campaign_Copy_Link",
    Logs: "Campaign_Logs",
    Parent_add: "Campaign_Parent_Add",
  },
  Customers: {
    Menu: "Customers_Menu",
    Add: "Customers_Add",
    Edit: "Customers_Edit",
    Delete: "Customers_Delete",
    Read: "Customers_Read"
  },
  Dashboard: {
    Menu: "Dashboard_Menu",
    Add: "Dashboard_Add",
    Edit: "Dashboard_Edit",
    Delete: "Dashboard_Delete",
    Read: "Dashboard_Read"
  },
  Reports: {
    Menu: "Reports_Menu",
    Add: "Reports_Add",
    Edit: "Reports_Edit",
    Delete: "Reports_Delete",
    Read: "Reports_Read"
  },
  Roles: {
    Menu: "Roles_Menu",
    Add: "Roles_Add",
    Edit: "Roles_Edit",
    Delete: "Roles_Delete",
    Read: "Roles_Read"
  },
  Vendors: {
    Menu: "Vendors_Menu",
    Add: "Vendors_Add",
    Edit: "Vendors_Edit",
    Delete: "Vendors_Delete",
    Read: "Vendors_Read"
  }
}

export const dhawaniAgent = {
  outbound: {
    speedoloan: {
      preDue: "Pre Due",
      postDue: "Post Due",
      preDueMale: "PreDue Male"
    }
  },
  inbound: {
    default: "default"
  }
}